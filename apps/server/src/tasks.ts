import {
  POSITION_STEP,
  syncMutationSchema,
  type IsoDate,
  type SyncMutation,
  type SyncResult,
  type Task,
} from '@tudu/core';
import { and, asc, count, eq, gte, inArray, isNull, lt, lte, schema, sql, type Db } from '@tudu/db';
import type { TaskClocks } from '@tudu/db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

/** A change the server will never apply: the client undoes it and says why. */
export class Rejected extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const NOT_YOURS = 'You can’t change tasks in that space.';
const GONE = 'That task isn’t there any more.';
const DELETED = 'That task was deleted.';

/** The role a person has in a space, or null when they are not in it. */
export async function roleIn(db: Executor, userId: string, spaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: schema.spaceMembers.role })
    .from(schema.spaceMembers)
    .where(and(eq(schema.spaceMembers.spaceId, spaceId), eq(schema.spaceMembers.userId, userId)));
  return row?.role ?? null;
}

/** Everyone in a space, for the live stream. */
export async function membersOf(db: Executor, spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.spaceMembers.userId })
    .from(schema.spaceMembers)
    .where(eq(schema.spaceMembers.spaceId, spaceId));
  return rows.map((r) => r.userId);
}

const taskColumns = {
  id: schema.tasks.id,
  spaceId: schema.tasks.spaceId,
  number: schema.tasks.number,
  prefix: schema.spaces.taskPrefix,
  title: schema.tasks.title,
  day: schema.tasks.day,
  position: schema.tasks.position,
  doneAt: schema.tasks.doneAt,
  carriedFrom: schema.tasks.carriedFrom,
  createdAt: schema.tasks.createdAt,
  updatedAt: schema.tasks.updatedAt,
};

type TaskRow = {
  id: string;
  spaceId: string;
  number: number;
  prefix: string;
  title: string;
  day: string | null;
  position: number;
  doneAt: Date | null;
  carriedFrom: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    spaceId: r.spaceId,
    number: r.number,
    ref: `${r.prefix}-${r.number}`,
    title: r.title,
    day: r.day,
    position: r.position,
    done: r.doneAt !== null,
    doneAt: r.doneAt?.toISOString() ?? null,
    carriedFrom: r.carriedFrom,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The tasks of one day in a space, in order. */
export async function tasksOfDay(db: Executor, spaceId: string, day: IsoDate): Promise<Task[]> {
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(eq(schema.tasks.spaceId, spaceId), eq(schema.tasks.day, day), isNull(schema.tasks.deletedAt)))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt));
  return rows.map(toTask);
}

export async function tasksById(db: Executor, ids: string[]): Promise<Task[]> {
  if (!ids.length) return [];
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(inArray(schema.tasks.id, ids), isNull(schema.tasks.deletedAt)));
  return rows.map(toTask);
}

/** How many tasks each day between `from` and `to` holds. */
export async function marksOf(
  db: Executor,
  spaceId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ day: schema.tasks.day, n: count() })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        gte(schema.tasks.day, from),
        lte(schema.tasks.day, to),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .groupBy(schema.tasks.day);
  const marks: Record<string, number> = {};
  for (const r of rows) if (r.day) marks[r.day] = r.n;
  return marks;
}

/**
 * Carry unfinished tasks forward: every open task planned before `today` moves to the top of today, keeping its
 * order (oldest day first), and remembers the day it first came from. Runs once per day per space; asking again
 * does nothing.
 * Returns the days that changed.
 */
