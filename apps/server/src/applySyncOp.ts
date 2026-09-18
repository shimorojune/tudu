import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@tudu/db";
import {
  ManagerActionError,
  acceptInboxItem,
  acceptManagerInvite,
  assertAssignableProject,
  assertManagerAction,
  claimMutation,
  createComment,
  createManagerInvite,
  assertPublicAssignableProject,
  createProject,
  createProjectForReport,
  createSubtask,
  createTask,
  currentSyncSeq,
  declineInboxItem,
  declineManagerInvite,
  deleteProject,
  deleteReportTask,
  emitSync,
  eventsForMutation,
  findCachedJiraIssue,
  findLiveLink,
  getJiraConnection,
  getJiraConnectionStatus,
  insertTimelineEvents,
  jiraTaskLinks,
  linkTaskToJiraIssue,
  listJiraComments,
  listJiraComponents,
  listJiraIssues,
  listReportJiraIssues,
  listJiraUsers,
  linkedJiraIssueRefsForTask,
  findTaskById,
  listCommentsForTask,
  listInbox,
  listLiveTaskIdsForProject,
  listProjectsForUser,
  listPublicProjectsForUser,
  listReportDayTasks,
  listReportInbox,
  listReportUnscheduledTasks,
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
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  managerVisibleJiraLinkedTasks,
  type TaskAccess,
  type UpdateTaskFields,
  unlinkTaskFromJiraIssue,
  upsertJiraComments,
  upsertJiraIssue,
} from "@tudu/db";
import { insertAndEmitNotificationsWithPush } from "./notificationsWithPush.js";
import {
  effectiveDayIso,
  isSlipping,
  isTaskChangeTimelineType,
  jiraIssueToTaskLinkSummary,
  parseViewKey,
  type JiraComment,
  type JiraIssue,
  type ManagerPermissions,
  type InboxHistoryItem,
  type InboxPendingItem,
  type SyncEvent,
  type SyncOp,
  type TeamInvite,
  type TeamResponse,
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
  requireReportVisibleJiraIssue,
} from "./jira/access.js";
import { decryptJiraToken } from "./jira/crypto.js";
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
  if (error instanceof JiraAccessError) {
    throw new SyncOpError(error.message, error.status);
  }
  if (error instanceof ProjectError) {
    throw new SyncOpError(error.message, error.status);
  }
  throw error;
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

type JiraFieldPatch = Partial<
  Pick<JiraIssue, "summary" | "description" | "dueDate" | "assignee">
>;

export function canWriteReportJiraFields(
  permissions: ManagerPermissions,
  fields: JiraFieldPatch,
): boolean {
  if (!permissions.canSeeDay) {
    return false;
  }
  const writesIssueFields =
    "summary" in fields || "description" in fields || "assignee" in fields;
  const writesDueDate = "dueDate" in fields;
  if (writesIssueFields && !permissions.canEdit) {
    return false;
  }
  if (writesDueDate && !permissions.canEditDeadlines) {
    return false;
  }
  return writesIssueFields || writesDueDate;
}

