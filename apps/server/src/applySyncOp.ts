import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@tudu/db";
import {
  ManagerActionError,
  acceptInboxItem,
  acceptManagerInvite,
  assertManagerAction,
  claimMutation,
  createComment,
  createManagerInvite,
  createProject,
  createSubtask,
  createTask,
  currentSyncSeq,
  declineInboxItem,
  declineManagerInvite,
  deleteReportTask,
  emitSync,
  eventsForMutation,
  findTaskById,
  listCommentsForTask,
  listInbox,
  listProjectsForUser,
  listReportDayTasks,
  listTasksForDay,
  listTasksForProject,
  listTeam,
  listTimelineForTask,
  listUnscheduledTasks,
  loadTaskWithSubtasks,
  managerIdForOwner,
  mapComment,
  mapProject,
  mapTask,
  mapTimelineEvent,
  recipientsForTaskId,
  releaseMutation,
  reorderReportTasks,
  reorderSubtasks,
  reorderTasks,
  resolveTaskAccess,
  rollOverTasks,
  sendInboxTask,
  softDeleteComment,
  softDeleteSubtask,
  softDeleteTask,
  subtasks,
  tasks,
  uniqueIds,
  updateComment,
  updateProject,
  updateSubtask,
  updateTask,
  findProjectById,
  ProjectError,
  user,
  insertAndEmitNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UpdateTaskFields,
} from "@tudu/db";
import {
  effectiveDayIso,
  isSlipping,
  isTaskChangeTimelineType,
  parseViewKey,
  type InboxHistoryItem,
  type InboxPendingItem,
  type SyncEvent,
  type SyncOp,
  type TeamInvite,
  type TeamResponse,
  type UpdateTaskRequest,
} from "@tudu/shared";
import { notifySync } from "./syncHub.js";

export class SyncOpError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
    this.name = "SyncOpError";
  }
}

function toUpdateFields(patch: UpdateTaskRequest): UpdateTaskFields {
  const fields: UpdateTaskFields = {};

  if ("title" in patch) fields.title = patch.title;
  if ("description" in patch) fields.description = patch.description ?? null;
  if ("scheduledDate" in patch) fields.scheduledDate = patch.scheduledDate;
  if ("bucket" in patch) fields.bucket = patch.bucket;
  if ("startDate" in patch) fields.startDate = patch.startDate;
  if ("isPrivate" in patch) fields.isPrivate = patch.isPrivate;

  if ("deadline" in patch) {
    fields.deadline = patch.deadline ? new Date(patch.deadline) : null;
  }

  if ("completed" in patch) {
    fields.completedAt = patch.completed ? new Date() : null;
  }

  if ("inProgress" in patch) {
    fields.inProgress = patch.inProgress;
  }

  if ("projectId" in patch) {
    fields.projectId = patch.projectId ?? null;
  }

  return fields;
}

function wrapManager(error: unknown): never {
  if (error instanceof ManagerActionError) {
    throw new SyncOpError(error.message, error.status);
  }
  if (error instanceof ProjectError) {
    throw new SyncOpError(error.message, error.status);
  }
  throw error;
}

