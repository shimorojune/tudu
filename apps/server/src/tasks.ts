import {
  addDays,
  cleanHtml,
  fileSize,
  isEmptyHtml,
  isProjectMutation,
  LOOKALIKE_MIN,
  lookAlikes,
  nextProjectColor,
  POSITION_STEP,
  rankSearch,
  searchTokens,
  syncMutationSchema,
  taskIdOf,
  textOf,
  wordsOf,
  type Comment,
  type HistoryEvent,
  type IsoDate,
  type Project,
  type SearchHit,
  type Subtask,
  type SyncMutation,
  type SyncResult,
  type Task,
  type TaskDetail,
} from '@tudu/core';
import { and, asc, count, eq, gte, inArray, isNull, lt, lte, or, schema, sql, type Db } from '@tudu/db';
import type { SubtaskClocks, TaskClocks } from '@tudu/db/schema';

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
const NOT_YOUR_COMMENT = 'Only the person who wrote a comment can change it.';

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
  dueDay: schema.tasks.dueDay,
  visibility: schema.tasks.visibility,
  projectId: schema.tasks.projectId,
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
  dueDay: string | null;
  visibility: 'space' | 'me';
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

interface Counts {
  subtasks: Subtask[];
  commentCount: number;
}

export function toTask(r: TaskRow, c: Counts = { subtasks: [], commentCount: 0 }): Task {
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
    due: r.dueDay,
    visibility: r.visibility,
    projectId: r.projectId,
    subtasks: c.subtasks,
    subsDone: c.subtasks.filter((s) => s.done).length,
    subsTotal: c.subtasks.length,
    commentCount: c.commentCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** What each row needs beyond its own columns: its subtasks (for the fold) and how many comments. */
async function countsFor(db: Executor, ids: string[]): Promise<Map<string, Counts>> {
  const out = new Map<string, Counts>();
  if (!ids.length) return out;
  const subs = await db
    .select()
    .from(schema.subtasks)
    .where(and(inArray(schema.subtasks.taskId, ids), isNull(schema.subtasks.deletedAt)))
    .orderBy(asc(schema.subtasks.position), asc(schema.subtasks.createdAt));
  const cms = await db
    .select({ taskId: schema.comments.taskId, n: count() })
    .from(schema.comments)
    .where(and(inArray(schema.comments.taskId, ids), isNull(schema.comments.deletedAt)))
    .groupBy(schema.comments.taskId);
  const get = (id: string) => out.get(id) ?? { subtasks: [], commentCount: 0 };
  for (const s of subs) {
    const c = get(s.taskId);
    out.set(s.taskId, { ...c, subtasks: [...c.subtasks, toSubtask(s)] });
  }
  for (const c of cms) out.set(c.taskId, { ...get(c.taskId), commentCount: c.n });
  return out;
}

async function withCounts(db: Executor, rows: TaskRow[]): Promise<Task[]> {
  const counts = await countsFor(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toTask(r, counts.get(r.id)));
}

/** The tasks of one day in a space, in order. */
export async function tasksOfDay(db: Executor, spaceId: string, day: IsoDate): Promise<Task[]> {
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(eq(schema.tasks.spaceId, spaceId), eq(schema.tasks.day, day), isNull(schema.tasks.deletedAt)))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt));
  return withCounts(db, rows);
}

/** The tasks with no day (the Backlog) in a space, in order. */
export async function tasksOfBacklog(db: Executor, spaceId: string): Promise<Task[]> {
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(eq(schema.tasks.spaceId, spaceId), isNull(schema.tasks.day), isNull(schema.tasks.deletedAt)))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt));
  return withCounts(db, rows);
}

const searchColumns = {
  id: schema.tasks.id,
  number: schema.tasks.number,
  prefix: schema.spaces.taskPrefix,
  title: schema.tasks.title,
  day: schema.tasks.day,
  doneAt: schema.tasks.doneAt,
  projectId: schema.tasks.projectId,
  notesText: schema.tasks.notesText,
};
type SearchRow = {
  id: string;
  number: number;
  prefix: string;
  title: string;
  day: string | null;
  doneAt: Date | null;
  projectId: string | null;
  notesText: string;
};

