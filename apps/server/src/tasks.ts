import { applyRequest, noteComment } from './requests';
import { moveSlug } from './settings';
import {
  addDays,
  chipHtml,
  cleanHtml,
  isEmptyHtml,
  isInboxMutation,
  isProjectMutation,
  isSettingsMutation,
  isAllMutation,
  isNotebookMutation,
  linkKeyOf,
  LOOKALIKE_MIN,
  lookAlikesScored,
  mergeLookAlikes,
  type MeaningMatch,
  nextProjectColor,
  POSITION_STEP,
  positionBetween,
  rankSearch,
  searchTokens,
  syncMutationSchema,
  taskIdOf,
  textOf,
  wordsOf,
  type AllSpacesPlace,
  type Comment,
  type HistoryEvent,
  type IsoDate,
  type NotebookRejection,
  type Project,
  type SearchHit,
  type Subtask,
  type SyncMutation,
  type SyncResult,
  type Task,
  type TaskDetail,
  type TaskLink,
} from '@tudu/core';
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  schema,
  sql,
  type Db,
} from '@tudu/db';
import { readableBy } from './closeMatches';
import { applyNotebook, type NotebookMutation } from './notebook';
import { linkKeyLike, linksColumn } from './taskLinks';
import { currentVia } from './ai/access';
import type { SubtaskClocks, TaskClocks } from '@tudu/db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

/** A change the server will never apply: the client undoes it and says why. */
export class Rejected extends Error {
  constructor(
    readonly code: number,
    message: string,
    /** A Notebook rejection the client acts on (a stale body, a folder name taken). */
    readonly reason?: NotebookRejection,
  ) {
    super(message);
  }
}

const NOT_YOURS = 'You can’t change tasks in that space.';
const NOT_YOUR_TASK = 'You can only change your own tasks.';
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
  links: linksColumn,
  ownerId: schema.tasks.ownerId,
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
  links: TaskLink[];
  ownerId: string | null;
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
    links: r.links,
    jira: linkKeyOf(r.links, 'jira'),
    ownerId: r.ownerId,
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

/**
 * Whose tasks a page shows: in a team space every page shows your own (People shows everyone's); a task whose owner is
 * gone belongs to everyone in the space.
 */
function ownedBy(userId: string) {
  return or(eq(schema.tasks.ownerId, userId), isNull(schema.tasks.ownerId))!;
}

/** The tasks of one day in a space, in order: the asking person's own. */
export async function tasksOfDay(
  db: Executor,
  spaceId: string,
  userId: string,
  day: IsoDate,
): Promise<Task[]> {
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        ownedBy(userId),
        eq(schema.tasks.day, day),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt));
  return withCounts(db, rows);
}

/** The tasks with no day (the Backlog) in a space, in order: the asking person's own. */
export async function tasksOfBacklog(db: Executor, spaceId: string, userId: string): Promise<Task[]> {
  const rows = await db
    .select(taskColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        ownedBy(userId),
        isNull(schema.tasks.day),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt));
  return withCounts(db, rows);
}

