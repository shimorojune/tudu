import { zValidator } from "@hono/zod-validator";
import type {
  Db,
  TaskRowWithSubtasks,
  UpdateTaskFields,
} from "@tudu/db";
import {
  createSubtask,
  createTask,
  findTaskById,
  findTaskByKey,
  loadTaskWithSubtasks,
  mapTask,
  TaskKeyError,
  NowCapExceededError,
  ProjectError,
  listTasksForDay,
  listUnscheduledTasks,
  reorderTasks,
  reorderSubtasks,
  resolveTaskAccess,
  rollOverTasks,
  softDeleteSubtask,
  softDeleteTask,
  updateSubtask,
  updateTask,
} from "@tudu/db";
import {
  createSubtaskRequestSchema,
  createTaskRequestSchema,
  reorderRequestSchema,
  reorderSubtasksRequestSchema,
  rolloverRequestSchema,
  updateSubtaskRequestSchema,
  updateTaskRequestSchema,
  type Task,
  type TaskResponse,
  type TasksResponse,
  type RolloverResponse,
  type UpdateTaskRequest,
  sanitizeRichTextHtml,
} from "@tudu/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { SessionEnv } from "../session-middleware.js";

/** zValidator's default 400 body does not match the repo's `{ error }` convention,
    so every use goes through these two wrappers. */
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

const dayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date"),
});

function toTask(row: TaskRowWithSubtasks): Task {
  return mapTask(row);
}

/** Translates the wire patch into database fields. `completed` is a boolean on the
    wire and a nullable timestamp in the database. */
function toUpdateFields(patch: UpdateTaskRequest): UpdateTaskFields {
  const fields: UpdateTaskFields = {};

  if ("title" in patch) fields.title = patch.title;
  if ("description" in patch) {
    fields.description =
      patch.description == null ? null : sanitizeRichTextHtml(patch.description);
  }
  if ("scheduledDate" in patch) fields.scheduledDate = patch.scheduledDate;
  if ("bucket" in patch) fields.bucket = patch.bucket;
  if ("startDate" in patch) fields.startDate = patch.startDate;
  if ("isPrivate" in patch) fields.isPrivate = patch.isPrivate;
  if ("projectId" in patch) fields.projectId = patch.projectId ?? null;

  if ("deadline" in patch) {
    fields.deadline = patch.deadline ? new Date(patch.deadline) : null;
  }

  if ("completed" in patch) {
    fields.completedAt = patch.completed ? new Date() : null;
  }

  if ("inProgress" in patch) {
    fields.inProgress = patch.inProgress;
  }

  return fields;
}

