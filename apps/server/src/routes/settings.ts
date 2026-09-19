import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import {
  ensureNotificationPreferences,
  setClientAppVersion,
  updateNotificationPreferences,
} from "@tudu/db";
import {
  notificationPreferencesUpdateSchema,
  type NotificationPreferencesResponse,
} from "@tudu/shared";
import { z } from "zod";
import { Hono } from "hono";
import type { SessionEnv } from "../session-middleware.js";

const clientVersionSchema = z.object({
  version: z.string().min(1),
});

export function createSettingsRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  app.get("/settings/notifications", async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const prefs = await ensureNotificationPreferences(db, session.user.id);
    const response: NotificationPreferencesResponse = prefs;
    return c.json(response);
  });

  app.put(
    "/settings/notifications",
    zValidator("json", notificationPreferencesUpdateSchema),
    async (c) => {
      const session = c.get("session");
      if (!session?.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const body = c.req.valid("json");
      const prefs = await updateNotificationPreferences(
        db,
        session.user.id,
        body,
      );
      const response: NotificationPreferencesResponse = prefs;
      return c.json(response);
    },
  );

  app.put(
    "/settings/client-version",
    zValidator("json", clientVersionSchema),
    async (c) => {
      const session = c.get("session");
      if (!session?.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const { version } = c.req.valid("json");
      await setClientAppVersion(db, session.user.id, version.trim());
      return c.json({ ok: true });
    },
  );

  return app;
}
