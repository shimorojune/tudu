import { zValidator } from "@hono/zod-validator";
import type { Db, SubtaskRow, TaskRowWithSubtasks } from "@tudu/db";
import {
  ManagerActionError,
  acceptInboxItem,
  acceptManagerInvite,
  countPendingInbox,
  createManagerInvite,
  declineInboxItem,
  declineManagerInvite,
  deleteReportTask,
  listInbox,
  listReportDayTasks,
  listTeam,
  reorderReportTasks,
  sendInboxTask,
} from "@tudu/db";
import {
  acceptInboxRequestSchema,
  createInviteRequestSchema,
  declineInboxRequestSchema,
  effectiveDayIso,
  isSlipping,
  reorderRequestSchema,
  sendInboxTaskRequestSchema,
  type InboxCountResponse,
  type InboxHistoryItem,
  type InboxPendingItem,
  type InboxResponse,
  type ReportDayResponse,
  type Subtask,
  type Task,
  type TeamInvite,
  type TeamResponse,
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

function toSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    done: row.done,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTask(row: TaskRowWithSubtasks): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scheduledDate: row.scheduledDate,
    bucket: row.bucket,
    position: row.position,
    startDate: row.startDate,
    deadline: row.deadline?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    inProgress: row.inProgress,
    carriedDays: row.carriedDays,
    carriedSince: row.carriedSince,
    isPrivate: row.isPrivate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subtasks: row.subtasks.map(toSubtask),
    commentCount: row.commentCount,
  };
}

const dateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
    .optional(),
});

function handleManagerError(error: unknown) {
  if (error instanceof ManagerActionError) {
    return { error: error.message, status: error.status } as const;
  }

  throw error;
}

export function createManagerRoute(db: Db) {
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

  app.get("/inbox/count", async (c) => {
    const count = await countPendingInbox(db, userId(c));
    const response: InboxCountResponse = { count };
    return c.json(response);
  });

  app.get("/inbox", async (c) => {
    const { pending, history } = await listInbox(db, userId(c));
    const pendingCards: InboxPendingItem[] = pending.map((row) => ({
      id: row.item.id,
      kind: row.kind,
      from: row.from,
      task: toTask(row.task),
      declineReason: row.item.declineReason,
      createdAt: row.item.createdAt.toISOString(),
    }));
    const historyCards: InboxHistoryItem[] = history.map((row) => ({
      id: row.item.id,
      status: row.item.status === "accepted" ? "accepted" : "declined",
      title: row.title,
      from: row.from,
      bucket: row.item.status === "accepted" ? row.bucket : null,
      declineReason: row.item.declineReason,
      createdAt: row.item.createdAt.toISOString(),
    }));

    const response: InboxResponse = {
      pending: pendingCards,
      history: historyCards,
      count: pendingCards.length,
    };

    return c.json(response);
  });

  app.post(
    "/inbox/:id/accept",
    jsonBody(acceptInboxRequestSchema),
    async (c) => {
      try {
        await acceptInboxItem(
          db,
          userId(c),
          c.req.param("id"),
          c.req.valid("json").bucket,
          effectiveDayIso(),
        );
        return c.body(null, 204);
      } catch (error) {
        const mapped = handleManagerError(error);
        return c.json({ error: mapped.error }, mapped.status);
      }
    },
  );

  app.post(
    "/inbox/:id/decline",
    jsonBody(declineInboxRequestSchema),
    async (c) => {
      try {
        await declineInboxItem(
          db,
          userId(c),
          c.req.param("id"),
          c.req.valid("json").reason,
        );
        return c.body(null, 204);
      } catch (error) {
        const mapped = handleManagerError(error);
        return c.json({ error: mapped.error }, mapped.status);
      }
    },
  );

  app.get("/team", queryParams(dateQuerySchema), async (c) => {
    const date = c.req.valid("query").date ?? effectiveDayIso();
    try {
      const team = await listTeam(db, userId(c), date);
      const response: TeamResponse = {
        reports: team.reports,
        manager: team.manager,
        outgoingInvites: team.outgoingInvites.map(toInvite),
        incomingInvites: team.incomingInvites.map(toInvite),
      };
      return c.json(response);
    } catch (error) {
      const mapped = handleManagerError(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
  });

  app.post("/team/invites", jsonBody(createInviteRequestSchema), async (c) => {
    try {
      const created = await createManagerInvite(
        db,
        userId(c),
        c.req.valid("json").email,
      );
      return c.json(created, 201);
    } catch (error) {
      const mapped = handleManagerError(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
  });

  app.post("/team/invites/:id/accept", async (c) => {
    try {
      await acceptManagerInvite(db, userId(c), c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      const mapped = handleManagerError(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
  });

  app.post("/team/invites/:id/decline", async (c) => {
    try {
      await declineManagerInvite(db, userId(c), c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      const mapped = handleManagerError(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
  });

  app.get("/team/:userId/day", queryParams(dateQuerySchema), async (c) => {
    const date = c.req.valid("query").date ?? effectiveDayIso();
    try {
      const result = await listReportDayTasks(
        db,
        userId(c),
        c.req.param("userId"),
        date,
      );
      const response: ReportDayResponse = {
        report: result.report,
        date,
        tasks: result.tasks.map(toTask),
        slippingCount: result.tasks.filter((task) =>
          isSlipping({
            carriedDays: task.carriedDays,
            deadline: task.deadline?.toISOString() ?? null,
          }),
        ).length,
      };
      return c.json(response);
    } catch (error) {
      const mapped = handleManagerError(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
  });

  app.post(
    "/team/:userId/tasks",
    jsonBody(sendInboxTaskRequestSchema),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const sent = await sendInboxTask(db, userId(c), c.req.param("userId"), {
          title: body.title,
          description: body.description ?? null,
          startDate: body.startDate ?? null,
          deadline: body.deadline ? new Date(body.deadline) : null,
        });
        return c.json({ taskId: sent.task.id, inboxItemId: sent.item.id }, 201);
      } catch (error) {
        const mapped = handleManagerError(error);
        return c.json({ error: mapped.error }, mapped.status);
      }
    },
  );

  app.patch(
    "/team/:userId/reorder",
    jsonBody(reorderRequestSchema),
    async (c) => {
      try {
        const ok = await reorderReportTasks(
          db,
          userId(c),
          c.req.param("userId"),
          c.req.valid("json").lanes,
        );
        if (!ok) {
          return c.json({ error: "One or more tasks were not found" }, 404);
        }
        return c.body(null, 204);
      } catch (error) {
        const mapped = handleManagerError(error);
        return c.json({ error: mapped.error }, mapped.status);
      }
    },
  );

  app.delete("/team/:userId/tasks/:taskId", async (c) => {
    try {
      const deleted = await deleteReportTask(
        db,
        userId(c),
        c.req.param("taskId"),
      );
      if (!deleted) {
        return c.json({ error: "Task not found" }, 404);
      }
      return c.body(null, 204);
    } catch (error) {
      const mapped = handleManagerError(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
  });

  return app;
}

function toInvite(row: {
  id: string;
  email: string;
  direction: "outgoing" | "incoming";
  inviter: TeamInvite["inviter"];
  createdAt: Date;
}): TeamInvite {
  return {
    id: row.id,
    email: row.email,
    direction: row.direction,
    inviter: row.inviter,
    createdAt: row.createdAt.toISOString(),
  };
}
