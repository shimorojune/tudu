import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@tudu/db";
import {
  assertAssignableProject,
  canActorCommentOnTask,
  claimMutation,
  createComment,
  createProject,
  createSubtask,
  createTask,
  currentSyncSeq,
  deleteProject,
  emitSync,
  eventsForMutation,
  findCachedJiraIssue,
  getJiraConnection,
  getJiraConnectionStatus,
  insertTimelineEvents,
  jiraTaskLinks,
  linkTaskToJiraIssue,
  listJiraComments,
  listJiraComponents,
  listJiraIssues,
  listJiraUsers,
  linkedJiraIssueRefsForTask,
  findTaskById,
  listCommentsForTask,
  listLiveTaskIdsForProject,
  listProjectsForUser,
  listTasksForDay,
  listTasksForProject,
  listTimelineForTask,
  listUnscheduledTasks,
  loadTaskWithSubtasks,
  mapComment,
  mapProject,
  mapTask,
  mapTimelineEvent,
  mapTaskRequest,
  acceptTaskRequest,
  declineTaskRequest,
  proposeTaskEdit,
  reassignTaskRequest,
  recipientsForRequest,
  RequestError,
  returnedDiscardTaskRequest,
  returnedResendTaskRequest,
  returnedTakeTaskRequest,
  sendNewTaskRequest,
  withdrawTaskRequest,
  outdateProposalsOnTaskChange,
  recipientsForTaskId,
  releaseMutation,
  reorderSubtasks,
  reorderTasks,
  resolveTaskAccess,
  rollOverTasks,
  softDeleteComment,
  softDeleteSubtask,
  softDeleteTask,
  subtasks,
  tasks,
  updateComment,
  updateProject,
  updateSubtask,
  updateTask,
  findProjectById,
  ProjectError,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UpdateTaskFields,
  unlinkTaskFromJiraIssue,
  upsertJiraComments,
  upsertJiraIssue,
  listTaskRequestsForView,
  taskRequests,
  moveTaskToSpace,
  MoveToSpaceError,
} from "@tudu/db";
import { insertAndEmitNotificationsWithPush } from "./notificationsWithPush.js";
import {
  jiraIssueToTaskLinkSummary,
  parseViewKey,
  type JiraComment,
  type JiraIssue,
  type SyncEvent,
  type SyncOp,
  type UpdateTaskRequest,
} from "@tudu/shared";
import {
  createJiraDataCenterAdapter,
  type JiraAdapter,
  type JiraAdapterFactory,
} from "./jira/client.js";
import {
  ensureAllowedJiraBaseUrl,
  ensureConfiguredJiraProjectKey,
  JiraAccessError,
} from "./jira/access.js";
import { decryptJiraToken } from "./jira/crypto.js";
import { notifySync } from "./syncHub.js";

export class SyncOpError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422,
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

function wrapSyncError(error: unknown): never {
  if (error instanceof JiraAccessError) {
    throw new SyncOpError(error.message, error.status);
  }
  if (error instanceof ProjectError) {
    throw new SyncOpError(error.message, error.status);
  }
  if (error instanceof RequestError) {
    throw new SyncOpError(error.message, error.status);
  }
  throw error;
}

async function emitRequestUpsert(
  db: Db,
  requestId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const row = await db.query.taskRequests.findFirst({
    where: eq(taskRequests.id, requestId),
  });
  if (!row) {
    return [];
  }
  const task = await loadTaskWithSubtasks(db, row.taskId);
  if (!task) {
    return [];
  }
  const payload = await mapTaskRequest(db, row, task);
  return emitSync(db, {
    recipientUserIds: recipientsForRequest(row.fromUserId, row.toUserId),
    clientMutationId,
    type: "request.upsert",
    payload,
  });
}


export function jiraDueDateFromDeadline(deadline: string | null): string | null {
  return deadline ? deadline.slice(0, 10) : null;
}

export function deadlineFromJiraDueDate(dueDate: string | null): Date | null {
  return dueDate ? new Date(`${dueDate}T18:00:00.000Z`) : null;
}

export function taskPatchChangesDeadline(
  patch: UpdateTaskRequest,
  previousDeadline: Date | null,
): boolean {
  if (!("deadline" in patch)) {
    return false;
  }
  return (
    jiraDueDateFromDeadline(patch.deadline ?? null) !==
    jiraDueDateFromDeadline(previousDeadline?.toISOString() ?? null)
  );
}

