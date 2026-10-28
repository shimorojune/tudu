import { Hono } from 'hono';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import type { Db } from '@tudu/db';
import type { Auth } from '../auth';
import { clientOf, describeClient, listApps, NotYours, reachSchema, revokeApp, saveGrant } from '../ai/apps';
import { createKey, KEYS_PER_HOUR, KeyRejected, listKeys, newKeySchema, revokeKey } from '../ai/keys';
import { Limiter } from '../ai/limits';
import { spaceSummaries } from '../spaces';
import { requireSession, requireSignIn, type SessionVars } from '../middleware/session';

/**
 * Settings › AI access: your keys and connected apps, and the consent page's two calls. All of it needs you signed
 * in, never a key or app, except `/access`, which says who a bearer is.
 */
export function aiRoutes(
  db: Db,
  auth: Auth,
  secret: string,
  keyLimiter = new Limiter(KEYS_PER_HOUR, 3_600_000),
) {
  const r = new Hono<{ Variables: SessionVars }>();

  r.get('/keys', requireSignIn, async (c) => c.json({ keys: await listKeys(db, c.get('session')!.user.id) }));

  r.post('/keys', requireSignIn, async (c) => {
    const parsed = newKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Give the key a name and an access level.' }, 400);
    const userId = c.get('session')!.user.id;
    const wait = keyLimiter.take(userId);
    if (wait !== null) {
      c.header('Retry-After', String(wait));
      return c.json({ error: 'You’ve made a lot of keys in the last hour. Try again later.' }, 429);
    }
    try {
      return c.json(await createKey(db, userId, parsed.data), 201);
    } catch (err) {
      if (err instanceof KeyRejected) return c.json({ error: err.message }, err.status);
      throw err;
    }
  });

  r.delete('/keys/:id', requireSignIn, async (c) => {
    const done = await revokeKey(db, c.get('session')!.user.id, c.req.param('id'));
    return done ? c.body(null, 204) : c.json({ error: 'That key isn’t there any more.' }, 404);
  });

  r.get('/apps', requireSignIn, async (c) => c.json({ apps: await listApps(db, c.get('session')!.user.id) }));

  r.delete('/apps/:clientId', requireSignIn, async (c) => {
    const done = await revokeApp(db, c.get('session')!.user.id, c.req.param('clientId'));
    return done ? c.body(null, 204) : c.json({ error: 'That app isn’t connected any more.' }, 404);
  });

  /** Who this is and how far it reaches: the MCP server asks this to check a bearer. */
  r.get('/access', requireSession, (c) => {
    const s = c.get('session')!;
    return c.json({
      user: { id: s.user.id, name: s.user.name, email: s.user.email },
      access: c.get('access') ?? { kind: 'session' },
    });
  });

  /**
   * The consent page: what the app asking is, signed by the authorize step (`sig`, `exp`). A query that was changed,
   * used up or ran out is 400 "This link didn’t work".
   */
  const askOf = async (query: string) => {
    if (!query || !(await verifyOAuthQueryParams(query, secret))) return null;
    const clientId = new URLSearchParams(query).get('client_id');
    const client = clientId ? await clientOf(db, clientId) : null;
    return client ? { clientId: client.clientId, client } : null;
  };
  const BAD_LINK = { error: 'This link didn’t work. Go back to the app and connect again.' };

  r.get('/oauth/request', requireSignIn, async (c) => {
    const query = new URL(c.req.url).search.slice(1);
    const ask = await askOf(query);
    if (!ask) return c.json(BAD_LINK, 400);
    const s = c.get('session')!;
    return c.json({
      app: describeClient(ask.client),
      me: { name: s.user.name, email: s.user.email, image: s.user.image ?? null },
      spaces: (await spaceSummaries(db, s.user.id)).map((sp) => ({
        id: sp.id,
        kind: sp.kind,
        name: sp.name,
      })),
    });
  });

  /** Allow: keeps what you chose, then lets the OAuth server finish; answers where to send you back to. */
  r.post('/oauth/allow', requireSignIn, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { query?: unknown; reach?: unknown } | null;
    const query = typeof body?.query === 'string' ? body.query : '';
    const reach = reachSchema.safeParse(body?.reach);
    if (!reach.success) return c.json({ error: 'Choose what the app can do.' }, 400);
    const ask = await askOf(query);
    if (!ask) return c.json(BAD_LINK, 400);
    try {
      await saveGrant(db, c.get('session')!.user.id, ask.clientId, reach.data);
    } catch (err) {
      if (err instanceof NotYours) return c.json({ error: err.message }, 403);
      throw err;
    }
    return finish(c.req.raw.headers, query, true);
  });

  /** Cancel: nothing is kept; the app hears `access_denied`. */
  r.post('/oauth/deny', requireSignIn, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { query?: unknown } | null;
    const query = typeof body?.query === 'string' ? body.query : '';
    if (!(await askOf(query))) return c.json(BAD_LINK, 400);
    return finish(c.req.raw.headers, query, false);
  });

  const finish = async (headers: Headers, query: string, accept: boolean) => {
    // Asked for JSON, the OAuth server answers where to go instead of throwing a redirect.
    const asJson = new Headers(headers);
    asJson.set('accept', 'application/json');
    const out = (await auth.api.oauth2Consent({ body: { accept, oauth_query: query }, headers: asJson })) as {
      url?: string;
    };
    if (!out?.url) return Response.json(BAD_LINK, { status: 400 });
    return Response.json({ url: out.url });
  };

  return r;
}