export function canCreateReportJiraComment(
  permissions: ManagerPermissions,
): boolean {
  return permissions.canSeeDay && permissions.canComment;
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

async function assertReportAccess(
  db: Db,
  actorId: string,
  reportUserId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof findLiveLink>>>> {
  const link = await findLiveLink(db, actorId, reportUserId);
  if (!link?.permissions?.canSeeDay) {
    throw new SyncOpError("Not a report of yours", 403);
  }
  return link;
}

async function assertReportJiraFieldAccess(
  db: Db,
  actorId: string,
  reportUserId: string,
  fields: JiraFieldPatch,
): Promise<NonNullable<Awaited<ReturnType<typeof findLiveLink>>>> {
  const link = await assertReportAccess(db, actorId, reportUserId);
  if (!link.permissions || !canWriteReportJiraFields(link.permissions, fields)) {
    throw new SyncOpError("Not allowed", 403);
  }
  return link;
}

async function assertReportJiraCommentAccess(
  db: Db,
  actorId: string,
  reportUserId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof findLiveLink>>>> {
  const link = await assertReportAccess(db, actorId, reportUserId);
  if (!link.permissions || !canCreateReportJiraComment(link.permissions)) {
    throw new SyncOpError("Not allowed", 403);
  }
  return link;
}

function assertReportJiraTaskSpawnAccess(
  permissions: ManagerPermissions | null | undefined,
): void {
  if (!permissions?.canSendInbox) {
    throw new SyncOpError("Not allowed to send tasks", 403);
  }
}

async function taskOwnerForJiraLink(
  db: Db,
  actorId: string,
  taskId: string,
): Promise<{ ownerUserId: string; access: TaskAccess }> {
  const access = await resolveTaskAccess(db, actorId, taskId);
  if (!access) {
    throw new SyncOpError("Task not found", 404);
  }
  if (access.role === "manager") {
    try {
      assertManagerAction(access, "edit");
    } catch {
      throw new SyncOpError("Not allowed", 403);
    }
  }
  return { ownerUserId: access.task.userId, access };
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

async function emitReportJiraIssueSnapshot(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  issue: JiraIssue,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  return emitSync(db, {
    recipientUserIds: [managerUserId],
    clientMutationId,
    type: "jira.reportIssue.upsert",
    payload: { reportUserId, issue },
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
  if (actorId === ownerUserId) {
    return linkedTaskIdsForIssue(db, ownerUserId, issueId);
  }

  const link = await assertReportAccess(db, actorId, ownerUserId);
  const visible = await managerVisibleJiraLinkedTasks(
    db,
    ownerUserId,
    issueId,
    link.permissions,
  );
  return visible.map((task) => task.taskId);
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
  permissions?: Pick<ManagerPermissions, "canSeePrivate" | "canEditDeadlines"> | null,
): Promise<SyncEvent[]> {
  if (actorId !== ownerUserId && !permissions?.canEditDeadlines) {
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
      ...(actorId !== ownerUserId && !permissions?.canSeePrivate
        ? [eq(tasks.isPrivate, false)]
        : []),
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

async function emitProjectFanout(
  db: Db,
  projectId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  const row = await findProjectById(db, projectId);
  if (!row) {
    return [];
  }

  const events = await emitSync(db, {
    recipientUserIds: [row.userId],
    clientMutationId,
    type: "project.upsert",
    payload: mapProject(row),
  });

  const manager = await managerIdForOwner(db, row.userId);
  if (!manager || manager === row.userId) {
    return events;
  }

  if (row.isPrivate) {
    events.push(
      ...(await emitSync(db, {
        recipientUserIds: [manager],
        clientMutationId,
        type: "project.delete",
        payload: { id: row.id },
      })),
    );
    return events;
  }

  events.push(
    ...(await emitSync(db, {
      recipientUserIds: [manager],
      clientMutationId,
      type: "project.upsert",
      payload: mapProject(row),
    })),
  );
  return events;
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

async function emitReportInboxForManager(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  clientMutationId: string | null,
): Promise<SyncEvent[]> {
  try {
    const result = await listReportInbox(db, managerUserId, reportUserId);
    return emitSync(db, {
      recipientUserIds: [managerUserId],
      clientMutationId,
      type: "reportInbox.upsert",
      payload: {
        userId: reportUserId,
        report: result.report,
        permissions: result.permissions,
        pending: result.pending.map(toPending),
        history: result.history.map(toHistory),
      },
    });
  } catch {
    return [];
  }
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
        let updated;
        let pushedJiraDueDateIssues: JiraIssue[] = [];
        if (access.role === "owner") {
          if (
            "projectId" in op.patch &&
            op.patch.projectId &&
            op.patch.projectId !== access.task.projectId
          ) {
            await assertAssignableProject(db, actorId, op.patch.projectId);
          }
          if (taskPatchChangesDeadline(op.patch, access.task.deadline)) {
            pushedJiraDueDateIssues = await updateLinkedJiraDueDates(
              db,
              actorId,
              op.id,
              jiraDueDateFromDeadline(op.patch.deadline ?? null),
              options,
            );
          }
          updated = await updateTask(db, actorId, op.id, toUpdateFields(op.patch));
        } else {
          const keys = Object.keys(op.patch);
          if (keys.length !== 1 || !("projectId" in op.patch)) {
            throw new SyncOpError("Not allowed", 403);
          }
          if (op.patch.projectId) {
            await assertPublicAssignableProject(
              db,
              access.task.userId,
              op.patch.projectId,
            );
          }
          updated = await updateTask(db, access.task.userId, op.id, {
            projectId: op.patch.projectId ?? null,
          });
        }
        if (!updated) {
          throw new SyncOpError("Task not found", 404);
        }
        await push(await emitTaskSnapshot(db, op.id, clientMutationId));
        await push(await emitLatestTimeline(db, op.id, clientMutationId));
        await push(await emitRosterForOwner(db, actorId, clientMutationId));
        for (const issue of pushedJiraDueDateIssues) {
          await push(await syncOwnerIssue(db, actorId, issue, clientMutationId));
        }
        if (actorId !== access.task.userId) {
          const latest = await listTimelineForTask(db, op.id, { limit: 1 });
          const row = latest[0];
          if (row && isTaskChangeTimelineType(row.type)) {
            await push(
              await insertAndEmitNotificationsWithPush(db, {
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
            await insertAndEmitNotificationsWithPush(db, {
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
          await insertAndEmitNotificationsWithPush(db, {
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
        const access = await resolveTaskAccess(db, actorId, op.taskId);
        if (!access) {
          throw new SyncOpError("Task not found", 404);
        }
        try {
          assertManagerAction(access, "comment");
        } catch {
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
        const access = await resolveTaskAccess(db, actorId, op.taskId);
        if (!access) {
          throw new SyncOpError("Task not found", 404);
        }
        try {
          assertManagerAction(access, "comment");
        } catch {
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
      case "inbox.accept": {
        try {
          const task = await acceptInboxItem(
            db,
            actorId,
            op.id,
            op.body.bucket,
            effectiveDayIso(),
            op.body.scheduledDate,
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
          const managerId = await managerIdForOwner(db, actorId);
          if (managerId) {
            await push(
              await emitReportInboxForManager(db, managerId, actorId, clientMutationId),
            );
          }
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
          const managerId = await managerIdForOwner(db, actorId);
          if (managerId) {
            await push(
              await emitReportInboxForManager(db, managerId, actorId, clientMutationId),
            );
          }
          const bouncedTask = await loadTaskWithSubtasks(db, bounced.taskId);
          if (bouncedTask) {
            await push(
              await insertAndEmitNotificationsWithPush(db, {
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
            await push(await emitProjectFanout(db, sent.task.projectId, clientMutationId));
          }
          await push(await emitInboxForUser(db, op.userId, clientMutationId));
          await push(
            await emitReportInboxForManager(db, actorId, op.userId, clientMutationId),
          );
          await push(await emitLatestTimeline(db, sent.task.id, clientMutationId));
          await push(
            await insertAndEmitNotificationsWithPush(db, {
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
            await insertAndEmitNotificationsWithPush(db, {
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
      case "jira.link": {
        const { ownerUserId, access } = await taskOwnerForJiraLink(db, actorId, op.taskId);
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
            access.permissions,
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
      case "jira.reportTask.spawn": {
        const link = await assertReportAccess(db, actorId, op.body.reportUserId);
        assertReportJiraTaskSpawnAccess(link.permissions);
        await requireReportVisibleJiraIssue(
          db,
          actorId,
          op.body.reportUserId,
          op.body.issueId,
          link.permissions,
        );
        const adapter = await requireJiraAdapter(db, actorId, options);
        const issue = await adapter.getIssue(op.body.issueId);
        const sent = await sendInboxTask(db, actorId, op.body.reportUserId, {
          id: op.id,
          title: op.body.title,
          description: op.body.description ?? null,
          startDate: op.body.startDate,
          deadline: op.body.deadline
            ? new Date(op.body.deadline)
            : deadlineFromJiraDueDate(issue.dueDate),
          projectId: op.body.projectId ?? undefined,
        });
        await upsertJiraIssue(db, op.body.reportUserId, issue);
        await upsertJiraIssue(db, actorId, issue);
        await linkTaskToJiraIssue(db, {
          userId: op.body.reportUserId,
          taskId: sent.task.id,
          issueId: issue.id,
          issueKey: issue.key,
        });
        await insertTimelineEvents(db, sent.task.id, actorId, [
          {
            type: "jira_linked",
            data: { issueId: issue.id, issueKey: issue.key },
          },
        ]);
        await push(await emitInboxForUser(db, op.body.reportUserId, clientMutationId));
        await push(
          await emitReportInboxForManager(
            db,
            actorId,
            op.body.reportUserId,
            clientMutationId,
          ),
        );
        await push(await emitLatestTimeline(db, sent.task.id, clientMutationId));
        await push(await emitJiraIssueSnapshot(db, actorId, issue, clientMutationId));
        const reportIssue = (
          await listReportJiraIssues(db, actorId, op.body.reportUserId, link.permissions)
        ).find((row) => row.id === issue.id || row.key === issue.key);
        if (reportIssue) {
          await push(
            await emitReportJiraIssueSnapshot(
              db,
              actorId,
              op.body.reportUserId,
              reportIssue,
              clientMutationId,
            ),
          );
        }
        await push(
          await insertAndEmitNotificationsWithPush(db, {
            recipientUserIds: [op.body.reportUserId],
            actorId,
            clientMutationId,
            kind: "inbox",
            taskTitle: sent.task.title,
            taskId: sent.task.id,
            ownerId: op.body.reportUserId,
            inboxItemId: sent.item.id,
            scheduledDate: sent.task.scheduledDate,
          }),
        );
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
              linkAccess?.access.permissions,
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
        const ownerUserId = op.body.reportUserId ?? actorId;
        const fields = {
          ...("summary" in op.body ? { summary: op.body.summary } : {}),
          ...("description" in op.body ? { description: op.body.description } : {}),
          ...("dueDate" in op.body ? { dueDate: op.body.dueDate } : {}),
          ...("assignee" in op.body ? { assignee: op.body.assignee } : {}),
        };
        let permissions: ManagerPermissions | null = null;
        if (op.body.reportUserId) {
          const link = await assertReportJiraFieldAccess(
            db,
            actorId,
            op.body.reportUserId,
            fields,
          );
          permissions = link.permissions;
          await requireReportVisibleJiraIssue(
            db,
            actorId,
            op.body.reportUserId,
            op.body.issueIdOrKey,
            link.permissions,
          );
        }
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
              permissions,
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
        const ownerUserId = op.reportUserId ?? actorId;
        if (op.reportUserId) {
          const link = await assertReportJiraCommentAccess(db, actorId, op.reportUserId);
          await requireReportVisibleJiraIssue(
            db,
            actorId,
            op.reportUserId,
            op.issueIdOrKey,
            link.permissions,
          );
        }
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
        const taskIds = await listLiveTaskIdsForProject(db, op.id);
        const deleted = await deleteProject(db, actorId, op.id);
        if (!deleted) {
          throw new SyncOpError("Project not found", 404);
        }
        const recipients = [deleted.userId];
        const manager = await managerIdForOwner(db, deleted.userId);
        if (manager && manager !== deleted.userId) {
          recipients.push(manager);
        }
        await push(
          await emitSync(db, {
            recipientUserIds: recipients,
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
      case "team.project.create": {
        try {
          const created = await createProjectForReport(db, actorId, op.userId, {
            id: op.id,
            name: op.body.name,
            color: op.body.color,
          });
          await push(await emitProjectFanout(db, created.id, clientMutationId));
        } catch (error) {
          wrapManager(error);
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
      case "reportJira": {
        const link = await findLiveLink(db, userId, view.userId);
        if (!link?.permissions?.canSeeDay) {
          break;
        }
        const issues = await listReportJiraIssues(
          db,
          userId,
          view.userId,
          link.permissions,
        );
        for (const issue of issues) {
          events.push(
            synthetic("jira.reportIssue.upsert", {
              reportUserId: view.userId,
              issue,
            }),
          );
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
          const tasks = result.tasks.map((row) =>
            mapTask(row, { hidePrivateProjects: true }),
          );
          events.push(
            synthetic("reportDay.upsert", {
              report: result.report,
              permissions: result.permissions,
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
      case "reportUnscheduled": {
        try {
          const result = await listReportUnscheduledTasks(db, userId, view.userId);
          for (const row of result.tasks) {
            events.push(
              synthetic("task.upsert", {
                task: mapTask(row, { hidePrivateProjects: true }),
                ownerId: view.userId,
              }),
            );
          }
        } catch {
          break;
        }
        break;
      }
      case "reportInbox": {
        try {
          const result = await listReportInbox(db, userId, view.userId);
          events.push(
            synthetic("reportInbox.upsert", {
              userId: view.userId,
              report: result.report,
              permissions: result.permissions,
              pending: result.pending.map(toPending),
              history: result.history.map(toHistory),
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
      case "reportProjects": {
        const link = await findLiveLink(db, userId, view.userId);
        if (!link?.permissions) {
          break;
        }
        const rows = await listPublicProjectsForUser(db, view.userId);
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
            synthetic("task.upsert", {
              task: mapTask(task, {
                hidePrivateProjects: access.role === "manager",
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
