import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { MeResponse } from "@tudu/shared";
import type { SessionEnv } from "../session-middleware.js";
import { createUpdatesRoute } from "./updates.js";

describe("auth boundary", () => {
  it("returns 401 on /me without session", async () => {
    const app = new Hono<SessionEnv>();
    app.get("/me", (c) => {
      const session = c.get("session");

      if (!session?.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const response: MeResponse = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        createdAt: new Date(session.user.createdAt).toISOString(),
        onboardedAt: null,
      };

      return c.json(response);
    });

    const response = await app.request("http://localhost/me");
    expect(response.status).toBe(401);
  });

  it("exposes /updates/check without session middleware", async () => {
    const app = new Hono();
    app.route("/", createUpdatesRoute());

    const response = await app.request(
      "http://localhost/updates/check?platform=web&version=0.0.0",
    );
    expect(response.status).not.toBe(401);
  });
});