export type JiraSyncOptions = {
  adapterFactory?: JiraAdapterFactory;
};

function jiraAdapterFactory(options?: JiraSyncOptions): JiraAdapterFactory {
  return options?.adapterFactory ?? createJiraDataCenterAdapter;
}

async function requireJiraAdapter(
  db: Db,
  actorId: string,
  options?: JiraSyncOptions,
): Promise<JiraAdapter> {
  const connection = await getJiraConnection(db, actorId);
  if (!connection) {
    throw new SyncOpError("Jira is not connected", 400);
  }

  ensureAllowedJiraBaseUrl(connection.baseUrl);
  return jiraAdapterFactory(options)({
    baseUrl: connection.baseUrl,
    token: decryptJiraToken({
      encryptedToken: connection.encryptedToken,
      tokenIv: connection.tokenIv,
      tokenAuthTag: connection.tokenAuthTag,
    }),
  });
}

async function taskOwnerForJiraLink(
  db: Db,
  actorId: string,
  taskId: string,
): Promise<{ ownerUserId: string }> {
  const role = await resolveTaskAccess(db, actorId, taskId);
  if (!role) {
    throw new SyncOpError("Task not found", 404);
  }
  if (role !== "owner") {
    throw new SyncOpError("Not allowed", 403);
  }
  const task = await loadTaskWithSubtasks(db, taskId);
  if (!task) {
    throw new SyncOpError("Task not found", 404);
  }
  return { ownerUserId: task.userId };
}

async function linkedTaskIdsForIssue(
  db: Db,
  ownerUserId: string,
  issueId: string,
): Promise<string[]> {
  const rows = await db
    .select({ taskId: jiraTaskLinks.taskId })
    .from(jiraTaskLinks)
    .where(
      and(
        eq(jiraTaskLinks.userId, ownerUserId),
        eq(jiraTaskLinks.issueId, issueId),
        isNull(jiraTaskLinks.deletedAt),
      ),
    );
  return rows.map((row) => row.taskId);
}

async function emitJiraIssueSnapshot(
  db: Db,
  recipientUserId: string,
  issue: JiraIssue,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  return emitSync(db, {
    recipientUserIds: [recipientUserId],
    clientMutationId,
    type: "jira.issue.upsert",
    payload: issue,
  });
}

async function emitJiraCommentSnapshot(
  db: Db,
  recipientUserId: string,
  comment: JiraComment,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  return emitSync(db, {
    recipientUserIds: [recipientUserId],
    clientMutationId,
    type: "jira.comment.upsert",
    payload: comment,
  });
}

async function emitJiraLinkUpsert(
  db: Db,
  recipients: string[],
  taskId: string,
  issue: JiraIssue,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  return emitSync(db, {
    recipientUserIds: recipients,
    clientMutationId,
    type: "jira.link.upsert",
    payload: {
      taskId,
      link: jiraIssueToTaskLinkSummary(issue),
    },
  });
}

async function emitJiraLinkDelete(
  db: Db,
  recipients: string[],
  taskId: string,
  issueIdOrKey: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  return emitSync(db, {
    recipientUserIds: recipients,
    clientMutationId,
    type: "jira.link.delete",
    payload: { taskId, issueIdOrKey },
  });
}

async function emitLinkedTaskSnapshots(
  db: Db,
  ownerUserId: string,
  issueId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];
  const taskIds = await linkedTaskIdsForIssue(db, ownerUserId, issueId);
  for (const taskId of taskIds) {
    events.push(...(await emitTaskSnapshot(db, taskId, clientMutationId)));
  }
  return events;
}

async function syncOwnerIssue(
  db: Db,
  ownerUserId: string,
  issue: JiraIssue,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  await upsertJiraIssue(db, ownerUserId, issue);
  const cached = await findCachedJiraIssue(db, ownerUserId, issue.id);
  const events = await emitJiraIssueSnapshot(db, ownerUserId, cached ?? issue, clientMutationId);
  events.push(...(await emitLinkedTaskSnapshots(db, ownerUserId, issue.id, clientMutationId)));
  return events;
}

