import { Hono } from 'hono';
import {
  diffDays,
  isIsoDate,
  syncRequestSchema,
  TASKS_CHANGED,
  type DayResponse,
  type IsoDate,
  type MarksResponse,
  type SyncResponse,
  type TasksChangedEvent,
} from '@tudu/core';
import type { Db } from '@tudu/db';
import type { EventHub } from '../events';
import { requireSession, type SessionVars } from '../middleware/session';
import { applyBatch, marksOf, membersOf, roleIn, rollForward, tasksById, tasksOfDay } from '../tasks';

/** At most this many days of dots in one request (a month view and a little either side). */
const MARKS_SPAN = 62;

/** Tell everyone in a space which days changed. */
export async function announce(
  db: Db,
  hub: EventHub,
  spaceId: string,
  days: Array<IsoDate | null>,
  clientId: string | null,
): Promise<void> {
  if (!days.length) return;
  const event: TasksChangedEvent = { spaceId, days: [...new Set(days)], clientId };
  for (const userId of await membersOf(db, spaceId)) hub.publish(userId, TASKS_CHANGED, event);
}

/** Days, the dots on the calendar, and the sync endpoint the outbox replays changes to. */
export function taskRoutes(db: Db, hub: EventHub) {
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
      await announce(db, hub, spaceId, changed, null);
    }
    const tasks = await tasksOfDay(db, spaceId, day);
    const body: DayResponse = {
      day,
      tasks,
      counts: { total: tasks.length, done: tasks.filter((t) => t.done).length },
    };
    return c.json(body);
  });

  r.get('/spaces/:spaceId/marks', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!isIsoDate(from) || !isIsoDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > MARKS_SPAN)
      return c.json({ error: 'Ask for a range of up to two months.' }, 400);
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const body: MarksResponse = { marks: await marksOf(db, spaceId, from, to) };
    return c.json(body);
  });

  r.post('/sync', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const parsed = syncRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'That sync request is not valid.' }, 400);
    const { clientId, mutations } = parsed.data;
    const { results, applied } = await applyBatch(db, userId, mutations);

    const touched = [...new Set(applied.map((a) => a.taskId))];
    const deleted = [...new Set(applied.filter((a) => a.deleted).map((a) => a.taskId))];
    const body: SyncResponse = { results, tasks: await tasksById(db, touched), deleted };

    const bySpace = new Map<string, Array<IsoDate | null>>();
    for (const a of applied) bySpace.set(a.spaceId, [...(bySpace.get(a.spaceId) ?? []), ...a.days]);
    for (const [spaceId, days] of bySpace) await announce(db, hub, spaceId, days, clientId);
    return c.json(body);
  });

  return r;
}