export async function rollForward(db: Db, spaceId: string, today: IsoDate): Promise<IsoDate[]> {
  return db.transaction(async (tx) => {
    const [space] = await tx
      .select({ rolledTo: schema.spaces.rolledTo })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, spaceId))
      .for('update');
    if (!space || (space.rolledTo && space.rolledTo >= today)) return [];
    const open = await tx
      .select({ id: schema.tasks.id, day: schema.tasks.day, carriedFrom: schema.tasks.carriedFrom })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.spaceId, spaceId),
          lt(schema.tasks.day, today),
          isNull(schema.tasks.doneAt),
          isNull(schema.tasks.deletedAt),
        ),
      )
      .orderBy(asc(schema.tasks.day), asc(schema.tasks.position), asc(schema.tasks.createdAt))
      .for('update');
    await tx.update(schema.spaces).set({ rolledTo: today }).where(eq(schema.spaces.id, spaceId));
    if (!open.length) return [];
    const [top] = await tx
      .select({ min: sql<number | null>`min(${schema.tasks.position})` })
      .from(schema.tasks)
      .where(
        and(eq(schema.tasks.spaceId, spaceId), eq(schema.tasks.day, today), isNull(schema.tasks.deletedAt)),
      );
    const first = top?.min ?? null;
    const now = new Date();
    // The field clocks are left alone: carrying is automatic, so any change a person made (even one still on its
    // way from a laptop that was offline) wins over it.
    for (let i = 0; i < open.length; i++) {
      const t = open[i]!;
      const position = first === null ? (i + 1) * POSITION_STEP : first - (open.length - i) * POSITION_STEP;
      await tx
        .update(schema.tasks)
        .set({ day: today, position, carriedFrom: t.carriedFrom ?? t.day, updatedAt: now })
        .where(eq(schema.tasks.id, t.id));
    }
    return [today, ...new Set(open.map((t) => t.day!))];
  });
}

/** True when a write made at `at` is at least as new as the field's last write. */
function newer(at: string, clock: string | undefined): boolean {
  return !clock || Date.parse(at) >= Date.parse(clock);
}

export interface Applied {
  taskId: string;
  spaceId: string;
  days: Array<IsoDate | null>;
  deleted?: boolean;
}

/** Apply one mutation for `userId`, once. Throws Rejected for a change that will never apply. */
export async function applyMutation(db: Db, userId: string, raw: unknown): Promise<Applied | null> {
  const parsed = syncMutationSchema.safeParse(raw);
  if (!parsed.success)
    throw new Rejected(400, parsed.error.issues[0]?.message ?? 'That change is not valid.');
  const m = parsed.data;
  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(schema.appliedMutations)
      .values({ id: m.id, userId })
      .onConflictDoNothing()
      .returning({ id: schema.appliedMutations.id });
    if (!claimed.length) {
      // Already applied: nothing changes, and the client gets the row as it is.
      const [t] = await tx
        .select({ spaceId: schema.tasks.spaceId, day: schema.tasks.day })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, m.payload.id));
      return t ? { taskId: m.payload.id, spaceId: t.spaceId, days: [] } : null;
    }
    return m.type === 'task.create' ? create(tx, userId, m) : change(tx, userId, m);
  });
}