async function emitActorIssueSnapshot(
  db: Db,
  actorId: string,
  ownerUserId: string,
  issue: JiraIssue,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  if (actorId === ownerUserId) {
    return [];
  }
  await upsertJiraIssue(db, actorId, issue);
  const cached = await findCachedJiraIssue(db, actorId, issue.id);
  return emitJiraIssueSnapshot(db, actorId, cached ?? issue, clientMutationId);
}

async function linkedTimelineTaskIds(
  db: Db,
  actorId: string,
  ownerUserId: string,
  issueId: string,
): Promise<string[]> {
  if (actorId !== ownerUserId) {
    return [];
  }
  return linkedTaskIdsForIssue(db, ownerUserId, issueId);
}

async function appendJiraTimelineForIssue(
  db: Db,
  actorId: string,
  ownerUserId: string,
  issue: Pick<JiraIssue, "id" | "key">,
  type: Parameters<typeof insertTimelineEvents>[3][number]["type"],
  data: Record<string, unknown>,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];
  const taskIds = await linkedTimelineTaskIds(db, actorId, ownerUserId, issue.id);
  for (const taskId of taskIds) {
    await insertTimelineEvents(db, taskId, actorId, [
      { type, data: { issueId: issue.id, issueKey: issue.key, ...data } },
    ]);
    events.push(...(await emitLatestTimeline(db, taskId, clientMutationId)));
  }
  return events;
}

async function updateLinkedTaskDeadlines(
  db: Db,
  actorId: string,
  ownerUserId: string,
  issue: JiraIssue,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  if (actorId !== ownerUserId) {
    return [];
  }
  const taskIds = await linkedTaskIdsForIssue(db, ownerUserId, issue.id);
  if (taskIds.length === 0) {
    return [];
  }

  const nextDeadline = deadlineFromJiraDueDate(issue.dueDate);
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, ownerUserId),
      inArray(tasks.id, taskIds),
      isNull(tasks.deletedAt),
    ),
  });
  const events: SyncEvent[] = [];
  const nextTime = nextDeadline?.getTime() ?? null;

  for (const row of rows) {
    const previous = row.deadline?.toISOString() ?? null;
    const previousTime = row.deadline?.getTime() ?? null;
    if (previousTime === nextTime) {
      continue;
    }

    await db
      .update(tasks)
      .set({ deadline: nextDeadline })
      .where(
        and(
          eq(tasks.id, row.id),
          eq(tasks.userId, ownerUserId),
          isNull(tasks.deletedAt),
        ),
      );
    await insertTimelineEvents(db, row.id, actorId, [
      {
        type: "jira_due_date_changed",
        data: {
          issueId: issue.id,
          issueKey: issue.key,
          from: previous,
          to: nextDeadline?.toISOString() ?? null,
          dueDate: issue.dueDate,
        },
      },
    ]);
    events.push(...(await emitTaskSnapshot(db, row.id, clientMutationId)));
    events.push(...(await emitLatestTimeline(db, row.id, clientMutationId)));
  }

  return events;
}

async function updateLinkedJiraDueDates(
  db: Db,
  actorId: string,
  taskId: string,
  dueDate: string | null,
  options: JiraSyncOptions | undefined,
): Promise<JiraIssue[]> {
  const refs = await linkedJiraIssueRefsForTask(db, actorId, taskId);
  if (refs.length === 0) {
    return [];
  }
  const adapter = await requireJiraAdapter(db, actorId, options);
  const issues: JiraIssue[] = [];
  for (const ref of refs) {
    issues.push(await adapter.updateIssue(ref.issueKey, { dueDate }));
  }
  return issues;
}

function opAssignee(assignee: unknown): JiraIssue["assignee"] | undefined {
  if (assignee === undefined) {
    return undefined;
  }
  return (assignee ?? null) as JiraIssue["assignee"];
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
  const ownerIds = recipients.filter((id) => id === task.userId);
  const otherIds = recipients.filter((id) => id !== task.userId);
  const events: SyncEvent[] = [];

  if (ownerIds.length > 0) {
    events.push(
      ...(await emitSync(db, {
        recipientUserIds: ownerIds,
        clientMutationId,
        type: "task.upsert",
        payload: { task: mapTask(task), ownerId: task.userId },
      })),
    );
  }

  if (otherIds.length > 0) {
    events.push(
      ...(await emitSync(db, {
        recipientUserIds: otherIds,
        clientMutationId,
        type: "task.upsert",
        payload: {
          task: mapTask(task, { hidePrivateProjects: true }),
          ownerId: task.userId,
        },
      })),
    );
  }

  return events;
}