/** At most this many rows are read for one search before the ranking picks the best. */
const SEARCH_CANDIDATES = 400;
/** At most this many hits go back. */
export const SEARCH_LIMIT = 30;

function toHit(r: SearchRow, snippet: string | null = null): SearchHit {
  return {
    id: r.id,
    ref: `${r.prefix}-${r.number}`,
    title: r.title,
    day: r.day,
    done: r.doneAt !== null,
    projectId: r.projectId,
    snippet,
  };
}

/** A word as a pattern for ILIKE: its own wildcards escaped. */
function like(word: string): string {
  return `%${word.replace(/[\\%_]/g, '\\$&')}%`;
}

/** The task's number when the words are a task ID typed in full ("ME-52"), else null. */
function numberOf(q: string): number | null {
  const m = /^[a-z][a-z0-9]*-(\d+)$/i.exec(q.trim());
  return m ? Number(m[1]) : null;
}

/**
 * The best matches in a space for the words typed: Postgres finds the rows where any word is in the title, the
 * ID or the notes' text, and the ranking shared with the client puts them in order, every word required.
 */
export async function searchTasks(db: Executor, spaceId: string, q: string, today: IsoDate): Promise<SearchHit[]> {
  const toks = searchTokens(q);
  if (!toks.length) return [];
  const n = numberOf(q);
  const words = toks.map((w) => or(sql`${schema.tasks.title} ILIKE ${like(w)}`, sql`${schema.tasks.notesText} ILIKE ${like(w)}`)!);
  const rows: SearchRow[] = await db
    .select(searchColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        isNull(schema.tasks.deletedAt),
        or(...words, ...(n === null ? [] : [eq(schema.tasks.number, n)])),
      ),
    )
    .orderBy(asc(schema.tasks.day), asc(schema.tasks.position), asc(schema.tasks.createdAt))
    .limit(SEARCH_CANDIDATES);
  const ranked = rankSearch(
    rows.map((r) => ({ row: r, ref: `${r.prefix}-${r.number}`, title: r.title, day: r.day, done: r.doneAt !== null, notes: r.notesText })),
    q,
    today,
    SEARCH_LIMIT,
  );
  return ranked.map((h) => toHit(h.item.row, h.snippet));
}

/** Open tasks in a space that read like the title (Quick Add's "Looks like a task you have"), the closest first. */
export async function lookAlikeTasks(db: Executor, spaceId: string, title: string): Promise<SearchHit[]> {
  const ws = wordsOf(title);
  if (!ws.length || title.trim().length < LOOKALIKE_MIN) return [];
  const rows: SearchRow[] = await db
    .select(searchColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        isNull(schema.tasks.deletedAt),
        isNull(schema.tasks.doneAt),
        or(...ws.map((w) => sql`${schema.tasks.title} ILIKE ${like(w.slice(0, 5))}`)),
      ),
    )
    .orderBy(asc(schema.tasks.day), asc(schema.tasks.position), asc(schema.tasks.createdAt))
    .limit(SEARCH_CANDIDATES);
  return lookAlikes(
    rows.map((r) => ({ row: r, title: r.title, done: false })),
    title,
  ).map((x) => toHit(x.row));
}

