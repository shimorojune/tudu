import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  CONNECTOR_CHANGED,
  JIRA_JQL_MAX,
  JIRA_VIEW_NAME_MAX,
  type ConnectorChangedEvent,
  type ConnectorProvider,
  type ConnectorSpacesResponse,
  type JiraLinksResponse,
} from '@tudu/core';
import type { Db } from '@tudu/db';
import type { EventHub } from '../events';
import { requireSession, type SessionVars } from '../middleware/session';
import { roleIn } from '../tasks';
import { ConnectorFailure } from '../connectors/failure';
import { providerFrom } from '../connectors/registry';
import {
  connect,
  disconnect,
  linksOf,
  readConnection,
  removeView,
  saveView,
  setOn,
  spacesOf,
} from '../connectors/service';
import { issue, issues, searchJira } from '../connectors/jira/service';
import type { ConnectorDeps } from '../connectors/types';

const connectSchema = z.object({
  site: z.string().max(500),
  token: z.string().max(2000),
  /** Connecting from a space's Apps panel turns the app on there too. */
  spaceId: z.string().min(1).max(64).optional(),
});
const switchSchema = z.object({ on: z.boolean() });
const viewSchema = z.object({
  name: z.string().trim().min(1, 'Name the view.').max(JIRA_VIEW_NAME_MAX, 'That name is too long.'),
  jql: z.string().trim().min(1, 'Write a JQL query first.').max(JIRA_JQL_MAX, 'That query is too long.'),
  index: z.number().int().min(0).optional(),
});

type Vars = { Variables: SessionVars & { provider: ConnectorProvider } };

/**
 * The apps, through the API: Jira Data Center answers no browser, and the token never leaves the server. Each
 * person connects an app once, for their account, and turns it on per space; reads in a space need it on there.
 * These calls are online, like connecting a space: nothing is queued.
 */
export function connectorRoutes(db: Db, hub: EventHub, deps: ConnectorDeps) {
  const r = new Hono<Vars>();
  const fail = (c: Context<Vars>, err: unknown) => {
    if (err instanceof ConnectorFailure)
      return c.json(
        { error: err.message, code: err.code, ...(err.field ? { field: err.field } : {}) },
        err.status,
      );
    throw err;
  };
  // Your other tabs hear that your app changed; nobody else does.
  const tell = (userId: string, provider: ConnectorProvider) =>
    hub.publish(userId, CONNECTOR_CHANGED, { provider } satisfies ConnectorChangedEvent);
  const notIn = (c: Context<Vars>) => c.json({ error: 'You’re not in that space.' }, 403);

  for (const path of [
    '/connectors/:provider',
    '/connectors/:provider/*',
    '/spaces/:spaceId/connectors/:provider',
    '/spaces/:spaceId/connectors/:provider/*',
  ]) {
    r.use(path, requireSession);
    r.use(path, async (c, next) => {
      const provider = providerFrom(c.req.param('provider'));
      if (!provider) return c.json({ error: 'Not found.' }, 404);
      c.set('provider', provider);
      const spaceId = c.req.param('spaceId');
      if (spaceId && !(await roleIn(db, c.get('session')!.user.id, spaceId))) return notIn(c);
      await next();
    });
  }

  r.get('/connectors/:provider', async (c) => {
    try {
      return c.json(await readConnection(db, deps, c.get('session')!.user.id, c.get('provider')));
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/connectors/:provider', async (c) => {
    const userId = c.get('session')!.user.id;
    const provider = c.get('provider');
    const parsed = connectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Give your address and a token.', code: 'not-address', field: 'site' }, 400);
    if (parsed.data.spaceId && !(await roleIn(db, userId, parsed.data.spaceId))) return notIn(c);
    try {
      const out = await connect(db, deps, userId, provider, parsed.data);
      tell(userId, provider);
      return c.json(out);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/connectors/:provider', async (c) => {
    const userId = c.get('session')!.user.id;
    const provider = c.get('provider');
    await disconnect(db, userId, provider);
    tell(userId, provider);
    return c.body(null, 204);
  });

  /** Your spaces with your switch in each: Settings › Apps. */
  r.get('/connectors/:provider/spaces', async (c) => {
    const body: ConnectorSpacesResponse = {
      spaces: await spacesOf(db, c.get('session')!.user.id, c.get('provider')),
    };
    return c.json(body);
  });

  /** Which issues have tasks of yours, in every space you're in: Tudu's own database, never the app. */
  r.get('/connectors/:provider/links', async (c) => {
    const body: JiraLinksResponse = {
      links: await linksOf(db, c.get('session')!.user.id, c.get('provider')),
    };
    return c.json(body);
  });

  r.post('/connectors/:provider/views', async (c) => {
    const userId = c.get('session')!.user.id;
    const provider = c.get('provider');
    const parsed = viewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0]?.message ?? 'That view is not valid.' }, 400);
    try {
      const view = await saveView(db, userId, provider, parsed.data);
      tell(userId, provider);
      return c.json(view, 201);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/connectors/:provider/views/:id', async (c) => {
    const userId = c.get('session')!.user.id;
    const provider = c.get('provider');
    try {
      await removeView(db, userId, provider, c.req.param('id'));
      tell(userId, provider);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  /** Your switch in a space. Any member may flip their own: it is about what you see, not the space. */
  r.put('/spaces/:spaceId/connectors/:provider', async (c) => {
    const userId = c.get('session')!.user.id;
    const provider = c.get('provider');
    const parsed = switchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Say on or off.' }, 400);
    try {
      await setOn(db, userId, c.req.param('spaceId'), provider, parsed.data.on);
      tell(userId, provider);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  // Jira's own reads, in a space where you have it on.
  r.get('/spaces/:spaceId/connectors/jira/issues', async (c) => {
    const view = c.req.query('view');
    const jql = c.req.query('jql');
    try {
      return c.json(await issues(db, deps, c.get('session')!.user.id, c.req.param('spaceId'), { view, jql }));
    } catch (err) {
      return fail(c, err);
    }
  });

  r.get('/spaces/:spaceId/connectors/jira/issues/:key', async (c) => {
    try {
      return c.json(
        await issue(db, deps, c.get('session')!.user.id, c.req.param('spaceId'), c.req.param('key')),
      );
    } catch (err) {
      return fail(c, err);
    }
  });

  r.get('/spaces/:spaceId/connectors/jira/search', async (c) => {
    const q = (c.req.query('q') ?? '').slice(0, 200);
    try {
      return c.json(await searchJira(db, deps, c.get('session')!.user.id, c.req.param('spaceId'), q));
    } catch (err) {
      return fail(c, err);
    }
  });

  return r;
}