/** The position after the last task of a day (or of the Backlog). */
async function endOf(tx: Tx, spaceId: string, day: IsoDate | null): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${schema.tasks.position})` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        day === null ? isNull(schema.tasks.day) : eq(schema.tasks.day, day),
        isNull(schema.tasks.deletedAt),
      ),
    );
  return (row?.max ?? 0) + POSITION_STEP;
}

async function create(
  tx: Tx,
  userId: string,
  m: Extract<SyncMutation, { type: 'task.create' }>,
): Promise<Applied> {
  const p = m.payload;
  if (!(await roleIn(tx, userId, p.spaceId))) throw new Rejected(403, NOT_YOURS);
  const [existing] = await tx
    .select({ spaceId: schema.tasks.spaceId })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, p.id));
  if (existing) {
    if (existing.spaceId !== p.spaceId) throw new Rejected(400, 'That task already exists.');
    return { taskId: p.id, spaceId: p.spaceId, days: [] };
  }
  // The space's row lock hands out numbers one at a time, so two clients never get the same one.
  const [seq] = await tx
    .update(schema.spaces)
    .set({ taskSeq: sql`${schema.spaces.taskSeq} + 1` })
    .where(eq(schema.spaces.id, p.spaceId))
    .returning({ n: schema.spaces.taskSeq });
  const clocks: TaskClocks = { title: m.at, done: m.at, place: m.at, carried: m.at, deleted: m.at };
  await tx.insert(schema.tasks).values({
    id: p.id,
    spaceId: p.spaceId,
    number: seq!.n,
    title: p.title,
    day: p.day,
    position: p.position ?? (await endOf(tx, p.spaceId, p.day)),
    createdBy: userId,
    clocks,
  });
  return { taskId: p.id, spaceId: p.spaceId, days: [p.day] };
}

async function change(
  tx: Tx,
  userId: string,
  m: Exclude<SyncMutation, { type: 'task.create' }>,
): Promise<Applied> {
  const [t] = await tx
    .select({
      spaceId: schema.tasks.spaceId,
      day: schema.tasks.day,
      deletedAt: schema.tasks.deletedAt,
      clocks: schema.tasks.clocks,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, m.payload.id))
    .for('update');
  if (!t) throw new Rejected(404, GONE);
  if (!(await roleIn(tx, userId, t.spaceId))) throw new Rejected(403, NOT_YOURS);
  const base: Applied = { taskId: m.payload.id, spaceId: t.spaceId, days: [t.day] };
  if (t.deletedAt) {
    if (m.type === 'task.delete') return { ...base, days: [], deleted: true };
    throw new Rejected(410, DELETED);
  }
  const clocks: TaskClocks = { ...t.clocks };
  const set: Partial<typeof schema.tasks.$inferInsert> = {};
  const days: Array<IsoDate | null> = [t.day];
  switch (m.type) {
    case 'task.rename':
      if (newer(m.at, clocks.title)) {
        set.title = m.payload.title;
        clocks.title = m.at;
      }
      break;
    case 'task.cross':
      if (newer(m.at, clocks.done)) {
        set.doneAt = m.payload.done ? new Date(m.at) : null;
        clocks.done = m.at;
      }
      break;
    case 'task.place':
      if (newer(m.at, clocks.place)) {
        set.day = m.payload.day;
        set.position = m.payload.position ?? (await endOf(tx, t.spaceId, m.payload.day));
        clocks.place = m.at;
        if (m.payload.day !== t.day) {
          days.push(m.payload.day);
          // A task moved to another day has found its place: it no longer carries the marker.
          if (newer(m.at, clocks.carried)) {
            set.carriedFrom = null;
            clocks.carried = m.at;
          }
        }
      }
      break;
    case 'task.keep':
      if (newer(m.at, clocks.carried)) {
        set.carriedFrom = null;
        clocks.carried = m.at;
      }
      break;
    case 'task.delete':
      if (newer(m.at, clocks.deleted)) {
        set.deletedAt = new Date(m.at);
        clocks.deleted = m.at;
      }
      break;
  }
  if (!Object.keys(set).length) return { ...base, days: [] };
  await tx
    .update(schema.tasks)
    .set({ ...set, clocks, updatedAt: new Date() })
    .where(eq(schema.tasks.id, m.payload.id));
  return { ...base, days, deleted: set.deletedAt ? true : undefined };
}

/** Apply a batch in order. Each mutation stands alone: a rejected one does not stop the rest. */
export async function applyBatch(
  db: Db,
  userId: string,
  mutations: unknown[],
): Promise<{ results: SyncResult[]; applied: Applied[] }> {
  const results: SyncResult[] = [];
  const applied: Applied[] = [];
  for (const raw of mutations) {
    const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : '';
    try {
      const a = await applyMutation(db, userId, raw);
      if (a) applied.push(a);
      results.push({ id, status: 'ok' });
    } catch (err) {
      if (!(err instanceof Rejected)) throw err;
      results.push({ id, status: 'rejected', code: err.code, error: err.message });
    }
  }
  return { results, applied };
}