async function emitProjectFanout(
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

export async function applySyncOp(
  db: Db,
  actorId: string,
  clientMutationId: string,
  op: SyncOp,
  options?: JiraSyncOptions,
): Promise<SyncEvent[]> {
  const claimed = await claimMutation(db, actorId, clientMutationId);
  if (claimed === "duplicate") {
    return eventsForMutation(db, actorId, clientMutationId);
  }

  const collected: SyncEvent[] = [];
  let releaseOnError = true;

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
          orgId: op.body.orgId ?? null,
        });
        await push(await emitTaskSnapshot(db, op.id, clientMutationId));
        await push(await emitLatestTimeline(db, op.id, clientMutationId));
        break;
      }
      case "task.update": {
        const role = await resolveTaskAccess(db, actorId, op.id);
        if (role !== "owner") {
          throw new SyncOpError(
            role === null ? "Task not found" : "Not allowed",
            role === null ? 404 : 403,
          );
        }
        const existing = await findTaskById(db, actorId, op.id);
        if (!existing) {
          throw new SyncOpError("Task not found", 404);
        }
        if (
          "projectId" in op.patch &&
          op.patch.projectId &&
          op.patch.projectId !== existing.projectId
        ) {
          await assertAssignableProject(db, actorId, op.patch.projectId);
        }
        let pushedJiraDueDateIssues: JiraIssue[] = [];
        if (taskPatchChangesDeadline(op.patch, existing.deadline)) {
          pushedJiraDueDateIssues = await updateLinkedJiraDueDates(
            db,
            actorId,
            op.id,
            jiraDueDateFromDeadline(op.patch.deadline ?? null),
            options,
          );
        }
        const updated = await updateTask(db, actorId, op.id, toUpdateFields(op.patch));
        if (!updated) {
          throw new SyncOpError("Task not found", 404);
        }
        const loaded = await loadTaskWithSubtasks(db, op.id);
        if (loaded) {
          const outdated = await outdateProposalsOnTaskChange(db, loaded);
          for (const row of outdated) {
            await push(
              await emitRequestUpsert(db, row.id, clientMutationId),
            );
          }
        }
        await push(await emitTaskSnapshot(db, op.id, clientMutationId));
        await push(await emitLatestTimeline(db, op.id, clientMutationId));
        for (const issue of pushedJiraDueDateIssues) {
          await push(await syncOwnerIssue(db, actorId, issue, clientMutationId));
        }
        break;
      }
      case "task.delete": {
        const role = await resolveTaskAccess(db, actorId, op.id);
        if (role !== "owner") {
          throw new SyncOpError(
            role === null ? "Task not found" : "Not allowed",
            role === null ? 404 : 403,
          );
        }
        const existing = await findTaskById(db, actorId, op.id);
        if (!existing) {
          throw new SyncOpError("Task not found", 404);
        }
        const recipients = await recipientsForTaskId(db, op.id);
        const deleted = await softDeleteTask(db, actorId, op.id);
        if (!deleted) {
          throw new SyncOpError("Task not found", 404);
        }
        await push(
          await emitSync(db, {
            recipientUserIds: recipients,
            clientMutationId,
            type: "task.delete",
            payload: { id: op.id },
          }),
        );
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
        break;
      }
      case "task.moveToSpace": {
        try {
          await moveTaskToSpace(db, {
            userId: actorId,
            taskId: op.body.taskId,
            orgId: op.body.orgId,
            projectId: op.body.projectId,
            isPrivate: op.body.isPrivate,
          });
        } catch (error) {
          if (error instanceof MoveToSpaceError) {
            const status =
              error.status === 404
                ? 404
                : error.status === 403
                  ? 403
                  : 400;
            throw new SyncOpError(error.message, status);
          }
          throw error;
        }
        await push(await emitTaskSnapshot(db, op.body.taskId, clientMutationId));
        await push(await emitLatestTimeline(db, op.body.taskId, clientMutationId));
        break;
      }
      case "task.rollover": {
        const result = await rollOverTasks(db, actorId, op.body.toDate);
        for (const taskId of result.taskIds) {
          await push(await emitTaskSnapshot(db, taskId, clientMutationId));
          await push(await emitLatestTimeline(db, taskId, clientMutationId));
        }
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
        if (!(await canActorCommentOnTask(db, actorId, op.taskId))) {
          throw new SyncOpError("Not allowed", 403);
        }
        const task = await loadTaskWithSubtasks(db, op.taskId);
        if (!task) {
          throw new SyncOpError("Task not found", 404);
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
          await insertAndEmitNotificationsWithPush(db, {
            recipientUserIds: recipients.filter((id) => id !== actorId),
            actorId,
            clientMutationId,
            kind: "comment",
            taskTitle: task.title,
            commentQuote: created.body,
            taskId: op.taskId,
            ownerId: task.userId,
            commentId: created.id,
            scheduledDate: task.scheduledDate,
          }),
        );
        break;
      }
      case "comment.update": {
        if (!(await canActorCommentOnTask(db, actorId, op.taskId))) {
          throw new SyncOpError("Not allowed", 403);
        }
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
        if (!(await canActorCommentOnTask(db, actorId, op.taskId))) {
          throw new SyncOpError("Not allowed", 403);
        }
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
      case "jira.link": {
        const { ownerUserId } = await taskOwnerForJiraLink(db, actorId, op.taskId);
        const adapter = await requireJiraAdapter(db, actorId, options);
        const issue = await adapter.getIssue(op.issueIdOrKey);
        await upsertJiraIssue(db, ownerUserId, issue);
        await push(await emitActorIssueSnapshot(db, actorId, ownerUserId, issue, clientMutationId));
        await linkTaskToJiraIssue(db, {
          id: op.id,
          userId: ownerUserId,
          taskId: op.taskId,
          issueId: issue.id,
          issueKey: issue.key,
        });
        await insertTimelineEvents(db, op.taskId, actorId, [
          {
            type: "jira_linked",
            data: { issueId: issue.id, issueKey: issue.key },
          },
        ]);
        await push(
          await updateLinkedTaskDeadlines(
            db,
            actorId,
            ownerUserId,
            issue,
            clientMutationId,
          ),
        );
        await push(await emitTaskSnapshot(db, op.taskId, clientMutationId));
        await push(await emitLatestTimeline(db, op.taskId, clientMutationId));
        await push(await syncOwnerIssue(db, ownerUserId, issue, clientMutationId));
        await push(
          await emitJiraLinkUpsert(
            db,
            await recipientsForTaskId(db, op.taskId),
            op.taskId,
            issue,
            clientMutationId,
          ),
        );
        break;
      }
      case "jira.unlink": {
        const { ownerUserId } = await taskOwnerForJiraLink(db, actorId, op.taskId);
        const cached = await findCachedJiraIssue(db, ownerUserId, op.issueIdOrKey);
        const issueRef = cached
          ? { id: cached.id, key: cached.key }
          : { id: op.issueIdOrKey, key: op.issueIdOrKey };
        const ok = await unlinkTaskFromJiraIssue(
          db,
          ownerUserId,
          op.taskId,
          op.issueIdOrKey,
        );
        if (!ok) {
          throw new SyncOpError("Jira link not found", 404);
        }
        await insertTimelineEvents(db, op.taskId, actorId, [
          {
            type: "jira_unlinked",
            data: { issueId: issueRef.id, issueKey: issueRef.key },
          },
        ]);
        await push(await emitTaskSnapshot(db, op.taskId, clientMutationId));
        await push(await emitLatestTimeline(db, op.taskId, clientMutationId));
        if (cached) {
          await push(await syncOwnerIssue(db, ownerUserId, cached, clientMutationId));
        }
        await push(
          await emitJiraLinkDelete(
            db,
            await recipientsForTaskId(db, op.taskId),
            op.taskId,
            op.issueIdOrKey,
            clientMutationId,
          ),
        );
        break;
      }
      case "jira.task.spawn": {
        const adapter = await requireJiraAdapter(db, actorId, options);
        const issue = await adapter.getIssue(op.body.issueId);
        await upsertJiraIssue(db, actorId, issue);
        await createTask(db, {
          id: op.id,
          userId: actorId,
          title: op.body.title,
          description: op.body.description ?? null,
          scheduledDate: op.body.scheduledDate,
          bucket: op.body.bucket,
          startDate: op.body.startDate,
          deadline: op.body.deadline
            ? new Date(op.body.deadline)
            : deadlineFromJiraDueDate(issue.dueDate),
          isPrivate: false,
          projectId: op.body.projectId ?? null,
        });
        await linkTaskToJiraIssue(db, {
          userId: actorId,
          taskId: op.id,
          issueId: issue.id,
          issueKey: issue.key,
        });
        await insertTimelineEvents(db, op.id, actorId, [
          {
            type: "jira_linked",
            data: { issueId: issue.id, issueKey: issue.key },
          },
        ]);
        await push(await emitTaskSnapshot(db, op.id, clientMutationId));
        await push(await emitLatestTimeline(db, op.id, clientMutationId));
        await push(await syncOwnerIssue(db, actorId, issue, clientMutationId));
        break;
      }
      case "jira.issue.create": {
        let ownerUserId = actorId;
        let linkAccess: Awaited<ReturnType<typeof taskOwnerForJiraLink>> | null = null;
        if (op.body.linkTaskId) {
          linkAccess = await taskOwnerForJiraLink(db, actorId, op.body.linkTaskId);
          ownerUserId = linkAccess.ownerUserId;
        }
        await ensureConfiguredJiraProjectKey(db, actorId, op.body.projectKey);
        const adapter = await requireJiraAdapter(db, actorId, options);
        releaseOnError = false;
        const issue = await adapter.createIssue(op.body);
        await upsertJiraIssue(db, actorId, issue);
        if (op.body.linkTaskId) {
          await upsertJiraIssue(db, ownerUserId, issue);
          await linkTaskToJiraIssue(db, {
            userId: ownerUserId,
            taskId: op.body.linkTaskId,
            issueId: issue.id,
            issueKey: issue.key,
          });
          await insertTimelineEvents(db, op.body.linkTaskId, actorId, [
            {
              type: "jira_linked",
              data: { issueId: issue.id, issueKey: issue.key },
            },
          ]);
          await push(
            await updateLinkedTaskDeadlines(
              db,
              actorId,
              ownerUserId,
              issue,
              clientMutationId,
            ),
          );
          await push(await emitTaskSnapshot(db, op.body.linkTaskId, clientMutationId));
          await push(await emitLatestTimeline(db, op.body.linkTaskId, clientMutationId));
        }
        await push(await syncOwnerIssue(db, ownerUserId, issue, clientMutationId));
        await push(await emitActorIssueSnapshot(db, actorId, ownerUserId, issue, clientMutationId));
        break;
      }
      case "jira.issue.updateFields": {
        const ownerUserId = actorId;
        const fields = {
          ...("summary" in op.body ? { summary: op.body.summary } : {}),
          ...("description" in op.body ? { description: op.body.description } : {}),
          ...("dueDate" in op.body ? { dueDate: op.body.dueDate } : {}),
          ...("assignee" in op.body ? { assignee: op.body.assignee } : {}),
        };
        const before = await findCachedJiraIssue(db, ownerUserId, op.body.issueIdOrKey);
        const adapter = await requireJiraAdapter(db, actorId, options);
        const issue = await adapter.updateIssue(op.body.issueIdOrKey, fields);
        await push(await syncOwnerIssue(db, ownerUserId, issue, clientMutationId));
        await push(await emitActorIssueSnapshot(db, actorId, ownerUserId, issue, clientMutationId));
        if ("summary" in op.body) {
          await push(
            await appendJiraTimelineForIssue(
              db,
              actorId,
              ownerUserId,
              issue,
              "jira_summary_changed",
              { from: before?.summary ?? null, to: issue.summary },
              clientMutationId,
            ),
          );
        }
        if ("description" in op.body) {
          await push(
            await appendJiraTimelineForIssue(
              db,
              actorId,
              ownerUserId,
              issue,
              "jira_description_changed",
              {},
              clientMutationId,
            ),
          );
        }
        if ("dueDate" in op.body) {
          await push(
            await updateLinkedTaskDeadlines(
              db,
              actorId,
              ownerUserId,
              issue,
              clientMutationId,
            ),
          );
        }
        if ("assignee" in op.body) {
          await push(
            await appendJiraTimelineForIssue(
              db,
              actorId,
              ownerUserId,
              issue,
              "jira_assignee_changed",
              {
                from: before?.assignee?.displayName ?? null,
                to: issue.assignee?.displayName ?? null,
              },
              clientMutationId,
            ),
          );
        }
        break;
      }
      case "jira.issue.updateDueDate": {
        const adapter = await requireJiraAdapter(db, actorId, options);
        const issue = await adapter.updateIssue(op.issueIdOrKey, {
          dueDate: op.dueDate,
        });
        await push(await syncOwnerIssue(db, actorId, issue, clientMutationId));
        await push(await updateLinkedTaskDeadlines(db, actorId, actorId, issue, clientMutationId));
        break;
      }
      case "jira.issue.updateAssignee": {
        const adapter = await requireJiraAdapter(db, actorId, options);
        const before = await findCachedJiraIssue(db, actorId, op.issueIdOrKey);
        const issue = await adapter.assignIssue(
          op.issueIdOrKey,
          opAssignee(op.assignee) ?? null,
        );
        await push(await syncOwnerIssue(db, actorId, issue, clientMutationId));
        await push(
          await appendJiraTimelineForIssue(
            db,
            actorId,
            actorId,
            issue,
            "jira_assignee_changed",
            {
              from: before?.assignee?.displayName ?? null,
              to: issue.assignee?.displayName ?? null,
            },
            clientMutationId,
          ),
        );
        break;
      }
      case "jira.comment.create": {
        const ownerUserId = actorId;
        const adapter = await requireJiraAdapter(db, actorId, options);
        releaseOnError = false;
        const comment = await adapter.addComment(op.issueIdOrKey, op.body);
        await upsertJiraComments(db, ownerUserId, [comment]);
        await upsertJiraComments(db, actorId, [comment]);
        await push(await emitJiraCommentSnapshot(db, actorId, comment, clientMutationId));
        if (ownerUserId !== actorId) {
          await push(await emitJiraCommentSnapshot(db, ownerUserId, comment, clientMutationId));
        }
        await push(
          await appendJiraTimelineForIssue(
            db,
            actorId,
            ownerUserId,
            { id: comment.issueId, key: comment.issueKey },
            "jira_commented",
            { commentId: comment.id },
            clientMutationId,
          ),
        );
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
          isPrivate: op.body.isPrivate,
          orgId: op.body.orgId ?? null,
        });
        await push(await emitProjectFanout(db, created.id, clientMutationId));
        break;
      }
      case "project.update": {
        const before = await findProjectById(db, op.id);
        const updated = await updateProject(db, actorId, op.id, op.patch);
        if (!updated) {
          throw new SyncOpError("Project not found", 404);
        }
        await push(await emitProjectFanout(db, updated.id, clientMutationId));
        if (before && before.isPrivate !== updated.isPrivate) {
          const taskIds = await listLiveTaskIdsForProject(db, updated.id);
          for (const taskId of taskIds) {
            await push(await emitTaskSnapshot(db, taskId, clientMutationId));
          }
        }
        break;
      }
      case "project.delete": {
        let deleted;
        let taskIds: string[];
        try {
          taskIds = await listLiveTaskIdsForProject(db, op.id);
          deleted = await deleteProject(db, actorId, op.id);
        } catch (error) {
          wrapSyncError(error);
        }
        await push(
          await emitSync(db, {
            recipientUserIds: [deleted.userId],
            clientMutationId,
            type: "project.delete",
            payload: { id: deleted.id },
          }),
        );
        for (const taskId of taskIds) {
          await push(await emitTaskSnapshot(db, taskId, clientMutationId));
        }
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
      case "request.send": {
        const result = await sendNewTaskRequest(db, actorId, {
          orgId: op.body.orgId,
          toUserId: op.body.toUserId,
          title: op.body.title,
          description: op.body.description ?? null,
          suggestedBucket: op.body.suggestedBucket ?? null,
          suggestedDeadline: op.body.suggestedDeadline ?? null,
          subtasks: op.body.subtasks,
          jiraIssueKey: op.body.jiraIssueKey ?? null,
          message: op.body.message ?? null,
          requestId: op.id,
          taskId: randomUUID(),
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        await push(await emitTaskSnapshot(db, result.task.id, clientMutationId));
        break;
      }
      case "request.reassign": {
        const result = await reassignTaskRequest(db, actorId, {
          taskId: op.body.taskId,
          toUserId: op.body.toUserId,
          message: op.body.message ?? null,
          requestId: op.id,
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        break;
      }
      case "request.propose": {
        const result = await proposeTaskEdit(db, actorId, {
          taskId: op.body.taskId,
          fields: op.body.fields,
          message: op.body.message ?? null,
          requestId: op.id,
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        break;
      }
      case "request.accept": {
        const result = await acceptTaskRequest(db, actorId, {
          requestId: op.body.requestId,
          fields: op.body.fields,
          bucket: op.body.bucket,
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        await push(await emitTaskSnapshot(db, result.task.id, clientMutationId));
        await push(await emitLatestTimeline(db, result.task.id, clientMutationId));
        break;
      }
      case "request.decline": {
        const result = await declineTaskRequest(db, actorId, {
          requestId: op.body.requestId,
          reason: op.body.reason ?? null,
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        await push(await emitTaskSnapshot(db, result.task.id, clientMutationId));
        break;
      }
      case "request.withdraw": {
        const row = await withdrawTaskRequest(db, actorId, op.body.requestId);
        await push(await emitRequestUpsert(db, row.id, clientMutationId));
        if (row.kind === "new_task") {
          await push(
            await emitSync(db, {
              recipientUserIds: recipientsForRequest(row.fromUserId, row.toUserId),
              clientMutationId,
              type: "task.delete",
              payload: { id: row.taskId },
            }),
          );
        }
        break;
      }
      case "request.returned.take": {
        const result = await returnedTakeTaskRequest(db, actorId, {
          requestId: op.body.requestId,
          bucket: op.body.bucket,
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        await push(await emitTaskSnapshot(db, result.task.id, clientMutationId));
        break;
      }
      case "request.returned.resend": {
        const result = await returnedResendTaskRequest(db, actorId, {
          requestId: op.body.requestId,
          toUserId: op.body.toUserId,
          newRequestId: op.id,
        });
        await push(await emitRequestUpsert(db, result.request.id, clientMutationId));
        await push(await emitTaskSnapshot(db, result.task.id, clientMutationId));
        break;
      }
      case "request.returned.discard": {
        const row = await returnedDiscardTaskRequest(
          db,
          actorId,
          op.body.requestId,
        );
        await push(await emitRequestUpsert(db, row.id, clientMutationId));
        await push(
          await emitSync(db, {
            recipientUserIds: [actorId],
            clientMutationId,
            type: "task.delete",
            payload: { id: row.taskId },
          }),
        );
        break;
      }
      default:
        break;
    }
  } catch (error) {
    if (releaseOnError) {
      await releaseMutation(db, actorId, clientMutationId);
    }
    if (error instanceof SyncOpError) {
      throw error;
    }
    wrapSyncError(error);
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
      case "notifications": {
        const rows = await listNotifications(db, userId, 100);
        for (const row of rows) {
          events.push(synthetic("notification.upsert", row));
        }
        break;
      }
      case "jira": {
        events.push(synthetic("jira.connection", await getJiraConnectionStatus(db, userId)));
        for (const issue of await listJiraIssues(db, userId)) {
          events.push(synthetic("jira.issue.upsert", issue));
        }
        break;
      }
      case "jiraIssue": {
        const issue = await findCachedJiraIssue(db, userId, view.issueIdOrKey);
        if (!issue) {
          break;
        }
        events.push(synthetic("jira.issue.upsert", issue));
        const comments = await listJiraComments(db, userId, issue.id);
        for (const comment of comments) {
          events.push(synthetic("jira.comment.upsert", comment));
        }
        break;
      }
      case "jiraComponents": {
        for (const component of await listJiraComponents(db, userId)) {
          events.push(synthetic("jira.component.upsert", component));
        }
        break;
      }
      case "jiraUsers": {
        for (const jiraUser of await listJiraUsers(db, userId)) {
          events.push(synthetic("jira.user.upsert", jiraUser));
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
      case "requests": {
        const rows = await listTaskRequestsForView(db, userId, view.space);
        for (const row of rows) {
          events.push(synthetic("request.upsert", row));
        }
        break;
      }
      case "taskDetail": {
        const role = await resolveTaskAccess(db, userId, view.taskId);
        if (!role) {
          break;
        }
        const task = await loadTaskWithSubtasks(db, view.taskId);
        if (task) {
          events.push(
            synthetic("task.upsert", {
              task: mapTask(task, {
                hidePrivateProjects: role === "reader",
              }),
              ownerId: task.userId,
            }),
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
