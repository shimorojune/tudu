import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import {
  ensureNotificationPreferences,
  getPersonalSpaceSettings,
  setClientAppVersion,
  setPersonalKeyPrefix,
  TaskKeyError,
  updateNotificationPreferences,
} from "@tudu/db";
import {
  notificationPreferencesUpdateSchema,
  updateKeyPrefixBodySchema,
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

  app.get("/settings/space-prefix", async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const settings = await getPersonalSpaceSettings(db, session.user.id);
    return c.json(settings);
  });

  app.put(
    "/settings/space-prefix",
    zValidator("json", updateKeyPrefixBodySchema),
    async (c) => {
      const session = c.get("session");
      if (!session?.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      try {
        const { keyPrefix } = c.req.valid("json");
        const personalKeyPrefix = await setPersonalKeyPrefix(
          db,
          session.user.id,
          keyPrefix,
        );
        return c.json({
          personalKeyPrefix,
          prefixLocked: false,
        });
      } catch (error) {
        if (error instanceof TaskKeyError) {
          return c.json({ error: error.message }, error.status as 409);
        }
        throw error;
      }
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