/** The tasks asked for by id, as hits, in the order asked; a deleted or unknown one is left out. */
export async function hitsById(db: Executor, spaceId: string, ids: string[]): Promise<SearchHit[]> {
  if (!ids.length) return [];
  const rows: SearchRow[] = await db
    .select(searchColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(eq(schema.tasks.spaceId, spaceId), isNull(schema.tasks.deletedAt), inArray(schema.tasks.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SearchRow => !!r).map((r) => toHit(r));
}

/** Seven days from `monday`, each with its tasks in order. */
export async function tasksOfWeek(
  db: Executor,
  spaceId: string,
  monday: IsoDate,
): Promise<Map<IsoDate, Task[]>> {
  const sunday = addDays(monday, 6);
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        gte(schema.tasks.day, monday),
        lte(schema.tasks.day, sunday),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .orderBy(asc(schema.tasks.day), asc(schema.tasks.position), asc(schema.tasks.createdAt));
  const tasks = await withCounts(db, rows);
  const out = new Map<IsoDate, Task[]>();
  for (let i = 0; i < 7; i++) out.set(addDays(monday, i), []);
  for (const t of tasks) out.get(t.day!)?.push(t);
  return out;
}

export async function tasksById(db: Executor, ids: string[]): Promise<Task[]> {
  if (!ids.length) return [];
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(and(inArray(schema.tasks.id, ids), isNull(schema.tasks.deletedAt)));
  return withCounts(db, rows);
}

function toSubtask(r: typeof schema.subtasks.$inferSelect): Subtask {
  return {
    id: r.id,
    taskId: r.taskId,
    title: r.title,
    position: r.position,
    done: r.doneAt !== null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** One task in full: its notes, subtasks in order, comments in order and history. Null when there is no such live task. */
export async function taskDetail(db: Executor, taskId: string): Promise<TaskDetail | null> {
  const [row] = await db
    .select({ ...taskColumns, notes: schema.tasks.notes, deletedAt: schema.tasks.deletedAt })
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(eq(schema.tasks.id, taskId));
  if (!row || row.deletedAt) return null;
  const [task] = await withCounts(db, [row]);
  const cms = await db
    .select({
      id: schema.comments.id,
      taskId: schema.comments.taskId,
      html: schema.comments.html,
      createdAt: schema.comments.createdAt,
      editedAt: schema.comments.editedAt,
      authorId: schema.user.id,
      authorName: schema.user.name,
      authorEmail: schema.user.email,
    })
    .from(schema.comments)
    .innerJoin(schema.user, eq(schema.user.id, schema.comments.authorId))
    .where(and(eq(schema.comments.taskId, taskId), isNull(schema.comments.deletedAt)))
    .orderBy(asc(schema.comments.createdAt), asc(schema.comments.id));
  const events = await db
    .select()
    .from(schema.taskEvents)
    .where(eq(schema.taskEvents.taskId, taskId))
    .orderBy(asc(schema.taskEvents.id));
  const comments: Comment[] = cms.map((c) => ({
    id: c.id,
    taskId: c.taskId,
    author: { id: c.authorId, name: c.authorName, email: c.authorEmail },
    html: c.html,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
  }));
  const history = events.map(
    (e) => ({ id: e.id, at: e.at.toISOString(), kind: e.kind, ...e.data }) as HistoryEvent,
  );
  return { ...task!, notes: row.notes, comments, history };
}

function toProject(r: typeof schema.projects.$inferSelect): Project {
  return {
    id: r.id,
    spaceId: r.spaceId,
    name: r.name,
    color: r.color,
    position: r.position,
    createdAt: r.createdAt.toISOString(),
  };
}

/** A space's projects, in order. */
export async function projectsOf(db: Executor, spaceId: string): Promise<Project[]> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.spaceId, spaceId), isNull(schema.projects.deletedAt)))
    .orderBy(asc(schema.projects.position), asc(schema.projects.createdAt));
  return rows.map(toProject);
}

/** A live project of this space, or null. */
async function projectIn(tx: Executor, spaceId: string, projectId: string): Promise<boolean> {
  const [p] = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.spaceId, spaceId),
        isNull(schema.projects.deletedAt),
      ),
    );
  return !!p;
}

