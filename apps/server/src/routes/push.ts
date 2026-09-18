import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import {
  softDeletePushDeviceToken,
  upsertPushDeviceToken,
} from "@tudu/db";
import { z } from "zod";
import { Hono } from "hono";
import type { SessionEnv } from "../session-middleware.js";

const tokenBodySchema = z.object({
  token: z.string().min(1),
});

export function createPushRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  app.post("/push/register", zValidator("json", tokenBodySchema), async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const { token } = c.req.valid("json");
    await upsertPushDeviceToken(db, session.user.id, token, "web");
    return c.json({ ok: true });
  });

  app.delete("/push/unregister", zValidator("json", tokenBodySchema), async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const { token } = c.req.valid("json");
    await softDeletePushDeviceToken(db, session.user.id, token);
    return c.json({ ok: true });
  });

  return app;
}