const searchColumns = {
  id: schema.tasks.id,
  spaceId: schema.tasks.spaceId,
  number: schema.tasks.number,
  prefix: schema.spaces.taskPrefix,
  title: schema.tasks.title,
  day: schema.tasks.day,
  doneAt: schema.tasks.doneAt,
  projectId: schema.tasks.projectId,
  links: linksColumn,
  notesText: schema.tasks.notesText,
};
type SearchRow = {
  id: string;
  spaceId: string;
  number: number;
  prefix: string;
  title: string;
  day: string | null;
  doneAt: Date | null;
  projectId: string | null;
  links: TaskLink[];
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
    jira: linkKeyOf(r.links, 'jira'),
    snippet,
    // Search spans every space (chunk 21), so every hit says where it lives.
    spaceId: r.spaceId,
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
export async function searchTasks(
  db: Executor,
  /** One space, or null for every space you are in (chunk 21: Search always spans them). */
  spaceId: string | null,
  userId: string,
  q: string,
  today: IsoDate,
  /** Only breaks ties: hits from the space you are looking at come first. Never a filter. */
  here: string | null = null,
): Promise<SearchHit[]> {
  const toks = searchTokens(q);
  if (!toks.length) return [];
  const n = numberOf(q);
  const words = toks.map((w) =>
    or(
      sql`${schema.tasks.title} ILIKE ${like(w)}`,
      sql`${schema.tasks.notesText} ILIKE ${like(w)}`,
      linkKeyLike(like(w)),
    )!,
  );
  const rows: SearchRow[] = await db
    .select(searchColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        spaceId ? eq(schema.tasks.spaceId, spaceId) : undefined,
        readableBy(userId),
        or(...words, ...(n === null ? [] : [eq(schema.tasks.number, n)])),
      ),
    )
    .orderBy(
      // The ranking keeps the order it is given for equal scores: the space you are in first.
      ...(here ? [sql`${schema.tasks.spaceId} = ${here} desc`] : []),
      asc(schema.tasks.day),
      asc(schema.tasks.position),
      asc(schema.tasks.createdAt),
    )
    .limit(SEARCH_CANDIDATES);
  const ranked = rankSearch(
    rows.map((r) => ({
      row: r,
      ref: `${r.prefix}-${r.number}`,
      title: r.title,
      day: r.day,
      done: r.doneAt !== null,
      notes: r.notesText,
      keys: r.links.map((l) => l.key),
    })),
    q,
    today,
    SEARCH_LIMIT,
  );
  return ranked.map((h) => toHit(h.item.row, h.snippet));
}

/**
 * Open tasks in a space that read like the title (Quick Add's "Looks like a task you have"): by shared words, and
 * by meaning when the caller passes what the vector search found, folded on one scale, the closest first, at
 * most three.
 */
export async function lookAlikeTasks(
  db: Executor,
  spaceId: string,
  userId: string,
  title: string,
  byMeaning: MeaningMatch<SearchHit>[] = [],
): Promise<SearchHit[]> {
  const ws = wordsOf(title);
  const words =
    !ws.length || title.trim().length < LOOKALIKE_MIN
      ? []
      : await db
          .select(searchColumns)
          .from(schema.tasks)
          .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
          .where(
            and(
              eq(schema.tasks.spaceId, spaceId),
              readableBy(userId),
              isNull(schema.tasks.doneAt),
              or(...ws.map((w) => sql`${schema.tasks.title} ILIKE ${like(w.slice(0, 5))}`)),
            ),
          )
          .orderBy(asc(schema.tasks.day), asc(schema.tasks.position), asc(schema.tasks.createdAt))
          .limit(SEARCH_CANDIDATES);
  const scored = lookAlikesScored(
    words.map((r) => ({ row: r, title: r.title, done: false })),
    title,
  ).map((x) => ({ item: toHit(x.item.row), score: x.score }));
  return mergeLookAlikes(scored, byMeaning);
}

/** The tasks asked for by id, as hits, in the order asked; a deleted or unknown one is left out. */
export async function hitsById(
  db: Executor,
  /** One space, or null for every space you are in. */
  spaceId: string | null,
  userId: string,
  ids: string[],
): Promise<SearchHit[]> {
  if (!ids.length) return [];
  const rows: SearchRow[] = await db
    .select(searchColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        spaceId ? eq(schema.tasks.spaceId, spaceId) : undefined,
        inArray(schema.tasks.id, ids),
        readableBy(userId),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is SearchRow => !!r)
    .map((r) => toHit(r));
}

