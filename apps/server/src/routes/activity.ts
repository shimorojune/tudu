import { zValidator } from "@hono/zod-validator";
import type { Db } from "@tudu/db";
import {
  createComment,
  listCommentsForTask,
  listTimelineForTask,
  resolveTaskAccess,
  softDeleteComment,
  updateComment,
  type CommentWithAuthor,
} from "@tudu/db";
import {
  createCommentRequestSchema,
  timelineQuerySchema,
  updateCommentRequestSchema,
  type Comment,
  type CommentResponse,
  type CommentsResponse,
  type TimelineEvent,
  type TimelineResponse,
  sanitizeRichTextHtml,
} from "@tudu/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { SessionEnv } from "../session-middleware.js";

function jsonBody<T extends z.ZodType>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid request body";
      return c.json({ error: message }, 400);
    }
  });
}

function queryParams<T extends z.ZodType>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid query";
      return c.json({ error: message }, 400);
    }
  });
}

function toComment(row: CommentWithAuthor): Comment {
  return {
    id: row.id,
    taskId: row.taskId,
    authorId: row.authorId,
    body: row.body,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: row.author,
  };
}

function toTimelineEvent(
  row: Awaited<ReturnType<typeof listTimelineForTask>>[number],
): TimelineEvent {
  return {
    id: row.id,
    taskId: row.taskId,
    actorId: row.actorId,
    actor: row.actor ?? null,
    type: row.type,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createActivityRoute(db: Db) {
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

  app.get("/tasks/:id/comments", async (c) => {
    const access = await resolveTaskAccess(db, userId(c), c.req.param("id"));
    if (!access) {
      return c.json({ error: "Task not found" }, 404);
    }

    const rows = await listCommentsForTask(db, c.req.param("id"));
    const response: CommentsResponse = { comments: rows.map(toComment) };

    return c.json(response);
  });

  app.post("/tasks/:id/comments", jsonBody(createCommentRequestSchema), async (c) => {
    const access = await resolveTaskAccess(db, userId(c), c.req.param("id"));
    if (!access) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (access !== "owner" && access !== "reader") {
      return c.json({ error: "Not allowed" }, 403);
    }

    const created = await createComment(
      db,
      userId(c),
      c.req.param("id"),
      sanitizeRichTextHtml(c.req.valid("json").body),
    );

    if (!created) {
      return c.json({ error: "Task not found" }, 404);
    }

    const response: CommentResponse = { comment: toComment(created) };

    return c.json(response, 201);
  });

  app.patch("/comments/:id", jsonBody(updateCommentRequestSchema), async (c) => {
    const updated = await updateComment(
      db,
      userId(c),
      c.req.param("id"),
      sanitizeRichTextHtml(c.req.valid("json").body),
    );

    if (!updated) {
      return c.json({ error: "Comment not found" }, 404);
    }

    const response: CommentResponse = { comment: toComment(updated) };

    return c.json(response);
  });

  app.delete("/comments/:id", async (c) => {
    const deleted = await softDeleteComment(db, userId(c), c.req.param("id"));

    if (!deleted) {
      return c.json({ error: "Comment not found" }, 404);
    }

    return c.body(null, 204);
  });

  app.get("/tasks/:id/timeline", queryParams(timelineQuerySchema), async (c) => {
    const access = await resolveTaskAccess(db, userId(c), c.req.param("id"));
    if (!access) {
      return c.json({ error: "Task not found" }, 404);
    }

    const { before, limit } = c.req.valid("query");
    const events = await listTimelineForTask(db, c.req.param("id"), {
      before,
      limit,
    });

    const response: TimelineResponse = {
      events: events.map(toTimelineEvent),
      hasMore: events.length === limit,
    };

    return c.json(response);
  });

  return app;
}
