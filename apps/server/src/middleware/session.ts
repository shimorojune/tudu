import type { MiddlewareHandler } from 'hono';
import type { Auth, Session } from '../auth';

export type SessionVars = { session: Session | null };

/** Reads the session from the request's cookies (or bearer token) and puts it on the context. */
export function sessionMiddleware(auth: Auth): MiddlewareHandler<{ Variables: SessionVars }> {
  return async (c, next) => {
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
