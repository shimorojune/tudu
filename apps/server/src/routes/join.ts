import type { Db } from "@tudu/db";
import { createJoinRequest, getJoinPreview } from "@tudu/db";
import { Hono } from "hono";
import type { SessionEnv } from "../session-middleware.js";
import { mapOrgError } from "./orgHelpers.js";

export function createJoinRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  app.get("/join/:code", async (c) => {
    try {
      const preview = await getJoinPreview(db, c.req.param("code"));
      return c.json(preview);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 404);
    }
  });

  app.post("/join/:code", async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      await createJoinRequest(
        db,
        session.user.id,
        session.user.email,
        c.req.param("code"),
      );
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapOrgError(error);
      return c.json(mapped.body, mapped.status as 410);
    }
  });

  return app;
}
