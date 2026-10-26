import { Hono } from 'hono';
import {
  addDays,
  diffDays,
  isIsoDate,
  isoToday,
  mondayOf,
  syncRequestSchema,
  TASKS_CHANGED,
  ALL_SPACES_CHANGED,
  type AllSpacesChangedEvent,
  type AllSpacesPlacesResponse,
  INBOX_CHANGED,
  type InboxChangedEvent,
  NOTEBOOK_CHANGED,
  type NotebookChangedEvent,
  type DayResponse,
  type IsoDate,
  type MarksResponse,
  type BacklogResponse,
  type WeekResponse,
  PROJECTS_CHANGED,
  SPACE_CHANGED,
  type ProjectsChangedEvent,
  type SpaceChangedEvent,
  type SearchResponse,
  type SyncResponse,
  type TaskRefResponse,
  type TasksChangedEvent,
} from '@tudu/core';
import type { Db } from '@tudu/db';
import type { EventHub } from '../events';
import { searchNotes } from '../notebook';
import type { Storage } from '../storage';
import { MeaningUnavailable, searchByMeaning, type Embeddings } from '../closeMatches';
import { requireSession, type SessionVars } from '../middleware/session';
import { spaceSummaries } from '../spaces';
import { announceMembers } from './spaces';
import {
  allSpacesPlaces,
  applyBatch,
  hitsById,
  lookAlikeTasks,
  marksOf,
  membersOf,
  projectOpenCounts,
  projectsOf,
  resolveRef,
  roleIn,
  rollForward,
  searchTasks,
  taskDetail,
  tasksById,
  tasksOfBacklog,
  tasksOfDay,
  tasksOfWeek,
} from '../tasks';

/** At most this many days of dots in one request (a month view and a little either side). */
const MARKS_SPAN = 62;

/** Tell everyone in a space which days and tasks changed. */
export async function announce(
  db: Db,
  hub: EventHub,
  spaceId: string,
  days: Array<IsoDate | null>,
  tasks: string[],
  clientId: string | null,
): Promise<void> {
  if (!days.length && !tasks.length) return;
  const event: TasksChangedEvent = {
    spaceId,
    days: [...new Set(days)],
    tasks: [...new Set(tasks)],
    clientId,
  };
  for (const userId of await membersOf(db, spaceId)) hub.publish(userId, TASKS_CHANGED, event);
}

/** Tell everyone in a space the space itself changed. */
export async function announceSpace(db: Db, hub: EventHub, spaceId: string): Promise<void> {
  const event: SpaceChangedEvent = { spaceId };
  for (const userId of await membersOf(db, spaceId)) hub.publish(userId, SPACE_CHANGED, event);
}

/** Tell everyone in a space its projects changed. */
export async function announceProjects(
  db: Db,
  hub: EventHub,
  spaceId: string,
  clientId: string | null,
): Promise<void> {
  const event: ProjectsChangedEvent = { spaceId, clientId };
  for (const userId of await membersOf(db, spaceId)) hub.publish(userId, PROJECTS_CHANGED, event);
}