/** Seven days from `monday`, each with its tasks in order. */
export async function tasksOfWeek(
  db: Executor,
  spaceId: string,
  userId: string,
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
        ownedBy(userId),
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
    .select({
      ...taskColumns,
      notes: schema.tasks.notes,
      deletedAt: schema.tasks.deletedAt,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
      ownerColor: schema.user.color,
    })
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .leftJoin(schema.user, eq(schema.user.id, schema.tasks.ownerId))
    .where(eq(schema.tasks.id, taskId));
  if (!row || row.deletedAt) return null;
  const [task] = await withCounts(db, [row]);
  const owner =
    row.ownerId && row.ownerName !== null
      ? { id: row.ownerId, name: row.ownerName, email: row.ownerEmail ?? '', color: row.ownerColor ?? null }
      : null;
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
  return { ...task!, notes: row.notes, comments, history, owner };
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

/** How many open tasks each project has, of the ones the person can see (their own, and everyone's shared). */
export async function projectOpenCounts(
  db: Executor,
  spaceId: string,
  userId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ projectId: schema.tasks.projectId, n: count() })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        isNull(schema.tasks.deletedAt),
        isNull(schema.tasks.doneAt),
        or(eq(schema.tasks.visibility, 'space'), eq(schema.tasks.ownerId, userId)),
      ),
    )
    .groupBy(schema.tasks.projectId);
  const out: Record<string, number> = {};
  for (const r of rows) if (r.projectId) out[r.projectId] = r.n;
  return out;
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
): Promise<{ taskId: string; spaceId: string; slug: string; day: IsoDate | null } | null> {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(ref.trim());
  if (!m) return null;
  const [row] = await db
    .select({
      taskId: schema.tasks.id,
      spaceId: schema.tasks.spaceId,
      day: schema.tasks.day,
      kind: schema.spaces.kind,
      slug: schema.spaces.slug,
    })
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
        // Your own, or one a colleague shares with the space.
        or(
          eq(schema.tasks.ownerId, userId),
          isNull(schema.tasks.ownerId),
          eq(schema.tasks.visibility, 'space'),
        ),
      ),
    )
    .orderBy(asc(schema.spaces.kind));
  if (!row) return null;
  return {
    taskId: row.taskId,
    spaceId: row.spaceId,
    slug: row.kind === 'personal' ? 'me' : (row.slug ?? row.spaceId),
    day: row.day,
  };
}

/** How many tasks each day between `from` and `to` holds. */
export async function marksOf(
  db: Executor,
  spaceId: string,
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ day: schema.tasks.day, n: count() })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        ownedBy(userId),
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
  // Through a key or app, history says which (`via`); the stamp follows the call that is running now.
  await tx.insert(schema.taskEvents).values({ taskId, kind, data, actorId, via: currentVia(), at });
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
  /** A request or Inbox change: `taskId` is the task it made, if any. */
  requests?: boolean;
  /** Whose Inboxes changed. */
  inbox?: string[];
  /** The space itself changed (`spaceId`): its name, colour or address. */
  space?: boolean;
  /** The person's own name changed: every space they are in shows it. */
  me?: boolean;
  /** Their All spaces order changed on this day (chunk 21): only they hear, and no space's list changed. */
  allPlace?: { day: IsoDate | null };
  /** Their Notebook changed (chunk 22): these notes and folders. Only they hear; no space's list changed. */
  notebook?: { notes: string[]; folders: string[] };
  /** Notebook files gone for good with their notes: the keys to take out of the bucket. */
  purged?: string[];
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
      if (
        isProjectMutation(m) ||
        isInboxMutation(m) ||
        isSettingsMutation(m) ||
        isAllMutation(m) ||
        isNotebookMutation(m)
      )
        return null;
      const taskId = taskIdOf(m);
      const [t] = await tx
        .select({ spaceId: schema.tasks.spaceId, day: schema.tasks.day })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId));
      return t ? { taskId, spaceId: t.spaceId, days: [] } : null;
    }
    if (isNotebookMutation(m)) return applyNotebook(tx, userId, m as NotebookMutation);
    if (m.type === 'task.create') return create(tx, userId, m);
    if (isInboxMutation(m)) return applyRequest(tx, userId, m);
    if (isProjectMutation(m)) return project(tx, userId, m);
    if (isSettingsMutation(m)) return settings(tx, userId, m);
    if (isAllMutation(m)) return placeInAll(tx, userId, m);
    if (m.type.startsWith('subtask.')) return subtask(tx, userId, m as SubtaskMutation);
    if (m.type.startsWith('comment.')) return comment(tx, userId, m as CommentMutation);
    return change(tx, userId, m as TaskChange);
  });
}

