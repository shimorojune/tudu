import type { MiddlewareHandler } from 'hono';
import type { Db } from '@tudu/db';
import type { Auth, Session } from '../auth';
import { bearerOf, looksLikeKey, sessionFromKey, type KeyAccess } from '../apiKeys';

export type SessionVars = {
  session: Session | null;
  /** Set when the request came with an API key instead of a sign-in: what that key may do. */
  access?: KeyAccess;
};

/**
 * Reads the session from the request's cookies (or bearer token) and puts it on the context. A `tudu_` bearer is an
 * API key: it stands for its person, and `access` says how far.
 */
export function sessionMiddleware(auth: Auth, db?: Db): MiddlewareHandler<{ Variables: SessionVars }> {
  return async (c, next) => {
    const bearer = bearerOf(c.req.raw.headers);
    if (db && looksLikeKey(bearer)) {
      const hit = await sessionFromKey(db, bearer);
      if (!hit) return c.json({ error: 'That key isn’t valid. It may have been revoked or run out.' }, 401);
      c.set('session', hit.session);
      c.set('access', hit.access);
      return next();
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('session', session);
    await next();
  };
}

/** Refuses anonymous requests with a plain 401. */
export const requireSession: MiddlewareHandler<{ Variables: SessionVars }> = async (c, next) => {
  if (!c.get('session')) return c.json({ error: 'Sign in first.' }, 401);
  await next();
};

/** Refuses API keys: for routes only a signed-in person may use (making keys, for one). */
export const requireSignIn: MiddlewareHandler<{ Variables: SessionVars }> = async (c, next) => {
  if (!c.get('session') || c.get('access')) return c.json({ error: 'Sign in first.' }, 401);
  await next();
};