/** Days, the dots on the calendar, and the sync endpoint the outbox replays changes to. */
export function taskRoutes(db: Db, hub: EventHub, embeddings: Embeddings, storage?: Storage) {
  const r = new Hono<{ Variables: SessionVars }>();

  r.get('/spaces/:spaceId/days/:day', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId, day } = c.req.param();
    if (!isIsoDate(day)) return c.json({ error: 'Not a calendar day.' }, 400);
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    // The client says what today is. Asking for today carries unfinished tasks forward, once a day.
    const today = c.req.query('today');
    if (today && isIsoDate(today) && today === day) {
      // Every tab hears about it, the asking one too, so days it has cached elsewhere refresh.
      const changed = await rollForward(db, spaceId, today);
      await announce(db, hub, spaceId, changed.days, changed.tasks, null);
    }
    const tasks = await tasksOfDay(db, spaceId, userId, day);
    const body: DayResponse = {
      day,
      tasks,
      counts: { total: tasks.length, done: tasks.filter((t) => t.done).length },
    };
    return c.json(body);
  });

  /** A week in one answer: the seven days from a Monday, each with its tasks and counts, and the Backlog. */
  r.get('/spaces/:spaceId/weeks/:monday', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId, monday } = c.req.param();
    if (!isIsoDate(monday) || mondayOf(monday) !== monday)
      return c.json({ error: 'A week starts on a Monday.' }, 400);
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    // The week that holds today carries unfinished tasks forward first, as the day read does.
    const today = c.req.query('today');
    if (today && isIsoDate(today) && mondayOf(today) === monday) {
      const changed = await rollForward(db, spaceId, today);
      await announce(db, hub, spaceId, changed.days, changed.tasks, null);
    }
    const week = await tasksOfWeek(db, spaceId, userId, monday);
    const body: WeekResponse = {
      monday,
      days: Array.from({ length: 7 }, (_, i) => {
        const day = addDays(monday, i);
        const tasks = week.get(day) ?? [];
        return { day, tasks, counts: { total: tasks.length, done: tasks.filter((t) => t.done).length } };
      }),
      backlog: await tasksOfBacklog(db, spaceId, userId),
    };
    return c.json(body);
  });

  r.get('/spaces/:spaceId/backlog', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const body: BacklogResponse = { tasks: await tasksOfBacklog(db, spaceId, userId) };
    return c.json(body);
  });

  /**
   * Search a space's tasks: `?q=` the words (ranked, at most thirty, `today` for the tie order), `?ids=` the tasks
   * asked for in that order (Recently opened), `?q=&for=lookalike` open tasks that read like a title.
   */
  r.get('/spaces/:spaceId/search', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const ids = c.req.query('ids');
    const q = (c.req.query('q') ?? '').slice(0, 200);
    let hits;
    if (ids !== undefined)
      hits = await hitsById(db, spaceId, userId, ids.split(',').filter(Boolean).slice(0, 20));
    else if (c.req.query('for') === 'lookalike') {
      // By words and, when the model is up, by meaning; the words alone when it is not.
      const byMeaning = embeddings.on
        ? await searchByMeaning(db, embeddings, userId, q, { spaceId, openOnly: true, limit: 3 }).catch(
            (err) => {
              if (err instanceof MeaningUnavailable) return [];
              throw err;
            },
          )
        : [];
      hits = await lookAlikeTasks(
        db,
        spaceId,
        userId,
        q,
        byMeaning.map((h) => ({ item: h, similarity: h.similarity })),
      );
    } else {
      const today = c.req.query('today');
      hits = await searchTasks(db, spaceId, userId, q, isIsoDate(today) ? today : isoToday());
    }
    const body: SearchResponse = { hits };
    return c.json(body);
  });

  /**
   * Search every space you are in (chunk 21): `?q=` the words (ranked, at most thirty; `today` for the tie order,
   * `here` the space you are looking at, which only breaks ties), `?ids=` the tasks asked for in that order
   * (Recently opened). Every task you can see: yours, ownerless, and a colleague's shared with the space.
   */
  r.get('/search', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const ids = c.req.query('ids');
    const q = (c.req.query('q') ?? '').slice(0, 200);
    const today = c.req.query('today');
    const here = c.req.query('here') || null;
    const hits =
      ids !== undefined
        ? await hitsById(db, null, userId, ids.split(',').filter(Boolean).slice(0, 20))
        : await searchTasks(db, null, userId, q, isIsoDate(today) ? today : isoToday(), here);
    // Your notes come along under their own heading (chunk 22): yours alone, never anyone else's.
    const body: SearchResponse =
      ids !== undefined ? { hits } : { hits, notes: await searchNotes(db, userId, q) };
    return c.json(body);
  });

  /**
   * Close matches: tasks that mean what was typed, from every space you are in (`?q=`), without the ones the word
   * search already lists (`?exclude=a,b`). 503 while the model is not available, so the panel says so quietly.
   */
  r.get('/search/meaning', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const q = (c.req.query('q') ?? '').slice(0, 200);
    const exclude = (c.req.query('exclude') ?? '').split(',').filter(Boolean);
    try {
      const hits = await searchByMeaning(db, embeddings, userId, q, { exclude });
      const body: SearchResponse = { hits: hits.map(({ similarity: _s, ...h }) => h) };
      return c.json(body);
    } catch (err) {
      if (err instanceof MeaningUnavailable) return c.json({ error: err.message }, 503);
      throw err;
    }
  });

  r.get('/spaces/:spaceId/tasks/:taskId', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId, taskId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const task = await taskDetail(db, taskId);
    if (!task || task.spaceId !== spaceId) return c.json({ error: 'That task isn’t there any more.' }, 404);
    // A colleague's task marked Only me is not there for anyone else.
    if (task.ownerId && task.ownerId !== userId && task.visibility === 'me')
      return c.json({ error: 'That task isn’t there any more.' }, 404);
    return c.json(task);
  });

  /** Where a task ref ("ME-52") points, for a link to a task. */
  r.get('/tasks/ref/:ref', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const hit = await resolveRef(db, userId, c.req.param('ref'));
    if (!hit) return c.json({ error: 'No task with that ID.' }, 404);
    const body: TaskRefResponse = hit;
    return c.json(body);
  });

  r.get('/spaces/:spaceId/projects', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const projects = await projectsOf(db, spaceId);
    // Settings asks how many open tasks each one has.
    if (c.req.query('counts') === '1')
      return c.json({ projects, open: await projectOpenCounts(db, spaceId, userId) });
    return c.json({ projects });
  });

  r.get('/spaces/:spaceId/marks', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!isIsoDate(from) || !isIsoDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > MARKS_SPAN)
      return c.json({ error: 'Ask for a range of up to two months.' }, 400);
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const body: MarksResponse = { marks: await marksOf(db, spaceId, userId, from, to) };
    return c.json(body);
  });

  /** Your All spaces order for `from`..`to` (at most MARKS_SPAN days), and the Backlog's with `backlog=1`. */
  r.get('/all-spaces/places', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!isIsoDate(from) || !isIsoDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > MARKS_SPAN)
      return c.json({ error: 'Those days aren’t valid.' }, 400);
    const body: AllSpacesPlacesResponse = {
      places: await allSpacesPlaces(db, userId, from, to, c.req.query('backlog') === '1'),
    };
    return c.json(body);
  });

  r.post('/sync', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const parsed = syncRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That sync request is not valid.' }, 400);
    const { clientId, mutations } = parsed.data;
    const { results, applied } = await applyBatch(db, userId, mutations);

    const tasky = applied.filter((a) => !a.space && !a.me && !a.allPlace && !a.notebook);
    const touched = [
      ...new Set(tasky.filter((a) => !a.projects && (!a.requests || a.days.length)).map((a) => a.taskId)),
    ];
    const deleted = [...new Set(applied.filter((a) => a.deleted).map((a) => a.taskId))];
    const body: SyncResponse = { results, tasks: await tasksById(db, touched), deleted };

    const bySpace = new Map<string, { days: Array<IsoDate | null>; tasks: string[]; projects: boolean }>();
    for (const a of tasky) {
      const s = bySpace.get(a.spaceId) ?? { days: [], tasks: [], projects: false };
      s.days.push(...a.days);
      if (!a.projects && (a.days.length || a.deleted)) s.tasks.push(a.taskId);
      if (a.projects) s.projects = true;
      bySpace.set(a.spaceId, s);
    }
    for (const [spaceId, s] of bySpace) {
      await announce(db, hub, spaceId, s.days, s.tasks, clientId);
      if (s.projects) await announceProjects(db, hub, spaceId, clientId);
    }
    // Inboxes: each person concerned hears, and only them.
    const told = new Set<string>();
    for (const a of applied)
      for (const u of a.inbox ?? []) {
        if (told.has(u)) continue;
        told.add(u);
        const event: InboxChangedEvent = { spaceId: a.spaceId || null };
        hub.publish(u, INBOX_CHANGED, event);
      }
    // A space renamed or recoloured: its people read /api/me again. A new name: every space you are in shows it.
    for (const spaceId of new Set(applied.filter((a) => a.space).map((a) => a.spaceId)))
      await announceSpace(db, hub, spaceId);
    if (applied.some((a) => a.me))
      for (const s of await spaceSummaries(db, userId)) await announceMembers(db, hub, s.id);
    // All spaces' own order: yours alone, so only your other tabs hear.
    const placed = applied.filter((a) => a.allPlace);
    if (placed.length) {
      const event: AllSpacesChangedEvent = {
        days: [...new Set(placed.map((a) => a.allPlace!.day))],
        clientId,
      };
      hub.publish(userId, ALL_SPACES_CHANGED, event);
    }
    // The Notebook is yours alone: only your other windows and devices hear, and files gone for good leave the bucket.
    const notebook = applied.filter((a) => a.notebook);
    if (notebook.length) {
      const event: NotebookChangedEvent = {
        notes: [...new Set(notebook.flatMap((a) => a.notebook!.notes))],
        folders: [...new Set(notebook.flatMap((a) => a.notebook!.folders))],
        clientId,
      };
      hub.publish(userId, NOTEBOOK_CHANGED, event);
    }
    for (const key of applied.flatMap((a) => a.purged ?? [])) await storage?.delete(key).catch(() => {});
    // New or changed words get their vector after the answer goes out (chunk 13).
    if (tasky.length) embeddings.kick();
    return c.json(body);
  });

  return r;
}