type SubtaskMutation = Extract<SyncMutation, { type: `subtask.${string}` }>;
type CommentMutation = Extract<SyncMutation, { type: `comment.${string}` }>;
type ProjectMutation = Extract<SyncMutation, { type: `project.${string}` }>;
type InboxMutation = Extract<SyncMutation, { type: `request.${string}` | `inbox.${string}` }>;
type SettingsMutation = Extract<SyncMutation, { type: `me.${string}` | `space.${string}` }>;
type AllMutation = Extract<SyncMutation, { type: `all.${string}` }>;
type TaskChange = Exclude<
  SyncMutation,
  | NotebookMutation
  | { type: 'task.create' }
  | SubtaskMutation
  | CommentMutation
  | ProjectMutation
  | InboxMutation
  | SettingsMutation
  | AllMutation
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
  const notes = (p.notes ?? '') + (files.length ? `<p>${files.map(chipHtml).join(' ')}</p>` : '');
  const clocks: TaskClocks = { title: m.at, done: m.at, place: m.at, carried: m.at, deleted: m.at };
  if (p.due !== undefined) clocks.due = m.at;
  if (p.notes !== undefined) clocks.notes = m.at;
  if (p.projectId !== undefined) clocks.project = m.at;
  // A client from before connectors names the Jira key alone.
  const link = p.link ?? (p.jira ? { provider: 'jira' as const, key: p.jira } : undefined);
  if (link) clocks[link.provider] = m.at;
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
    ownerId: userId,
    clocks,
  });
  if (link)
    await tx.insert(schema.taskLinks).values({
      taskId: p.id,
      spaceId: p.spaceId,
      provider: link.provider,
      key: link.key,
      linkedBy: userId,
      linkedAt: new Date(m.at),
    });
  const source = p.source === 'jira' ? 'connector' : p.source;
  const made: Record<string, unknown> = source ? { source } : {};
  if (link) Object.assign(made, { provider: link.provider, key: link.key });
  await record(tx, p.id, 'created', made, userId, new Date(m.at));
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

/**
 * A live task (or, for restore and delete, a deleted one), locked for the change, with the person's right to it
 * checked: a member may change their own tasks; another member's task takes a comment and nothing else, and one
 * marked Only me is not there for them at all.
 */
