import { createMiddleware } from "hono/factory";
import type { Auth } from "./auth.js";

type SessionEnv = {
  Variables: {
    session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
  };
};

export function createSessionMiddleware(auth: Auth) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    c.set("session", session);
    await next();
  });
}

export type { SessionEnv };