function mapTeam(team: Awaited<ReturnType<typeof listTeam>>): TeamResponse {
  return {
    reports: team.reports,
    manager: team.manager,
    outgoingInvites: team.outgoingInvites.map(toInvite),
    incomingInvites: team.incomingInvites.map(toInvite),
  };
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

function toPending(row: Awaited<ReturnType<typeof listInbox>>["pending"][number]): InboxPendingItem {
  return {
    id: row.item.id,
    kind: row.kind,
    from: row.from,
    task: mapTask(row.task),
    declineReason: row.item.declineReason,
    createdAt: row.item.createdAt.toISOString(),
  };
}

function toHistory(
  row: Awaited<ReturnType<typeof listInbox>>["history"][number],
): InboxHistoryItem {
  return {
    id: row.item.id,
    status: row.item.status === "accepted" ? "accepted" : "declined",
    title: row.title,
    from: row.from,
    bucket: row.item.status === "accepted" ? row.bucket : null,
    declineReason: row.item.declineReason,
    createdAt: row.item.createdAt.toISOString(),
  };
}

async function emitAndNotify(events: SyncEvent[]): Promise<SyncEvent[]> {
  notifySync(events.map((event) => event.recipientUserId));
  return events;
}

async function emitTaskSnapshot(
  db: Db,
  taskId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const task = await loadTaskWithSubtasks(db, taskId);
  if (!task) {
    return [];
  }

  const recipients = await recipientsForTaskId(db, taskId);
  const events = await emitSync(db, {
    recipientUserIds: recipients,
    clientMutationId,
    type: "task.upsert",
    payload: { task: mapTask(task), ownerId: task.userId },
  });

  if (task.isPrivate) {
    const manager = await managerIdForOwner(db, task.userId);
    if (manager) {
      events.push(
        ...(await emitSync(db, {
          recipientUserIds: [manager],
          clientMutationId,
          type: "task.hide",
          payload: { id: taskId },
        })),
      );
    }
  }

  return events;
}

async function emitProjectSnapshot(
  db: Db,
  projectId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const row = await findProjectById(db, projectId);
  if (!row) {
    return [];
  }

  return emitSync(db, {
    recipientUserIds: [row.userId],
    clientMutationId,
    type: "project.upsert",
    payload: mapProject(row),
  });
}

async function emitLatestTimeline(
  db: Db,
  taskId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const rows = await listTimelineForTask(db, taskId, { limit: 1 });
  const row = rows[0];
  if (!row) {
    return [];
  }
  const recipients = await recipientsForTaskId(db, taskId);
  return emitSync(db, {
    recipientUserIds: recipients,
    clientMutationId,
    type: "timeline.append",
    payload: mapTimelineEvent(row),
  });
}

async function emitRosterForOwner(
  db: Db,
  ownerId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const manager = await managerIdForOwner(db, ownerId);
  if (!manager) {
    return [];
  }
  const date = effectiveDayIso();
  try {
    const team = await listTeam(db, manager, date);
    return emitSync(db, {
      recipientUserIds: [manager],
      clientMutationId,
      type: "roster.upsert",
      payload: { date, team: mapTeam(team) },
    });
  } catch {
    return [];
  }
}

async function emitInboxForUser(
  db: Db,
  userId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const { pending } = await listInbox(db, userId);
  const events: SyncEvent[] = [];
  for (const row of pending) {
    events.push(
      ...(await emitSync(db, {
        recipientUserIds: [userId],
        clientMutationId,
        type: "inbox.upsert",
        payload: toPending(row),
      })),
    );
  }
  return events;
}

export async function applySyncOp(
  db: Db,
  actorId: string,
  clientMutationId: string,
  op: SyncOp,
): Promise<SyncEvent[]> {
  const claimed = await claimMutation(db, actorId, clientMutationId);
  if (claimed === "duplicate") {
    return eventsForMutation(db, actorId, clientMutationId);
  }

  const collected: SyncEvent[] = [];

  async function push(events: SyncEvent[]) {
    collected.push(...events);
  }

  try {
    switch (op.type) {
      case "task.create": {
        await createTask(db, {
          id: op.id,
          userId: actorId,
          title: op.body.title,
          description: op.body.description ?? null,
          scheduledDate: op.body.scheduledDate ?? null,
          bucket: op.body.bucket ?? null,
          startDate: op.body.startDate ?? null,
          deadline: op.body.deadline ? new Date(op.body.deadline) : null,
          isPrivate: op.body.isPrivate ?? false,
          projectId: op.body.projectId ?? null,
        });
        await push(await emitTaskSnapshot(db, op.id, clientMutationId));
        await push(await emitLatestTimeline(db, op.id, clientMutationId));
        await push(await emitRosterForOwner(db, actorId, clientMutationId));
        break;
      }
      case "task.update": {
        const access = await resolveTaskAccess(db, actorId, op.id);
        if (!access) {
          throw new SyncOpError("Task not found", 404);
        }
        if (access.role !== "owner") {
          throw new SyncOpError("Not allowed", 403);
        }
        const updated = await updateTask(db, actorId, op.id, toUpdateFields(op.patch));
        if (!updated) {
          throw new SyncOpError("Task not found", 404);
        }
        await push(await emitTaskSnapshot(db, op.id, clientMutationId));
        await push(await emitLatestTimeline(db, op.id, clientMutationId));
        await push(await emitRosterForOwner(db, actorId, clientMutationId));
        if (actorId !== access.task.userId) {
          const latest = await listTimelineForTask(db, op.id, { limit: 1 });
          const row = latest[0];
          if (row && isTaskChangeTimelineType(row.type)) {
            await push(
              await insertAndEmitNotifications(db, {
                recipientUserIds: [access.task.userId],
                actorId,
                clientMutationId,
                kind: "task_changed",
                taskTitle: updated.title,
                changeType: row.type,
                taskId: op.id,
                ownerId: access.task.userId,
                scheduledDate: updated.scheduledDate,
              }),
            );
          }
        }
        break;
      }
      case "task.delete": {
        const access = await resolveTaskAccess(db, actorId, op.id);
        if (!access) {
          throw new SyncOpError("Task not found", 404);
        }
        const recipients = await recipientsForTaskId(db, op.id);
        const ownerId = access.task.userId;
        const deletedTitle = access.task.title;
        const deletedDate = access.task.scheduledDate;
        if (access.role === "manager") {
          const deleted = await deleteReportTask(db, actorId, op.id);
          if (!deleted) {
            throw new SyncOpError("Task not found", 404);
          }
        } else {
          const deleted = await softDeleteTask(db, actorId, op.id);
          if (!deleted) {
            throw new SyncOpError("Task not found", 404);
          }
        }
        await push(
          await emitSync(db, {
            recipientUserIds: recipients,
            clientMutationId,
            type: "task.delete",
            payload: { id: op.id },
          }),
        );
        if (actorId !== ownerId) {
          await push(
            await insertAndEmitNotifications(db, {
              recipientUserIds: [ownerId],
              actorId,
              clientMutationId,
              kind: "task_deleted",
              taskTitle: deletedTitle,
              taskId: op.id,
              ownerId,
              scheduledDate: deletedDate,
            }),
          );
        }
        await push(await emitRosterForOwner(db, ownerId, clientMutationId));
        break;
      }
      case "task.reorder": {
        const ok = await reorderTasks(db, actorId, op.body.lanes);
        if (!ok) {
          throw new SyncOpError("Task not found", 404);
        }
        const taskIds = [...new Set(op.body.lanes.flatMap((lane) => lane.taskIds))];
        for (const taskId of taskIds) {
          await push(await emitTaskSnapshot(db, taskId, clientMutationId));
          await push(await emitLatestTimeline(db, taskId, clientMutationId));
        }
        await push(await emitRosterForOwner(db, actorId, clientMutationId));
        break;
      }
      case "task.rollover": {
        const result = await rollOverTasks(db, actorId, op.body.toDate);
        for (const taskId of result.taskIds) {
          await push(await emitTaskSnapshot(db, taskId, clientMutationId));
          await push(await emitLatestTimeline(db, taskId, clientMutationId));
        }
        await push(await emitRosterForOwner(db, actorId, clientMutationId));
        break;
      }
      case "subtask.create": {
        const parent = await findTaskById(db, actorId, op.taskId);
        if (!parent) {
          throw new SyncOpError("Task not found", 404);
        }
        await createSubtask(db, op.taskId, op.body.title, op.id);
        await push(await emitTaskSnapshot(db, op.taskId, clientMutationId));
        break;
      }
      case "subtask.update": {
        const row = await updateSubtask(db, actorId, op.id, op.patch);
        if (!row) {
          throw new SyncOpError("Subtask not found", 404);
        }
        await push(await emitTaskSnapshot(db, row.taskId, clientMutationId));
        break;
      }
      case "subtask.delete": {
        const existing = await dbFindSubtaskParent(db, actorId, op.id);
        const ok = await softDeleteSubtask(db, actorId, op.id);
        if (!ok || !existing) {
          throw new SyncOpError("Subtask not found", 404);
        }
        await push(await emitTaskSnapshot(db, existing, clientMutationId));
        break;
      }
      case "subtask.reorder": {
        const ok = await reorderSubtasks(db, actorId, op.taskId, op.body.subtaskIds);
        if (!ok) {
          throw new SyncOpError("Task or subtask not found", 404);
        }
        await push(await emitTaskSnapshot(db, op.taskId, clientMutationId));
        break;
      }
      case "comment.create": {
        const access = await resolveTaskAccess(db, actorId, op.taskId);
        if (!access) {
          throw new SyncOpError("Task not found", 404);
        }
        try {
          assertManagerAction(access, "comment");
        } catch {
          throw new SyncOpError("Not allowed", 403);
        }
        const created = await createComment(db, actorId, op.taskId, op.body.body, op.id);
        if (!created) {
          throw new SyncOpError("Task not found", 404);
        }
        const recipients = await recipientsForTaskId(db, op.taskId);
        await push(
          await emitSync(db, {
            recipientUserIds: recipients,
            clientMutationId,
            type: "comment.upsert",
            payload: mapComment(created),
          }),
        );
        await push(await emitTaskSnapshot(db, op.taskId, clientMutationId));
        await push(await emitLatestTimeline(db, op.taskId, clientMutationId));
        await push(
          await insertAndEmitNotifications(db, {
            recipientUserIds: recipients,
            actorId,
            clientMutationId,
            kind: "comment",
            taskTitle: access.task.title,
            commentQuote: created.body,
            taskId: op.taskId,
            ownerId: access.task.userId,
            commentId: created.id,
            scheduledDate: access.task.scheduledDate,
          }),
        );
        break;
      }
      case "comment.update": {
        const updated = await updateComment(db, actorId, op.id, op.patch.body);
        if (!updated) {
          throw new SyncOpError("Comment not found", 404);
        }
        const recipients = await recipientsForTaskId(db, updated.taskId);
        await push(
          await emitSync(db, {
            recipientUserIds: recipients,
            clientMutationId,
            type: "comment.upsert",
            payload: mapComment(updated),
          }),
        );
        await push(await emitLatestTimeline(db, updated.taskId, clientMutationId));
        break;
      }
      case "comment.delete": {
        const deleted = await softDeleteComment(db, actorId, op.id);
        if (!deleted) {
          throw new SyncOpError("Comment not found", 404);
        }
        const recipients = await recipientsForTaskId(db, op.taskId);
        await push(
          await emitSync(db, {
            recipientUserIds: recipients,
            clientMutationId,
            type: "comment.delete",
            payload: { id: op.id, taskId: op.taskId },
          }),
        );
        await push(await emitTaskSnapshot(db, op.taskId, clientMutationId));
        await push(await emitLatestTimeline(db, op.taskId, clientMutationId));
        break;
      }
      case "inbox.accept": {
        try {
          const task = await acceptInboxItem(
            db,
            actorId,
            op.id,
            op.body.bucket,
            effectiveDayIso(),
          );
          const { history } = await listInbox(db, actorId);
          const row = history.find((item) => item.item.id === op.id);
          await push(
            await emitSync(db, {
              recipientUserIds: [actorId],
              clientMutationId,
              type: "inbox.delete",
              payload: {
                id: op.id,
                history: row ? toHistory(row) : undefined,
              },
            }),
          );
          await push(await emitTaskSnapshot(db, task.id, clientMutationId));
          await push(await emitLatestTimeline(db, task.id, clientMutationId));
          await push(await emitRosterForOwner(db, actorId, clientMutationId));
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "inbox.decline": {
        try {
          const bounced = await declineInboxItem(db, actorId, op.id, op.body.reason);
          const { history } = await listInbox(db, actorId);
          const row = history.find((item) => item.item.id === op.id);
          await push(
            await emitSync(db, {
              recipientUserIds: [actorId],
              clientMutationId,
              type: "inbox.delete",
              payload: {
                id: op.id,
                history: row ? toHistory(row) : undefined,
              },
            }),
          );
          await push(await emitInboxForUser(db, bounced.toUserId, clientMutationId));
          const bouncedTask = await loadTaskWithSubtasks(db, bounced.taskId);
          if (bouncedTask) {
            await push(
              await insertAndEmitNotifications(db, {
                recipientUserIds: [bounced.toUserId],
                actorId,
                clientMutationId,
                kind: "inbox_declined",
                taskTitle: bouncedTask.title,
                commentQuote: op.body.reason,
                taskId: bounced.taskId,
                ownerId: bounced.toUserId,
                inboxItemId: bounced.id,
                scheduledDate: bouncedTask.scheduledDate,
              }),
            );
          }
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "team.invite.create": {
        try {
          const created = await createManagerInvite(db, actorId, op.body.email);
          const date = effectiveDayIso();
          const team = await listTeam(db, actorId, date);
          await push(
            await emitSync(db, {
              recipientUserIds: [actorId],
              clientMutationId,
              type: "roster.upsert",
              payload: { date, team: mapTeam(team) },
            }),
          );
          const invitee = await db.query.user.findFirst({
            where: eq(user.email, created.email),
          });
          if (invitee && invitee.id !== actorId) {
            const inviteeTeam = await listTeam(db, invitee.id, date);
            await push(
              await emitSync(db, {
                recipientUserIds: [invitee.id],
                clientMutationId,
                type: "roster.upsert",
                payload: { date, team: mapTeam(inviteeTeam) },
              }),
            );
          }
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "team.invite.accept": {
        try {
          await acceptManagerInvite(db, actorId, op.id);
          const date = effectiveDayIso();
          const team = await listTeam(db, actorId, date);
          await push(
            await emitSync(db, {
              recipientUserIds: [actorId],
              clientMutationId,
              type: "roster.upsert",
              payload: { date, team: mapTeam(team) },
            }),
          );
          if (team.manager) {
            const managerTeam = await listTeam(db, team.manager.id, date);
            await push(
              await emitSync(db, {
                recipientUserIds: [team.manager.id],
                clientMutationId,
                type: "roster.upsert",
                payload: { date, team: mapTeam(managerTeam) },
              }),
            );
          }
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "team.invite.decline": {
        try {
          await declineManagerInvite(db, actorId, op.id);
          const date = effectiveDayIso();
          const team = await listTeam(db, actorId, date);
          await push(
            await emitSync(db, {
              recipientUserIds: [actorId],
              clientMutationId,
              type: "roster.upsert",
              payload: { date, team: mapTeam(team) },
            }),
          );
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "team.task.send": {
        try {
          const sent = await sendInboxTask(db, actorId, op.userId, {
            id: op.id,
            title: op.body.title,
            description: op.body.description ?? null,
            startDate: op.body.startDate ?? null,
            deadline: op.body.deadline ? new Date(op.body.deadline) : null,
            projectId: op.body.projectId,
          });
          if (sent.task.projectId) {
            await push(await emitProjectSnapshot(db, sent.task.projectId, clientMutationId));
          }
          await push(await emitInboxForUser(db, op.userId, clientMutationId));
          await push(await emitLatestTimeline(db, sent.task.id, clientMutationId));
          await push(
            await insertAndEmitNotifications(db, {
              recipientUserIds: [op.userId],
              actorId,
              clientMutationId,
              kind: "inbox",
              taskTitle: sent.task.title,
              taskId: sent.task.id,
              ownerId: op.userId,
              inboxItemId: sent.item.id,
              scheduledDate: sent.task.scheduledDate,
            }),
          );
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "team.task.reorder": {
        try {
          const ok = await reorderReportTasks(db, actorId, op.userId, op.body.lanes);
          if (!ok) {
            throw new SyncOpError("Task not found", 404);
          }
          const taskIds = [...new Set(op.body.lanes.flatMap((lane) => lane.taskIds))];
          for (const taskId of taskIds) {
            await push(await emitTaskSnapshot(db, taskId, clientMutationId));
          }
          await push(await emitRosterForOwner(db, op.userId, clientMutationId));
        } catch (error) {
          wrapManager(error);
        }
        break;
      }
      case "team.task.delete": {
        const access = await resolveTaskAccess(db, actorId, op.taskId);
        if (!access) {
          throw new SyncOpError("Task not found", 404);
        }
        const recipients = await recipientsForTaskId(db, op.taskId);
        const deletedTitle = access.task.title;
        const deletedDate = access.task.scheduledDate;
        const ownerId = access.task.userId;
        try {
          const deleted = await deleteReportTask(db, actorId, op.taskId);
          if (!deleted) {
            throw new SyncOpError("Task not found", 404);
          }
        } catch (error) {
          wrapManager(error);
        }
        await push(
          await emitSync(db, {
            recipientUserIds: uniqueIds([...recipients, actorId, op.userId]),
            clientMutationId,
            type: "task.delete",
            payload: { id: op.taskId },
          }),
        );
        if (actorId !== ownerId) {
          await push(
            await insertAndEmitNotifications(db, {
              recipientUserIds: [ownerId],
              actorId,
              clientMutationId,
              kind: "task_deleted",
              taskTitle: deletedTitle,
              taskId: op.taskId,
              ownerId,
              scheduledDate: deletedDate,
            }),
          );
        }
        await push(await emitRosterForOwner(db, op.userId, clientMutationId));
        break;
      }
      case "notification.read": {
        const row = await markNotificationRead(db, actorId, op.id);
        if (!row) {
          throw new SyncOpError("Notification not found", 404);
        }
        await push(
          await emitSync(db, {
            recipientUserIds: [actorId],
            clientMutationId,
            type: "notification.upsert",
            payload: row,
          }),
        );
        break;
      }
      case "project.create": {
        const created = await createProject(db, {
          id: op.id,
          userId: actorId,
          name: op.body.name,
          color: op.body.color,
        });
        await push(await emitProjectSnapshot(db, created.id, clientMutationId));
        break;
      }
      case "project.update": {
        const updated = await updateProject(db, actorId, op.id, op.patch);
        if (!updated) {
          throw new SyncOpError("Project not found", 404);
        }
        await push(await emitProjectSnapshot(db, updated.id, clientMutationId));
        break;
      }
      case "notification.readAll": {
        const readAt = await markAllNotificationsRead(db, actorId);
        await push(
          await emitSync(db, {
            recipientUserIds: [actorId],
            clientMutationId,
            type: "notification.readAll",
            payload: { readAt: readAt.toISOString() },
          }),
        );
        break;
      }
      default:
        break;
    }
  } catch (error) {
    await releaseMutation(db, actorId, clientMutationId);
    if (error instanceof SyncOpError) {
      throw error;
    }
    wrapManager(error);
  }

  await emitAndNotify(collected);
  return collected.filter((event) => event.recipientUserId === actorId);
}

async function dbFindSubtaskParent(
  db: Db,
  userId: string,
  subtaskId: string,
): Promise<string | null> {
  const rows = await db
    .select({ taskId: subtasks.taskId })
    .from(subtasks)
    .innerJoin(tasks, eq(subtasks.taskId, tasks.id))
    .where(
      and(
        eq(subtasks.id, subtaskId),
        eq(tasks.userId, userId),
        isNull(subtasks.deletedAt),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  return rows[0]?.taskId ?? null;
}

export async function bootstrapViews(
  db: Db,
  userId: string,
  viewKeys: string[],
): Promise<{ currentSeq: number; events: SyncEvent[] }> {
  const currentSeq = await currentSyncSeq(db);
  const events: SyncEvent[] = [];

  function synthetic(
    type: SyncEvent["type"],
    payload: unknown,
  ): SyncEvent {
    return {
      seq: 0,
      recipientUserId: userId,
      clientMutationId: null,
      type,
      payload,
    };
  }

  for (const key of viewKeys) {
    const view = parseViewKey(key);
    if (!view) {
      continue;
    }

    switch (view.type) {
      case "day": {
        const rows = await listTasksForDay(db, userId, view.date);
        for (const row of rows) {
          events.push(synthetic("task.upsert", { task: mapTask(row), ownerId: userId }));
        }
        break;
      }
      case "unscheduled": {
        const rows = await listUnscheduledTasks(db, userId);
        for (const row of rows) {
          events.push(synthetic("task.upsert", { task: mapTask(row), ownerId: userId }));
        }
        break;
      }
      case "inbox": {
        const { pending, history } = await listInbox(db, userId);
        for (const row of pending) {
          events.push(synthetic("inbox.upsert", toPending(row)));
        }
        events.push(synthetic("inbox.upsert", { history: history.map(toHistory) }));
        break;
      }
      case "notifications": {
        const rows = await listNotifications(db, userId, 50);
        for (const row of rows) {
          events.push(synthetic("notification.upsert", row));
        }
        break;
      }
      case "team": {
        try {
          const team = await listTeam(db, userId, view.date);
          events.push(synthetic("roster.upsert", { date: view.date, team: mapTeam(team) }));
        } catch {
          break;
        }
        break;
      }
      case "reportDay": {
        try {
          const result = await listReportDayTasks(db, userId, view.userId, view.date);
          const tasks = result.tasks.map(mapTask);
          events.push(
            synthetic("reportDay.upsert", {
              report: result.report,
              date: view.date,
              tasks,
              slippingCount: result.tasks.filter((task) =>
                isSlipping({
                  carriedDays: task.carriedDays,
                  deadline: task.deadline?.toISOString() ?? null,
                }),
              ).length,
            }),
          );
        } catch {
          break;
        }
        break;
      }
      case "projects": {
        const rows = await listProjectsForUser(db, userId);
        for (const row of rows) {
          events.push(synthetic("project.upsert", mapProject(row)));
        }
        break;
      }
      case "project": {
        const row = await findProjectById(db, view.projectId);
        if (!row || row.userId !== userId) {
          break;
        }
        events.push(synthetic("project.upsert", mapProject(row)));
        const projectTasks = await listTasksForProject(db, userId, view.projectId);
        for (const task of projectTasks) {
          events.push(
            synthetic("task.upsert", { task: mapTask(task), ownerId: userId }),
          );
        }
        break;
      }
      case "taskDetail": {
        const access = await resolveTaskAccess(db, userId, view.taskId);
        if (!access) {
          break;
        }
        try {
          assertManagerAction(access, "see");
        } catch {
          break;
        }
        const task = await loadTaskWithSubtasks(db, view.taskId);
        if (task) {
          events.push(
            synthetic("task.upsert", { task: mapTask(task), ownerId: task.userId }),
          );
        }
        const comments = await listCommentsForTask(db, view.taskId);
        for (const row of comments) {
          events.push(synthetic("comment.upsert", mapComment(row)));
        }
        const timeline = await listTimelineForTask(db, view.taskId, { limit: 50 });
        for (const row of timeline) {
          events.push(synthetic("timeline.append", mapTimelineEvent(row)));
        }
        break;
      }
      default:
        break;
    }
  }

  return { currentSeq, events };
}