/** Where "ME-52" points for this person: the first task with that ref in a space they are in. */
export async function resolveRef(
  db: Executor,
  userId: string,
  ref: string,
): Promise<{ taskId: string; spaceId: string; day: IsoDate | null } | null> {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(ref.trim());
  if (!m) return null;
  const [row] = await db
    .select({ taskId: schema.tasks.id, spaceId: schema.tasks.spaceId, day: schema.tasks.day })
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .innerJoin(
      schema.spaceMembers,
      and(eq(schema.spaceMembers.spaceId, schema.spaces.id), eq(schema.spaceMembers.userId, userId)),
    )
    .where(
      and(
        eq(schema.spaces.taskPrefix, m[1]!.toUpperCase()),
        eq(schema.tasks.number, Number(m[2])),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .orderBy(asc(schema.spaces.kind));
  return row ?? null;
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

type HistoryKind = (typeof schema.historyKind.enumValues)[number];

async function record(
  tx: Executor,
  taskId: string,
  kind: HistoryKind,
  data: Record<string, unknown> = {},
  actorId: string | null = null,
  at: Date = new Date(),
): Promise<void> {
  await tx.insert(schema.taskEvents).values({ taskId, kind, data, actorId, at });
}

/**
 * Carry unfinished tasks forward: every open task planned before `today` moves to the top of today, keeping its
 * order (oldest day first), and remembers the day it first came from. Runs once per day per space; asking again
 * does nothing.
 * Returns the days and tasks that changed.
 */
export async function rollForward(
  db: Db,
  spaceId: string,
  today: IsoDate,
): Promise<{ days: IsoDate[]; tasks: string[] }> {
  return db.transaction(async (tx) => {
    const [space] = await tx
      .select({ rolledTo: schema.spaces.rolledTo })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, spaceId))
      .for('update');
    if (!space || (space.rolledTo && space.rolledTo >= today)) return { days: [], tasks: [] };
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
    if (!open.length) return { days: [], tasks: [] };
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
      await record(tx, t.id, 'carried', { from: t.day }, null, now);
    }
    return { days: [today, ...new Set(open.map((t) => t.day!))], tasks: open.map((t) => t.id) };
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
  /** A project change: the space's project list changed, not a task. */
  projects?: boolean;
}

/** An attachment chip as the editor makes it, for notes written by the server. */
function attachmentChip(f: { id: string; name: string; size: number }): string {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<a class="tp-att" href="/api/files/${f.id}" data-id="${f.id}" data-name="${esc(f.name)}" data-size="${f.size}"><span class="tp-att-i"></span>${esc(f.name)}<span class="tp-att-s">${fileSize(f.size)}</span></a>`;
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
      if (isProjectMutation(m)) return null;
      const taskId = taskIdOf(m);
      const [t] = await tx
        .select({ spaceId: schema.tasks.spaceId, day: schema.tasks.day })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId));
      return t ? { taskId, spaceId: t.spaceId, days: [] } : null;
    }
    if (m.type === 'task.create') return create(tx, userId, m);
    if (isProjectMutation(m)) return project(tx, userId, m);
    if (m.type.startsWith('subtask.')) return subtask(tx, userId, m as SubtaskMutation);
    if (m.type.startsWith('comment.')) return comment(tx, userId, m as CommentMutation);
    return change(tx, userId, m as TaskChange);
  });
}

type SubtaskMutation = Extract<SyncMutation, { type: `subtask.${string}` }>;
type CommentMutation = Extract<SyncMutation, { type: `comment.${string}` }>;
type ProjectMutation = Extract<SyncMutation, { type: `project.${string}` }>;
type TaskChange = Exclude<
  SyncMutation,
  { type: 'task.create' } | SubtaskMutation | CommentMutation | ProjectMutation
>;

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
  const projectId = p.projectId && (await projectIn(tx, p.spaceId, p.projectId)) ? p.projectId : null;
  if (p.projectId && !projectId) throw new Rejected(400, 'That project isn’t in this space.');
  // Files uploaded before the task existed now belong to it, and sit at the end of its notes as chips.
  const files = p.attachments?.length
    ? await tx
        .select({ id: schema.attachments.id, name: schema.attachments.name, size: schema.attachments.size })
        .from(schema.attachments)
        .where(
          and(
            inArray(schema.attachments.id, p.attachments),
            eq(schema.attachments.spaceId, p.spaceId),
            isNull(schema.attachments.taskId),
          ),
        )
    : [];
  const notes = (p.notes ?? '') + (files.length ? `<p>${files.map(attachmentChip).join(' ')}</p>` : '');
  const clocks: TaskClocks = { title: m.at, done: m.at, place: m.at, carried: m.at, deleted: m.at };
  if (p.due !== undefined) clocks.due = m.at;
  if (p.notes !== undefined) clocks.notes = m.at;
  if (p.projectId !== undefined) clocks.project = m.at;
  await tx.insert(schema.tasks).values({
    id: p.id,
    spaceId: p.spaceId,
    number: seq!.n,
    title: p.title,
    day: p.day,
    position: p.position ?? (await endOf(tx, p.spaceId, p.day)),
    dueDay: p.due ?? null,
    notes: notes ? cleanHtml(notes) : '',
    notesText: notes ? textOf(cleanHtml(notes)) : '',
    projectId,
    createdBy: userId,
    clocks,
  });
  await record(tx, p.id, 'created', p.source ? { source: p.source } : {}, userId, new Date(m.at));
  if (p.due) await record(tx, p.id, 'due.set', { due: p.due }, userId, new Date(m.at));
  if (files.length)
    await tx
      .update(schema.attachments)
      .set({ taskId: p.id })
      .where(
        inArray(
          schema.attachments.id,
          files.map((f) => f.id),
        ),
      );
  return { taskId: p.id, spaceId: p.spaceId, days: [p.day] };
}

/** A live task (or, for restore and delete, a deleted one), locked for the change, with the person's right to it checked. */
async function lockTask(tx: Tx, userId: string, taskId: string) {
  const [t] = await tx
    .select({
      spaceId: schema.tasks.spaceId,
      day: schema.tasks.day,
      doneAt: schema.tasks.doneAt,
      dueDay: schema.tasks.dueDay,
      deletedAt: schema.tasks.deletedAt,
      clocks: schema.tasks.clocks,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .for('update');
  if (!t) throw new Rejected(404, GONE);
  if (!(await roleIn(tx, userId, t.spaceId))) throw new Rejected(403, NOT_YOURS);
  return t;
}

async function change(tx: Tx, userId: string, m: TaskChange): Promise<Applied> {
  const t = await lockTask(tx, userId, m.payload.id);
  const base: Applied = { taskId: m.payload.id, spaceId: t.spaceId, days: [t.day] };
  const clocks: TaskClocks = { ...t.clocks };
  const set: Partial<typeof schema.tasks.$inferInsert> = {};
  const days: Array<IsoDate | null> = [t.day];
  const at = new Date(m.at);
  if (t.deletedAt) {
    if (m.type === 'task.restore') {
      if (!newer(m.at, clocks.deleted)) return { ...base, days: [] };
      await tx
        .update(schema.tasks)
        .set({ deletedAt: null, clocks: { ...clocks, deleted: m.at }, updatedAt: new Date() })
        .where(eq(schema.tasks.id, m.payload.id));
      await record(tx, m.payload.id, 'restored', {}, userId, at);
      return base;
    }
    if (m.type === 'task.delete') return { ...base, days: [], deleted: true };
    throw new Rejected(410, DELETED);
  }
  switch (m.type) {
    case 'task.restore':
      return { ...base, days: [] };
    case 'task.rename':
      if (newer(m.at, clocks.title)) {
        set.title = m.payload.title;
        clocks.title = m.at;
      }
      break;
    case 'task.cross':
      if (newer(m.at, clocks.done)) {
        set.doneAt = m.payload.done ? at : null;
        clocks.done = m.at;
        if (m.payload.done !== (t.doneAt !== null))
          await record(tx, m.payload.id, m.payload.done ? 'crossed' : 'uncrossed', {}, userId, at);
      }
      break;
    case 'task.place':
      if (newer(m.at, clocks.place)) {
        set.day = m.payload.day;
        set.position = m.payload.position ?? (await endOf(tx, t.spaceId, m.payload.day));
        clocks.place = m.at;
        if (m.payload.day !== t.day) {
          days.push(m.payload.day);
          await record(tx, m.payload.id, 'moved', { from: t.day, to: m.payload.day }, userId, at);
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
    case 'task.due':
      if (newer(m.at, clocks.due)) {
        set.dueDay = m.payload.due;
        clocks.due = m.at;
        if (m.payload.due !== t.dueDay) {
          if (m.payload.due) await record(tx, m.payload.id, 'due.set', { due: m.payload.due }, userId, at);
          else await record(tx, m.payload.id, 'due.cleared', {}, userId, at);
        }
      }
      break;
    case 'task.notes':
      if (newer(m.at, clocks.notes)) {
        set.notes = cleanHtml(m.payload.notes);
        set.notesText = textOf(set.notes);
        clocks.notes = m.at;
      }
      break;
    case 'task.visibility':
      if (newer(m.at, clocks.visibility)) {
        set.visibility = m.payload.visibility;
        clocks.visibility = m.at;
      }
      break;
    case 'task.project':
      if (newer(m.at, clocks.project)) {
        if (m.payload.projectId && !(await projectIn(tx, t.spaceId, m.payload.projectId)))
          throw new Rejected(400, 'That project isn’t in this space.');
        set.projectId = m.payload.projectId;
        clocks.project = m.at;
      }
      break;
    case 'task.delete':
      if (newer(m.at, clocks.deleted)) {
        set.deletedAt = at;
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

async function subEnd(tx: Tx, taskId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${schema.subtasks.position})` })
    .from(schema.subtasks)
    .where(and(eq(schema.subtasks.taskId, taskId), isNull(schema.subtasks.deletedAt)));
  return (row?.max ?? 0) + POSITION_STEP;
}

