import { Hono } from 'hono';
import type { InboxView } from '@tudu/core';
import type { Db } from '@tudu/db';
import { inboxOf } from '../inbox';
import { requireSession, type SessionVars } from '../middleware/session';
import { roleIn } from '../tasks';

const VIEWS: InboxView[] = ['inbox', 'answered', 'sent'];

/** The one Inbox across every space: `?view=inbox|answered|sent&space=<id>&q=`. */
export function inboxRoutes(db: Db) {
  const r = new Hono<{ Variables: SessionVars }>();
  r.get('/inbox', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const view = (c.req.query('view') ?? 'inbox') as InboxView;
    if (!VIEWS.includes(view)) return c.json({ error: 'That isn’t a view of the Inbox.' }, 400);
    const spaceId = c.req.query('space') || null;
    if (spaceId && !(await roleIn(db, user.id, spaceId)))
      return c.json({ error: 'You’re not in that space.' }, 403);
    const q = (c.req.query('q') ?? '').slice(0, 200);
    return c.json(await inboxOf(db, user, view, q, spaceId));
  });
  /** Before the one Inbox: one space's. Kept for one release, for Mac apps still on 0.37. */
  r.get('/spaces/:spaceId/inbox', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, user.id, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const view = (c.req.query('view') ?? 'inbox') as InboxView;
    if (!VIEWS.includes(view)) return c.json({ error: 'That isn’t a view of the Inbox.' }, 400);
    const q = (c.req.query('q') ?? '').slice(0, 200);
    const out = await inboxOf(db, user, view, q, spaceId);
    return c.json({ ...out, counts: out.bySpace[spaceId] ?? { toAnswer: 0, unread: 0 } });
  });
  return r;
}
