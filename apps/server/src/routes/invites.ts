import type { Db } from "@tudu/db";
import { acceptOrgInvite, getInvitePreview, listMyPendingInvites } from "@tudu/db";
import { Hono } from "hono";
import type { SessionEnv } from "../session-middleware.js";
import { mapOrgError } from "./orgHelpers.js";

export function createInvitesRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  app.get("/invites/:token", async (c) => {
    try {
      const preview = await getInvitePreview(db, c.req.param("token"));
      return c.json(preview);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 404);
    }
  });

  app.post("/invites/:token/accept", async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const result = await acceptOrgInvite(
        db,
        session.user.id,
        session.user.email,
        c.req.param("token"),
      );
      return c.json(result);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 403);
    }
  });

  app.get("/me/invites", async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const invites = await listMyPendingInvites(db, session.user.email);
    return c.json({ invites });
  });

  return app;
}