async function subtask(tx: Tx, userId: string, m: SubtaskMutation): Promise<Applied> {
  const t = await lockTask(tx, userId, m.payload.taskId);
  if (t.deletedAt) throw new Rejected(410, DELETED);
  const base: Applied = { taskId: m.payload.taskId, spaceId: t.spaceId, days: [t.day] };
  if (m.type === 'subtask.create') {
    const [existing] = await tx
      .select({ id: schema.subtasks.id })
      .from(schema.subtasks)
      .where(eq(schema.subtasks.id, m.payload.id));
    if (existing) return { ...base, days: [] };
    const clocks: SubtaskClocks = { title: m.at, done: m.at, position: m.at, deleted: m.at };
    await tx.insert(schema.subtasks).values({
      id: m.payload.id,
      taskId: m.payload.taskId,
      title: m.payload.title,
      position: m.payload.position ?? (await subEnd(tx, m.payload.taskId)),
      clocks,
    });
    return base;
  }
  const [s] = await tx
    .select({
      taskId: schema.subtasks.taskId,
      deletedAt: schema.subtasks.deletedAt,
      clocks: schema.subtasks.clocks,
    })
    .from(schema.subtasks)
    .where(eq(schema.subtasks.id, m.payload.id))
    .for('update');
  if (!s || s.taskId !== m.payload.taskId) throw new Rejected(404, 'That subtask isn’t there any more.');
  if (s.deletedAt) {
    if (m.type === 'subtask.delete') return { ...base, days: [] };
    throw new Rejected(410, 'That subtask was deleted.');
  }
  const clocks: SubtaskClocks = { ...s.clocks };
  const set: Partial<typeof schema.subtasks.$inferInsert> = {};
  switch (m.type) {
    case 'subtask.rename':
      if (newer(m.at, clocks.title)) {
        set.title = m.payload.title;
        clocks.title = m.at;
      }
      break;
    case 'subtask.cross':
      if (newer(m.at, clocks.done)) {
        set.doneAt = m.payload.done ? new Date(m.at) : null;
        clocks.done = m.at;
      }
      break;
    case 'subtask.place':
      if (newer(m.at, clocks.position)) {
        set.position = m.payload.position;
        clocks.position = m.at;
      }
      break;
    case 'subtask.delete':
      if (newer(m.at, clocks.deleted)) {
        set.deletedAt = new Date(m.at);
        clocks.deleted = m.at;
      }
      break;
  }
  if (!Object.keys(set).length) return { ...base, days: [] };
  await tx
    .update(schema.subtasks)
    .set({ ...set, clocks, updatedAt: new Date() })
    .where(eq(schema.subtasks.id, m.payload.id));
  return base;
}

