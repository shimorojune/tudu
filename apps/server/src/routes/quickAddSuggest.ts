import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import {
  quickAddSuggestRequestSchema,
  type QuickAddSuggestResponse,
} from "@tudu/shared";
import { Hono } from "hono";
import { runQuickAddSuggest } from "../quickAdd/suggest.js";
import type { SessionEnv } from "../session-middleware.js";
import { getTypeSafeClient } from "../typesafe/client.js";

function jsonBody() {
  return zValidator("json", quickAddSuggestRequestSchema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid request body";
      return c.json({ error: message }, 400);
    }
  });
}

export function createQuickAddSuggestRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  app.post("/quick-add/suggest", jsonBody(), async (c) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!getTypeSafeClient()) {
      return c.json({ error: "TypeSafe is not configured" }, 503);
    }

    const body = c.req.valid("json");

    try {
      const response: QuickAddSuggestResponse = await runQuickAddSuggest(
        { db, client: getTypeSafeClient() },
        session.user.id,
        body,
      );
      return c.json(response);
    } catch {
      return c.json({ error: "Could not suggest Quick Add fields" }, 502);
    }
  });

  return app;
}
