import { Hono } from 'hono';
import type { InboxView } from '@tudu/core';
import type { Db } from '@tudu/db';
import { requireSession, type SessionVars } from '../middleware/session';
import { inboxOf } from '../requests';
import { roleIn } from '../tasks';

const VIEWS: InboxView[] = ['inbox', 'answered', 'sent'];

/** The Inbox read: `?view=inbox|answered|sent&q=`. */
export function inboxRoutes(db: Db) {
  const r = new Hono<{ Variables: SessionVars }>();
  r.get('/spaces/:spaceId/inbox', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const view = (c.req.query('view') ?? 'inbox') as InboxView;
    if (!VIEWS.includes(view)) return c.json({ error: 'That isn’t a view of the Inbox.' }, 400);
    const q = (c.req.query('q') ?? '').slice(0, 200);
    return c.json(await inboxOf(db, userId, spaceId, view, q));
  });
  return r;
}