async function comment(tx: Tx, userId: string, m: CommentMutation): Promise<Applied> {
  const t = await lockTask(tx, userId, m.payload.taskId);
  if (t.deletedAt) throw new Rejected(410, DELETED);
  const base: Applied = { taskId: m.payload.taskId, spaceId: t.spaceId, days: [t.day] };
  if (m.type === 'comment.create') {
    const html = cleanHtml(m.payload.html);
    if (isEmptyHtml(html)) throw new Rejected(400, 'A comment needs some words.');
    await tx
      .insert(schema.comments)
      .values({
        id: m.payload.id,
        taskId: m.payload.taskId,
        authorId: userId,
        html,
        createdAt: new Date(m.at),
      })
      .onConflictDoNothing();
    return base;
  }
  const [c] = await tx
    .select({
      taskId: schema.comments.taskId,
      authorId: schema.comments.authorId,
      deletedAt: schema.comments.deletedAt,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, m.payload.id))
    .for('update');
  if (!c || c.taskId !== m.payload.taskId) throw new Rejected(404, 'That comment isn’t there any more.');
  if (c.authorId !== userId) throw new Rejected(403, NOT_YOUR_COMMENT);
  if (c.deletedAt) {
    if (m.type === 'comment.delete') return { ...base, days: [] };
    throw new Rejected(410, 'That comment was deleted.');
  }
  if (m.type === 'comment.edit') {
    const html = cleanHtml(m.payload.html);
    if (isEmptyHtml(html)) throw new Rejected(400, 'A comment needs some words.');
    await tx
      .update(schema.comments)
      .set({ html, editedAt: new Date(m.at) })
      .where(eq(schema.comments.id, m.payload.id));
  } else {
    await tx
      .update(schema.comments)
      .set({ deletedAt: new Date(m.at) })
      .where(eq(schema.comments.id, m.payload.id));
  }
  return base;
}

