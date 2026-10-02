import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  createOAuthScopeMiddleware,
  type SessionEnv,
} from "./session-middleware.js";

function appWithOAuthScopes(scopes: string[]) {
  const app = new Hono<SessionEnv>();
  app.use("*", async (c, next) => {
    c.set("oauthScopes", scopes);
    c.set("session", {
      user: {
        id: "user-1",
        email: "u@example.com",
        name: "User",
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        image: null,
      },
      session: {
        id: "oauth:user-1",
        userId: "user-1",
        token: "token",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      },
    });
    await next();
  });
  app.use("*", createOAuthScopeMiddleware());
  app.get("/tasks", (c) => c.json({ ok: true }));
  app.post("/sync/bootstrap", (c) => c.json({ ok: true }));
  app.post("/sync", (c) => c.json({ ok: true }));
  return app;
}

describe("createOAuthScopeMiddleware", () => {
  it("allows GET with tasks:read", async () => {
    const app = appWithOAuthScopes(["tasks:read"]);
    const response = await app.request("http://localhost/tasks");
    expect(response.status).toBe(200);
  });

  it("allows POST /sync/bootstrap with tasks:read", async () => {
    const app = appWithOAuthScopes(["tasks:read"]);
    const response = await app.request("http://localhost/sync/bootstrap", {
      method: "POST",
    });
    expect(response.status).toBe(200);
  });

  it("returns 403 on POST /sync with tasks:read only", async () => {
    const app = appWithOAuthScopes(["tasks:read"]);
    const response = await app.request("http://localhost/sync", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: "Insufficient scope" });
  });

  it("allows POST /sync with tasks:write", async () => {
    const app = appWithOAuthScopes(["tasks:write"]);
    const response = await app.request("http://localhost/sync", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(200);
  });
});