export function createTasksRoute(db: Db) {
  const app = new Hono<SessionEnv>();

  /** Every route below is authenticated. Scoping is by session, never by a body id. */
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

  // Literal segments must be registered before their /:id equivalents, or Hono
  // matches "unscheduled" and "reorder" as task ids.
  app.get("/tasks/by-key/:key", async (c) => {
    const rawKey = c.req.param("key");
    try {
      const hit = await findTaskByKey(db, userId(c), rawKey);
      if (!hit) {
        return c.json({ error: "Task not found" }, 404);
      }
      const access = await resolveTaskAccess(db, userId(c), hit.taskId);
      if (!access) {
        return c.json({ error: "Task not found" }, 404);
      }
      const row = await loadTaskWithSubtasks(db, hit.taskId);
      if (!row) {
        return c.json({ error: "Task not found" }, 404);
      }
      const response: TaskResponse = { task: toTask(row) };
      return c.json(response);
    } catch (error) {
      if (error instanceof TaskKeyError) {
        return c.json({ error: error.message }, error.status as 404);
      }
      throw error;
    }
  });

  app.get("/tasks/unscheduled", async (c) => {
    const rows = await listUnscheduledTasks(db, userId(c));
    const response: TasksResponse = { tasks: rows.map(toTask) };

    return c.json(response);
  });

  app.patch("/tasks/reorder", jsonBody(reorderRequestSchema), async (c) => {
    const { lanes } = c.req.valid("json");
    try {
      const ok = await reorderTasks(db, userId(c), lanes);

      if (!ok) {
        return c.json({ error: "One or more tasks were not found" }, 404);
      }
    } catch (error) {
      if (error instanceof NowCapExceededError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }

    return c.body(null, 204);
  });

  app.post("/tasks/rollover", jsonBody(rolloverRequestSchema), async (c) => {
    const { toDate } = c.req.valid("json");
    const result = await rollOverTasks(db, userId(c), toDate);
    const response: RolloverResponse = result;

    return c.json(response);
  });

  app.get("/tasks", queryParams(dayQuerySchema), async (c) => {
    const { date } = c.req.valid("query");
    const rows = await listTasksForDay(db, userId(c), date);
    const response: TasksResponse = { tasks: rows.map(toTask) };

    return c.json(response);
  });

  app.post("/tasks", jsonBody(createTaskRequestSchema), async (c) => {
    const body = c.req.valid("json");

    let created;
    try {
      created = await createTask(db, {
        userId: userId(c),
        title: body.title,
        description:
          body.description == null ? null : sanitizeRichTextHtml(body.description),
        scheduledDate: body.scheduledDate,
        bucket: body.bucket,
        startDate: body.startDate,
        deadline: body.deadline ? new Date(body.deadline) : null,
        isPrivate: body.isPrivate,
        projectId: body.projectId ?? null,
        orgId: body.orgId ?? null,
      });
    } catch (error) {
      if (error instanceof ProjectError) {
        return c.json({ error: error.message }, error.status);
      }
      if (error instanceof NowCapExceededError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }

    const row = await findTaskById(db, userId(c), created.id);

    if (!row) {
      return c.json({ error: "Task not found after create" }, 500);
    }

    const response: TaskResponse = { task: toTask(row) };

    return c.json(response, 201);
  });

  app.patch("/tasks/:id", jsonBody(updateTaskRequestSchema), async (c) => {
    const access = await resolveTaskAccess(db, userId(c), c.req.param("id"));
    if (!access) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (access !== "owner") {
      return c.json({ error: "Task not found" }, 404);
    }

    let updated;
    try {
      updated = await updateTask(
        db,
        userId(c),
        c.req.param("id"),
        toUpdateFields(c.req.valid("json")),
      );
    } catch (error) {
      if (error instanceof ProjectError) {
        return c.json({ error: error.message }, error.status);
      }
      if (error instanceof NowCapExceededError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }

    if (!updated) {
      return c.json({ error: "Task not found" }, 404);
    }

    const row = await findTaskById(db, userId(c), updated.id);

    if (!row) {
      return c.json({ error: "Task not found" }, 404);
    }

    const response: TaskResponse = { task: toTask(row) };

    return c.json(response);
  });

  app.delete("/tasks/:id", async (c) => {
    const access = await resolveTaskAccess(db, userId(c), c.req.param("id"));
    if (access !== "owner") {
      return c.json({ error: "Task not found" }, 404);
    }

    const deleted = await softDeleteTask(db, userId(c), c.req.param("id"));

    if (!deleted) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.body(null, 204);
  });

  app.post(
    "/tasks/:id/subtasks",
    jsonBody(createSubtaskRequestSchema),
    async (c) => {
      const taskId = c.req.param("id");
      const parent = await findTaskById(db, userId(c), taskId);

      if (!parent) {
        return c.json({ error: "Task not found" }, 404);
      }

      await createSubtask(db, taskId, c.req.valid("json").title);

      const row = await findTaskById(db, userId(c), taskId);

      if (!row) {
        return c.json({ error: "Task not found" }, 404);
      }

      const response: TaskResponse = { task: toTask(row) };

      return c.json(response, 201);
    },
  );

  app.patch(
    "/tasks/:id/subtasks/reorder",
    jsonBody(reorderSubtasksRequestSchema),
    async (c) => {
      const taskId = c.req.param("id");
      const { subtaskIds } = c.req.valid("json");
      const ok = await reorderSubtasks(db, userId(c), taskId, subtaskIds);

      if (!ok) {
        return c.json({ error: "Task or subtask not found" }, 404);
      }

      const row = await findTaskById(db, userId(c), taskId);

      if (!row) {
        return c.json({ error: "Task not found" }, 404);
      }

      const response: TaskResponse = { task: toTask(row) };

      return c.json(response);
    },
  );

  app.patch(
    "/subtasks/:id",
    jsonBody(updateSubtaskRequestSchema),
    async (c) => {
      const updated = await updateSubtask(
        db,
        userId(c),
        c.req.param("id"),
        c.req.valid("json"),
      );

      if (!updated) {
        return c.json({ error: "Subtask not found" }, 404);
      }

      const row = await findTaskById(db, userId(c), updated.taskId);

      if (!row) {
        return c.json({ error: "Task not found" }, 404);
      }

      const response: TaskResponse = { task: toTask(row) };

      return c.json(response);
    },
  );

  app.delete("/subtasks/:id", async (c) => {
    const deleted = await softDeleteSubtask(db, userId(c), c.req.param("id"));

    if (!deleted) {
      return c.json({ error: "Subtask not found" }, 404);
    }

    return c.body(null, 204);
  });

  return app;
}
