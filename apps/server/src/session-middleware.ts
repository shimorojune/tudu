import { user, type Db } from "@tudu/db";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Auth } from "./auth.js";
import { parseOAuthScopeHeader } from "./oauthScopes.js";

export type SessionEnv = {
  Variables: {
    session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
    oauthScopes: string[] | null;
  };
};

type IntrospectionResult = {
  active?: boolean;
  sub?: string;
  scope?: string;
};

async function sessionFromOAuthToken(
  auth: Auth,
  db: Db,
  token: string,
): Promise<{
  session: SessionEnv["Variables"]["session"];
  oauthScopes: string[];
} | null> {
  let introspection: IntrospectionResult;
  try {
    introspection = (await auth.api.oauth2Introspect({
      body: { token },
    })) as IntrospectionResult;
  } catch {
    return null;
  }

  if (!introspection.active || !introspection.sub) {
    return null;
  }

  const row = await db.query.user.findFirst({
    where: eq(user.id, introspection.sub),
  });
  if (!row) {
    return null;
  }

  const oauthScopes = parseOAuthScopeHeader(introspection.scope);
  const now = new Date();

  return {
    oauthScopes,
    session: {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        emailVerified: row.emailVerified,
        image: row.image,
      },
      session: {
        id: `oauth:${introspection.sub}`,
        userId: row.id,
        expiresAt: new Date(now.getTime() + 3_600_000),
        token,
        createdAt: now,
        updatedAt: now,
        ipAddress: null,
        userAgent: null,
      },
    },
  };
}

export function createSessionMiddleware(auth: Auth, db: Db) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session?.user) {
      c.set("session", session);
      c.set("oauthScopes", null);
      await next();
      return;
    }

    const authHeader = c.req.header("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice("bearer ".length).trim();
      if (token) {
        const oauthSession = await sessionFromOAuthToken(auth, db, token);
        if (oauthSession) {
          c.set("session", oauthSession.session);
          c.set("oauthScopes", oauthSession.oauthScopes);
          await next();
          return;
        }
      }
    }

    c.set("session", null);
    c.set("oauthScopes", null);
    await next();
  });
}

export function createOAuthScopeMiddleware() {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const oauthScopes = c.get("oauthScopes");
    if (!oauthScopes) {
      await next();
      return;
    }

    const method = c.req.method;
    const path = c.req.path;

    const readOnly =
      method === "GET" ||
      method === "HEAD" ||
      (method === "POST" && path === "/sync/bootstrap");

    const allowed = readOnly
      ? oauthScopes.includes("tasks:read") || oauthScopes.includes("tasks:write")
      : oauthScopes.includes("tasks:write");

    if (!allowed) {
      return c.json({ error: "Insufficient scope" }, 403);
    }

    await next();
  });
}
