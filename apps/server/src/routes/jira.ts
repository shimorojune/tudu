import { Hono } from 'hono';
import { z } from 'zod';
import {
  JIRA_CHANGED,
  JIRA_JQL_MAX,
  JIRA_VIEW_NAME_MAX,
  type JiraChangedEvent,
  type JiraLinksResponse,
} from '@tudu/core';
import type { Db } from '@tudu/db';
import type { EventHub } from '../events';
import { requireSession, type SessionVars } from '../middleware/session';
import { roleIn } from '../tasks';
import { JiraFailure } from '../jira/http';
import {
  connect,
  disconnect,
  issue,
  issues,
  linksOf,
  readConnection,
  removeView,
  saveView,
  searchJira,
  type JiraDeps,
} from '../jira/service';

const connectSchema = z.object({ site: z.string().max(500), token: z.string().max(2000) });
const viewSchema = z.object({
  name: z.string().trim().min(1, 'Name the view.').max(JIRA_VIEW_NAME_MAX, 'That name is too long.'),
  jql: z.string().trim().min(1, 'Write a JQL query first.').max(JIRA_JQL_MAX, 'That query is too long.'),
  index: z.number().int().min(0).optional(),
});

/**
 * Jira, through the API: Jira Data Center answers no browser, and the token never leaves the server. Each person
 * has their own connection per space. These calls are online, like connecting a space: nothing is queued.
 */
export function jiraRoutes(db: Db, hub: EventHub, deps: JiraDeps) {
  const r = new Hono<{ Variables: SessionVars }>();
  type Ctx = { json: (b: unknown, s: number) => Response };
  const fail = (c: Ctx, err: unknown) => {
    if (err instanceof JiraFailure)
      return c.json(
        { error: err.message, code: err.code, ...(err.field ? { field: err.field } : {}) },
        err.status,
      );
    throw err;
  };
  // Your other tabs hear that your Jira here changed; nobody else does.
  const tell = (userId: string, spaceId: string) =>
    hub.publish(userId, JIRA_CHANGED, { spaceId } satisfies JiraChangedEvent);

  r.use('/spaces/:spaceId/jira/*', requireSession);
  r.use('/spaces/:spaceId/jira', requireSession);
  r.use('/spaces/:spaceId/jira/*', async (c, next) => {
    if (!(await roleIn(db, c.get('session')!.user.id, c.req.param('spaceId')!)))
      return c.json({ error: 'You’re not in that space.' }, 403);
    await next();
  });
  r.use('/spaces/:spaceId/jira', async (c, next) => {
    if (!(await roleIn(db, c.get('session')!.user.id, c.req.param('spaceId')!)))
      return c.json({ error: 'You’re not in that space.' }, 403);
    await next();
  });

  r.get('/spaces/:spaceId/jira', async (c) => {
    try {
      return c.json(await readConnection(db, deps, c.get('session')!.user.id, c.req.param('spaceId')));
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/spaces/:spaceId/jira', async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    const parsed = connectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Give your Jira address and a token.', code: 'not-address', field: 'site' },
        400,
      );
    try {
      const out = await connect(db, deps, userId, spaceId, parsed.data);
      tell(userId, spaceId);
      return c.json(out);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/spaces/:spaceId/jira', async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    await disconnect(db, userId, spaceId);
    tell(userId, spaceId);
    return c.body(null, 204);
  });

  r.get('/spaces/:spaceId/jira/issues', async (c) => {
    const view = c.req.query('view');
    const jql = c.req.query('jql');
    try {
      const out = await issues(db, deps, c.get('session')!.user.id, c.req.param('spaceId'), { view, jql });
      return c.json(out);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.get('/spaces/:spaceId/jira/issues/:key', async (c) => {
    try {
      return c.json(
        await issue(db, deps, c.get('session')!.user.id, c.req.param('spaceId'), c.req.param('key')),
      );
    } catch (err) {
      return fail(c, err);
    }
  });

  r.get('/spaces/:spaceId/jira/search', async (c) => {
    const q = (c.req.query('q') ?? '').slice(0, 200);
    try {
      return c.json(await searchJira(db, deps, c.get('session')!.user.id, c.req.param('spaceId'), q));
    } catch (err) {
      return fail(c, err);
    }
  });

  /** Which issues have tasks of yours in this space: Tudu's own database, never Jira. */
  r.get('/spaces/:spaceId/jira/links', async (c) => {
    const body: JiraLinksResponse = {
      links: await linksOf(db, c.get('session')!.user.id, c.req.param('spaceId')),
    };
    return c.json(body);
  });

  r.post('/spaces/:spaceId/jira/views', async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    const parsed = viewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0]?.message ?? 'That view is not valid.' }, 400);
    try {
      const view = await saveView(db, userId, spaceId, parsed.data);
      tell(userId, spaceId);
      return c.json(view, 201);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/spaces/:spaceId/jira/views/:id', async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId, id } = c.req.param();
    try {
      await removeView(db, userId, spaceId, id);
      tell(userId, spaceId);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  return r;
}