async function lockTask(tx: Tx, userId: string, taskId: string, forComment = false) {
  const [t] = await tx
    .select({
      spaceId: schema.tasks.spaceId,
      day: schema.tasks.day,
      doneAt: schema.tasks.doneAt,
      dueDay: schema.tasks.dueDay,
      deletedAt: schema.tasks.deletedAt,
      clocks: schema.tasks.clocks,
      ownerId: schema.tasks.ownerId,
      visibility: schema.tasks.visibility,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .for('update');
  if (!t) throw new Rejected(404, GONE);
  if (!(await roleIn(tx, userId, t.spaceId))) throw new Rejected(403, NOT_YOURS);
  if (t.ownerId && t.ownerId !== userId) {
    if (t.visibility === 'me') throw new Rejected(404, GONE);
    if (!forComment) throw new Rejected(403, NOT_YOUR_TASK);
  }
  return t;
}

/** A task's link in one app set, changed or taken off (null), with the history saying so. */
async function setLink(
  tx: Tx,
  taskId: string,
  spaceId: string,
  provider: TaskLink['provider'],
  key: string | null,
  userId: string,
  at: Date,
): Promise<void> {
  const [was] = await tx
    .select({ key: schema.taskLinks.key })
    .from(schema.taskLinks)
    .where(and(eq(schema.taskLinks.taskId, taskId), eq(schema.taskLinks.provider, provider)));
  if ((was?.key ?? null) === key) return;
  if (was) {
    await tx
      .delete(schema.taskLinks)
      .where(and(eq(schema.taskLinks.taskId, taskId), eq(schema.taskLinks.provider, provider)));
    await record(tx, taskId, 'link.removed', { provider, key: was.key }, userId, at);
  }
  if (key) {
    await tx
      .insert(schema.taskLinks)
      .values({ taskId, spaceId, provider, key, linkedBy: userId, linkedAt: at });
    await record(tx, taskId, 'link.added', { provider, key }, userId, at);
  }
}

async function change(tx: Tx, userId: string, m: TaskChange): Promise<Applied> {
  const t = await lockTask(tx, userId, m.payload.id);
  const base: Applied = { taskId: m.payload.id, spaceId: t.spaceId, days: [t.day] };
  const clocks: TaskClocks = { ...t.clocks };
  const set: Partial<typeof schema.tasks.$inferInsert> = {};
  const days: Array<IsoDate | null> = [t.day];
  const at = new Date(m.at);
  let linked = false;
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
    case 'task.link':
    case 'task.jira': {
      // `task.jira` is a client from before connectors linking its Jira key.
      const { provider, key } =
        m.type === 'task.link' ? m.payload : { provider: 'jira' as const, key: m.payload.jira };
      if (newer(m.at, clocks[provider])) {
        clocks[provider] = m.at;
        linked = true;
        await setLink(tx, m.payload.id, t.spaceId, provider, key, userId, at);
      }
      break;
    }
    case 'task.delete':
      if (newer(m.at, clocks.deleted)) {
        set.deletedAt = at;
        clocks.deleted = m.at;
      }
      break;
  }
  if (!Object.keys(set).length && !linked) return { ...base, days: [] };
  // New words, new meaning: the vector is made again by the next batch (chunk 13).
  if (set.title !== undefined || set.notes !== undefined) {
    set.embedding = null;
    set.embeddedText = null;
  }
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
  const t = await lockTask(tx, userId, m.payload.taskId, true);
  if (t.deletedAt) throw new Rejected(410, DELETED);
  const base: Applied = { taskId: m.payload.taskId, spaceId: t.spaceId, days: [t.day] };
  if (m.type === 'comment.create') {
    const html = cleanHtml(m.payload.html);
    if (isEmptyHtml(html)) throw new Rejected(400, 'A comment needs some words.');
    const made = await tx
      .insert(schema.comments)
      .values({
        id: m.payload.id,
        taskId: m.payload.taskId,
        authorId: userId,
        html,
        createdAt: new Date(m.at),
      })
      .onConflictDoNothing()
      .returning({ id: schema.comments.id });
    // A comment on someone else's task lands in their Inbox.
    const inbox = made.length
      ? await noteComment(
          tx,
          { id: m.payload.taskId, spaceId: t.spaceId, ownerId: t.ownerId },
          m.payload.id,
          userId,
          new Date(m.at),
        )
      : [];
    return { ...base, inbox };
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
    // New projects go first: the list reads newest first in Settings and every picker.
    const position = positionBetween(null, others[0]?.position);
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
  if (m.type === 'project.restore') {
    if (!p.deletedAt) return { ...base, projects: false };
    const [row] = await tx
      .select({ detached: schema.projects.detached })
      .from(schema.projects)
      .where(eq(schema.projects.id, m.payload.id));
    await tx
      .update(schema.projects)
      .set({ deletedAt: null, detached: [], updatedAt: new Date() })
      .where(eq(schema.projects.id, m.payload.id));
    // Back on the tasks it was taken off, unless someone gave them another project since.
    const back = row?.detached.length
      ? await tx
          .update(schema.tasks)
          .set({ projectId: m.payload.id, updatedAt: new Date() })
          .where(and(inArray(schema.tasks.id, row.detached), isNull(schema.tasks.projectId)))
          .returning({ day: schema.tasks.day })
      : [];
    return { ...base, days: back.map((t) => t.day) };
  }
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
  // Delete: the project goes and its tasks keep no project; which tasks it was on is kept for Undo.
  const moved = await tx
    .update(schema.tasks)
    .set({ projectId: null, updatedAt: new Date() })
    .where(and(eq(schema.tasks.projectId, m.payload.id), isNull(schema.tasks.deletedAt)))
    .returning({ id: schema.tasks.id, day: schema.tasks.day });
  await tx
    .update(schema.projects)
    .set({ deletedAt: new Date(m.at), detached: moved.map((t) => t.id), updatedAt: new Date() })
    .where(eq(schema.projects.id, m.payload.id));
  return { ...base, days: moved.map((t) => t.day) };
}

/** Your name; a team space's name and colour (admins only; the address follows a new name). */
async function settings(tx: Tx, userId: string, m: SettingsMutation): Promise<Applied> {
  if (m.type === 'me.rename') {
    if (m.payload.id !== userId) throw new Rejected(403, 'You can only change your own name.');
    await tx
      .update(schema.user)
      .set({ name: m.payload.name, updatedAt: new Date() })
      .where(eq(schema.user.id, userId));
    return { taskId: userId, spaceId: '', days: [], me: true };
  }
  const spaceId = m.payload.id;
  const role = await roleIn(tx, userId, spaceId);
  if (!role) throw new Rejected(403, NOT_YOURS);
  const [s] = await tx
    .select({ kind: schema.spaces.kind })
    .from(schema.spaces)
    .where(eq(schema.spaces.id, spaceId));
  if (s?.kind !== 'team') throw new Rejected(400, 'Personal is yours alone; it keeps its name.');
  if (role !== 'admin') throw new Rejected(403, 'Only an admin can change the space’s name and colour.');
  const set: Partial<typeof schema.spaces.$inferInsert> = { updatedAt: new Date() };
  if (m.payload.name !== undefined) set.name = m.payload.name;
  if (m.payload.color !== undefined) set.color = m.payload.color;
  await tx.update(schema.spaces).set(set).where(eq(schema.spaces.id, spaceId));
  if (m.payload.name !== undefined) await moveSlug(tx, spaceId, m.payload.name);
  return { taskId: spaceId, spaceId, days: [], space: true };
}

/**
 * Your place for a task in All spaces' own order (chunk 21). Only for a task that is yours to plan: in a space you
 * are in, and yours or ownerless (a colleague's task is not on your list). The task itself never changes.
 */
async function placeInAll(tx: Tx, userId: string, m: AllMutation): Promise<Applied> {
  const p = m.payload;
  const t = await lockTask(tx, userId, p.id);
  if (t.deletedAt) throw new Rejected(410, DELETED);
  if (t.day !== p.day) throw new Rejected(400, 'That task isn’t on that day any more.');
  const at = new Date(m.at);
  const [have] = await tx
    .select({ clock: schema.allSpacesPlaces.clock })
    .from(schema.allSpacesPlaces)
    .where(and(eq(schema.allSpacesPlaces.userId, userId), eq(schema.allSpacesPlaces.taskId, p.id)));
  // Last write wins: an older place than the one kept changes nothing.
  if (have && have.clock.getTime() > at.getTime()) return { taskId: p.id, spaceId: '', days: [] };
  await tx
    .insert(schema.allSpacesPlaces)
    .values({ userId, taskId: p.id, day: p.day, position: p.position, clock: at })
    .onConflictDoUpdate({
      target: [schema.allSpacesPlaces.userId, schema.allSpacesPlaces.taskId],
      set: { day: p.day, position: p.position, clock: at, updatedAt: new Date() },
    });
  return { taskId: p.id, spaceId: '', days: [], allPlace: { day: p.day } };
}

/**
 * Your All spaces places for these days (and the Backlog, with `backlog`): only for tasks in spaces you are in now,
 * yours or ownerless, still on the day the place was given on.
 */
export async function allSpacesPlaces(
  db: Executor,
  userId: string,
  from: IsoDate,
  to: IsoDate,
  backlog: boolean,
): Promise<AllSpacesPlace[]> {
  const P = schema.allSpacesPlaces;
  const rows = await db
    .select({ taskId: P.taskId, day: P.day, position: P.position })
    .from(P)
    .innerJoin(schema.tasks, eq(schema.tasks.id, P.taskId))
    .innerJoin(
      schema.spaceMembers,
      and(eq(schema.spaceMembers.spaceId, schema.tasks.spaceId), eq(schema.spaceMembers.userId, userId)),
    )
    .where(
      and(
        eq(P.userId, userId),
        isNull(schema.tasks.deletedAt),
        ownedBy(userId),
        // A place only counts on the day it was given: a task moved since has none.
        or(
          and(isNull(P.day), isNull(schema.tasks.day)),
          and(eq(P.day, schema.tasks.day), gte(P.day, from), lte(P.day, to)),
        ),
        backlog ? undefined : isNotNull(P.day),
      ),
    )
    .orderBy(asc(P.day), asc(P.position));
  return rows;
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
      results.push({
        id,
        status: 'rejected',
        code: err.code,
        error: err.message,
        ...(err.reason ? { reason: err.reason } : {}),
      });
    }
  }
  return { results, applied };
}