async function project(tx: Tx, userId: string, m: ProjectMutation): Promise<Applied> {
  const { spaceId } = m.payload;
  if (!(await roleIn(tx, userId, spaceId))) throw new Rejected(403, NOT_YOURS);
  const base: Applied = { taskId: m.payload.id, spaceId, days: [], projects: true };
  if (m.type === 'project.create') {
    const [existing] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, m.payload.id));
    if (existing) return { ...base, projects: false };
    const others = await projectsOf(tx, spaceId);
    const color = m.payload.color ?? nextProjectColor(others.map((p) => p.color));
    const position = (others.at(-1)?.position ?? 0) + POSITION_STEP;
    await tx.insert(schema.projects).values({
      id: m.payload.id,
      spaceId,
      name: m.payload.name,
      color,
      position,
      createdAt: new Date(m.at),
    });
    return base;
  }
  const [p] = await tx
    .select({ spaceId: schema.projects.spaceId, deletedAt: schema.projects.deletedAt })
    .from(schema.projects)
    .where(eq(schema.projects.id, m.payload.id))
    .for('update');
  if (!p || p.spaceId !== spaceId) throw new Rejected(404, 'That project isn’t there any more.');
  if (p.deletedAt) {
    if (m.type === 'project.delete') return { ...base, projects: false };
    throw new Rejected(410, 'That project was deleted.');
  }
  if (m.type === 'project.update') {
    const set: Partial<typeof schema.projects.$inferInsert> = { updatedAt: new Date() };
    if (m.payload.name !== undefined) set.name = m.payload.name;
    if (m.payload.color !== undefined) set.color = m.payload.color;
    if (m.payload.position !== undefined) set.position = m.payload.position;
    await tx.update(schema.projects).set(set).where(eq(schema.projects.id, m.payload.id));
    return base;
  }
  // Delete: the project goes and its tasks keep no project.
  await tx
    .update(schema.projects)
    .set({ deletedAt: new Date(m.at), updatedAt: new Date() })
    .where(eq(schema.projects.id, m.payload.id));
  const moved = await tx
    .update(schema.tasks)
    .set({ projectId: null, updatedAt: new Date() })
    .where(and(eq(schema.tasks.projectId, m.payload.id), isNull(schema.tasks.deletedAt)))
    .returning({ id: schema.tasks.id, day: schema.tasks.day });
  return { ...base, days: moved.map((t) => t.day) };
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
