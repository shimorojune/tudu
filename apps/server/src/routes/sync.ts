import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import { listEventsAfter } from "@tudu/db";
import {
  syncBootstrapRequestSchema,
  syncPushRequestSchema,
  type SyncBootstrapResponse,
  type SyncPushResponse,
} from "@tudu/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import { z } from "zod";
import {
  applySyncOp,
  bootstrapViews,
  SyncOpError,
  type JiraSyncOptions,
} from "../applySyncOp.js";
import { JiraHttpError } from "../jira/client.js";
import type { SessionEnv } from "../session-middleware.js";
import { waitForSync } from "../syncHub.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

function jsonBody<T extends z.ZodType>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid request body";
      return c.json({ error: message }, 400);
    }
  });
}

const streamQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
});

export function syncRouteError(error: unknown): { status: ContentfulStatusCode; message: string } | null {
  if (error instanceof JiraHttpError) {
    return {
      status: error.status >= 400 && error.status < 500
        ? (error.status as ContentfulStatusCode)
        : 502,
      message: error.message,
    };
  }
  if (error instanceof Error && error.message.startsWith("JIRA_TOKEN_ENCRYPTION_KEY")) {
    return { status: 400, message: error.message };
  }
  return null;
}

export function createSyncRoute(db: Db, options?: JiraSyncOptions) {
  const app = new Hono<SessionEnv>();

  app.use("*", async (c, next) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  function userId(c: Context<SessionEnv>) {
    return c.get("session")!.user.id;
  }

  app.post("/sync", jsonBody(syncPushRequestSchema), async (c) => {
    const body = c.req.valid("json");
    try {
      const events = await applySyncOp(
        db,
        userId(c),
        body.clientMutationId,
        body.op,
        options,
      );
      const seq = events.reduce((max, event) => Math.max(max, event.seq), 0);
      const response: SyncPushResponse = {
        clientMutationId: body.clientMutationId,
        seq,
        events,
      };
      return c.json(response);
    } catch (error) {
      if (error instanceof SyncOpError) {
        return c.json({ error: error.message }, error.status);
      }
      const mapped = syncRouteError(error);
      if (mapped) {
        return c.json({ error: mapped.message }, mapped.status);
      }
      throw error;
    }
  });

  app.get("/sync/bootstrap", async (c) => {
    const viewsRaw = c.req.query("views") ?? "";
    const views = viewsRaw
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    const result = await bootstrapViews(db, userId(c), views);
    const response: SyncBootstrapResponse = result;
    return c.json(response);
  });

  app.post("/sync/bootstrap", jsonBody(syncBootstrapRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const result = await bootstrapViews(db, userId(c), body.views ?? []);
    const response: SyncBootstrapResponse = result;
    return c.json(response);
  });

  app.get("/sync/stream", async (c) => {
    const parsed = streamQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query" }, 400);
    }

    const actorId = userId(c);
    let seq = parsed.data.after;

    c.header("X-Accel-Buffering", "no");
    c.header("Cache-Control", "no-cache");

    return streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });

      let lastPing = 0;
      await stream.writeSSE({ event: "ping", data: "" });
      lastPing = Date.now();

      while (!closed) {
        const events = await listEventsAfter(db, actorId, seq);
        for (const event of events) {
          await stream.writeSSE({
            id: String(event.seq),
            data: JSON.stringify(event),
          });
          seq = event.seq;
        }
        const now = Date.now();
        if (now - lastPing >= 15_000) {
          await stream.writeSSE({ event: "ping", data: "" });
          lastPing = now;
        }
        await waitForSync(actorId, 300);
      }
    });
  });

  return app;
}
