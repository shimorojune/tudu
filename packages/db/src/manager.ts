import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  acceptScheduledDate,
  canDeclineInboxCard,
  DEFAULT_MANAGER_PERMISSIONS,
  inboxCardKind,
  isSlipping,
  normalizeInviteEmail,
  permitManagerAction,
  type Bucket,
  type InboxCardKind,
  type ManagerAction,
  type ManagerPermissions,
  type Person,
  type ProjectColor,
} from "@tudu/shared";
import type { Db } from "./index.js";
import { user } from "./auth-schema.js";
import {
  createProject,
  findProjectById,
  isPublicAssignableProject,
} from "./projects.js";
import type { ProjectRow } from "./projects-schema.js";
import { countCommentsForTasks, insertTimelineEvents } from "./activity.js";
import {
  inboxItems,
  managerInvites,
  managerLinks,
  managerPermissions,
  type InboxItemRow,
  type ManagerLinkRow,
  type ManagerPermissionRow,
} from "./manager-schema.js";
import { nextPosition, notPendingInbox, type TaskRowWithSubtasks } from "./tasks.js";
import { subtasks, tasks, type TaskRow } from "./tasks-schema.js";

export class ManagerActionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
    this.name = "ManagerActionError";
  }
}

export type TaskAccess = {
  task: TaskRow;
  role: "owner" | "manager";
  permissions: ManagerPermissions | null;
};

const liveSubtasks = {
  subtasks: {
    where: isNull(subtasks.deletedAt),
    orderBy: [asc(subtasks.position)],
  },
  project: true as const,
};

function toPerson(row: { id: string; name: string; email: string }): Person {
  return { id: row.id, name: row.name, email: row.email };
}

function permissionsFromRow(row: ManagerPermissionRow): ManagerPermissions {
  return {
    canSeeDay: row.canSeeDay,
    canSendInbox: row.canSendInbox,
    canComment: row.canComment,
    canReorder: row.canReorder,
    canDelete: row.canDelete,
    canEdit: row.canEdit,
    canComplete: row.canComplete,
    canSeePrivate: row.canSeePrivate,
    canEditDeadlines: row.canEditDeadlines,
  };
}

async function attachCommentCounts(
  db: Db,
  rows: (TaskRow & {
    subtasks: TaskRowWithSubtasks["subtasks"];
    project?: ProjectRow | null;
  })[],
): Promise<TaskRowWithSubtasks[]> {
  const counts = await countCommentsForTasks(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    project: "project" in row ? (row.project ?? null) : null,
    commentCount: counts.get(row.id) ?? 0,
  }));
}

export async function findLiveLinkForReport(
  db: Db,
  reportUserId: string,
): Promise<(ManagerLinkRow & { permissions: ManagerPermissionRow | null }) | undefined> {
  const row = await db.query.managerLinks.findFirst({
    where: and(
      eq(managerLinks.reportUserId, reportUserId),
      isNull(managerLinks.deletedAt),
    ),
    with: { permissions: true },
  });

  return row;
}

export async function findLiveLink(
  db: Db,
  managerUserId: string,
  reportUserId: string,
): Promise<(ManagerLinkRow & { permissions: ManagerPermissionRow | null }) | undefined> {
  const row = await db.query.managerLinks.findFirst({
    where: and(
      eq(managerLinks.managerUserId, managerUserId),
      eq(managerLinks.reportUserId, reportUserId),
      isNull(managerLinks.deletedAt),
    ),
    with: { permissions: true },
  });

  return row;
}

export async function resolveTaskAccess(
  db: Db,
  actorId: string,
  taskId: string,
): Promise<TaskAccess | undefined> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), isNull(tasks.deletedAt)),
  });

  if (!task) {
    return undefined;
  }

  if (task.userId === actorId) {
    return { task, role: "owner", permissions: null };
  }

  const link = await findLiveLink(db, actorId, task.userId);
  if (!link?.permissions) {
    return undefined;
  }

  const permissions = permissionsFromRow(link.permissions);
  if (!permissions.canSeeDay) {
    return undefined;
  }

  if (task.isPrivate && !permissions.canSeePrivate) {
    return undefined;
  }

  return { task, role: "manager", permissions };
}

export function assertManagerAction(
  access: TaskAccess,
  action: ManagerAction,
): void {
  if (access.role === "owner") {
    return;
  }

  if (!access.permissions || !permitManagerAction(access.permissions, action)) {
    throw new ManagerActionError("Not allowed", 403);
  }
}

export async function countPendingInbox(
  db: Db,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .innerJoin(tasks, eq(inboxItems.taskId, tasks.id))
    .where(
      and(
        eq(inboxItems.toUserId, userId),
        eq(inboxItems.status, "pending"),
        isNull(inboxItems.deletedAt),
        isNull(tasks.deletedAt),
      ),
    );

  return rows.length;
}

async function loadPeople(
  db: Db,
  ids: string[],
): Promise<Map<string, Person>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const people = new Map<string, Person>();
  if (unique.length === 0) {
    return people;
  }

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, unique));

  for (const row of rows) {
    people.set(row.id, toPerson(row));
  }

  return people;
}

async function loadTasksByIds(
  db: Db,
  ids: string[],
): Promise<Map<string, TaskRowWithSubtasks>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db.query.tasks.findMany({
    where: and(inArray(tasks.id, ids), isNull(tasks.deletedAt)),
    with: liveSubtasks,
  });
  const withCounts = await attachCommentCounts(db, rows);
  return new Map(withCounts.map((row) => [row.id, row]));
}

export type InboxPendingRow = {
  item: InboxItemRow;
  kind: InboxCardKind;
  from: Person;
  task: TaskRowWithSubtasks;
};

export type InboxHistoryRow = {
  item: InboxItemRow;
  from: Person;
  title: string;
  bucket: TaskRow["bucket"];
};

export async function listInbox(
  db: Db,
  userId: string,
): Promise<{ pending: InboxPendingRow[]; history: InboxHistoryRow[] }> {
  const managerLink = await findLiveLinkForReport(db, userId);
  const actorManagerId = managerLink?.managerUserId ?? null;

  const pendingItems = await db.query.inboxItems.findMany({
    where: and(
      eq(inboxItems.toUserId, userId),
      eq(inboxItems.status, "pending"),
      isNull(inboxItems.deletedAt),
    ),
    orderBy: [desc(inboxItems.createdAt)],
  });

  const historyItems = actorManagerId
    ? await db.query.inboxItems.findMany({
        where: and(
          eq(inboxItems.toUserId, userId),
          eq(inboxItems.fromUserId, actorManagerId),
          inArray(inboxItems.status, ["accepted", "declined"]),
          isNull(inboxItems.deletedAt),
        ),
        orderBy: [desc(inboxItems.updatedAt)],
        limit: 20,
      })
    : [];

  const people = await loadPeople(db, [
    ...pendingItems.map((item) => item.fromUserId),
    ...historyItems.map((item) => item.fromUserId),
  ]);
  const taskMap = await loadTasksByIds(db, [
    ...pendingItems.map((item) => item.taskId),
    ...historyItems.map((item) => item.taskId),
  ]);

  const pending: InboxPendingRow[] = [];
  for (const item of pendingItems) {
    const task = taskMap.get(item.taskId);
    const from = people.get(item.fromUserId);
    if (!task || !from) {
      continue;
    }

    pending.push({
      item,
      kind: inboxCardKind({
        fromUserId: item.fromUserId,
        actorManagerId,
      }),
      from,
      task,
    });
  }

  const history: InboxHistoryRow[] = [];
  for (const item of historyItems) {
    const from = people.get(item.fromUserId);
    const task = taskMap.get(item.taskId);
    if (!from) {
      continue;
    }

    history.push({
      item,
      from,
      title: task?.title ?? "Task",
      bucket: task?.bucket ?? null,
    });
  }

  return { pending, history };
}

export async function sendInboxTask(
  db: Db,
  actorId: string,
  reportUserId: string,
  input: {
    id?: string;
    title: string;
    description: string | null;
    startDate: string | null;
    deadline: Date | null;
    projectId?: string;
  },
): Promise<{ item: InboxItemRow; task: TaskRow }> {
  const link = await findLiveLink(db, actorId, reportUserId);
  if (!link?.permissions) {
    throw new ManagerActionError("Not a report of yours", 403);
  }

  if (!link.permissions.canSendInbox) {
    throw new ManagerActionError("Not allowed to send tasks", 403);
  }

  let projectId: string | null = null;
  if (input.projectId) {
    const reportProject = await findProjectById(db, input.projectId);
    if (!isPublicAssignableProject(reportProject, reportUserId)) {
      throw new ManagerActionError("Project not found", 400);
    }
    projectId = reportProject!.id;
  }

  const position = await nextPosition(db, reportUserId, null, null);
  const inserted = await db
    .insert(tasks)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId: reportUserId,
      title: input.title,
      description: input.description,
      scheduledDate: null,
      bucket: null,
      position,
      startDate: input.startDate,
      deadline: input.deadline,
      isPrivate: false,
      projectId,
    })
    .returning();
  const task = inserted[0]!;

  const [item] = await db
    .insert(inboxItems)
    .values({
      taskId: task.id,
      fromUserId: actorId,
      toUserId: reportUserId,
      status: "pending",
    })
    .returning();

  await insertTimelineEvents(db, task.id, actorId, [
    { type: "inbox_sent", data: {} },
  ]);

  return { item: item!, task };
}

export async function createProjectForReport(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  input: { id?: string; name: string; color: ProjectColor },
): Promise<ProjectRow> {
  const link = await findLiveLink(db, managerUserId, reportUserId);
  if (!link?.permissions) {
    throw new ManagerActionError("Not a report of yours", 403);
  }

  return createProject(db, {
    id: input.id,
    userId: reportUserId,
    name: input.name,
    color: input.color,
    isPrivate: false,
  });
}

export async function acceptInboxItem(
  db: Db,
  actorId: string,
  inboxItemId: string,
  bucket: Bucket,
  today: string,
  requestedDate?: string,
): Promise<TaskRow> {
  const item = await db.query.inboxItems.findFirst({
    where: and(
      eq(inboxItems.id, inboxItemId),
      eq(inboxItems.toUserId, actorId),
      eq(inboxItems.status, "pending"),
      isNull(inboxItems.deletedAt),
    ),
  });

  if (!item) {
    throw new ManagerActionError("Inbox item not found", 404);
  }

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, item.taskId), isNull(tasks.deletedAt)),
  });

  if (!task) {
    throw new ManagerActionError("Task not found", 404);
  }

  const scheduledDate = acceptScheduledDate(requestedDate, task.startDate, today);
  const position = await nextPosition(db, actorId, scheduledDate, bucket);

  await db.batch([
    db
      .update(inboxItems)
      .set({ status: "accepted" })
      .where(eq(inboxItems.id, item.id)),
    db
      .update(tasks)
      .set({
        userId: actorId,
        scheduledDate,
        bucket,
        position,
      })
      .where(eq(tasks.id, task.id)),
  ]);

  await insertTimelineEvents(db, task.id, actorId, [
    { type: "inbox_accepted", data: { bucket, scheduledDate } },
  ]);

  const updated = await db.query.tasks.findFirst({
    where: eq(tasks.id, task.id),
  });

  return updated!;
}

export async function declineInboxItem(
  db: Db,
  actorId: string,
  inboxItemId: string,
  reason: string,
): Promise<InboxItemRow> {
  const item = await db.query.inboxItems.findFirst({
    where: and(
      eq(inboxItems.id, inboxItemId),
      eq(inboxItems.toUserId, actorId),
      eq(inboxItems.status, "pending"),
      isNull(inboxItems.deletedAt),
    ),
  });

  if (!item) {
    throw new ManagerActionError("Inbox item not found", 404);
  }

  const managerLink = await findLiveLinkForReport(db, actorId);
  const kind = inboxCardKind({
    fromUserId: item.fromUserId,
    actorManagerId: managerLink?.managerUserId ?? null,
  });

  if (!canDeclineInboxCard(kind)) {
    throw new ManagerActionError("Returned tasks cannot be declined again", 400);
  }

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, item.taskId), isNull(tasks.deletedAt)),
  });

  if (!task) {
    throw new ManagerActionError("Task not found", 404);
  }

  const bouncePosition = await nextPosition(db, item.fromUserId, null, null);

  const [bounced] = await db
    .insert(inboxItems)
    .values({
      taskId: item.taskId,
      fromUserId: actorId,
      toUserId: item.fromUserId,
      status: "pending",
      declineReason: reason,
    })
    .returning();

  await db.batch([
    db
      .update(inboxItems)
      .set({ status: "declined", declineReason: reason })
      .where(eq(inboxItems.id, item.id)),
    db
      .update(tasks)
      .set({
        userId: item.fromUserId,
        scheduledDate: null,
        bucket: null,
        position: bouncePosition,
      })
      .where(eq(tasks.id, task.id)),
  ]);

  await insertTimelineEvents(db, task.id, actorId, [
    { type: "inbox_declined", data: { reason } },
  ]);

  return bounced!;
}

export async function listTeam(
  db: Db,
  actorId: string,
  date: string,
): Promise<{
  reports: {
    user: Person;
    nowCount: number;
    openCount: number;
    slippingCount: number;
    nowTitle: string | null;
  }[];
  manager: Person | null;
  outgoingInvites: {
    id: string;
    email: string;
    direction: "outgoing";
    inviter: Person;
    createdAt: Date;
  }[];
  incomingInvites: {
    id: string;
    email: string;
    direction: "incoming";
    inviter: Person;
    createdAt: Date;
  }[];
}> {
  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorId),
  });
  if (!actor) {
    throw new ManagerActionError("User not found", 404);
  }

  const reportLinks = await db.query.managerLinks.findMany({
    where: and(
      eq(managerLinks.managerUserId, actorId),
      isNull(managerLinks.deletedAt),
    ),
  });

  const managerLink = await findLiveLinkForReport(db, actorId);
  const people = await loadPeople(db, [
    ...reportLinks.map((link) => link.reportUserId),
    managerLink?.managerUserId ?? "",
    actorId,
  ]);

  const reports = [];
  for (const link of reportLinks) {
    const report = people.get(link.reportUserId);
    if (!report) {
      continue;
    }

    const stats = await rosterStatsForReport(db, link.reportUserId, date);
    reports.push({ user: report, ...stats });
  }

  const outgoing = await db.query.managerInvites.findMany({
    where: and(
      eq(managerInvites.inviterUserId, actorId),
      eq(managerInvites.status, "pending"),
      isNull(managerInvites.deletedAt),
    ),
    orderBy: [desc(managerInvites.createdAt)],
  });

  const incoming = await db.query.managerInvites.findMany({
    where: and(
      eq(managerInvites.reportEmail, actor.email.toLowerCase()),
      eq(managerInvites.status, "pending"),
      isNull(managerInvites.deletedAt),
    ),
    orderBy: [desc(managerInvites.createdAt)],
  });

  const inviterPeople = await loadPeople(db, [
    ...incoming.map((invite) => invite.inviterUserId),
    actorId,
  ]);
  const inviterSelf = people.get(actorId) ?? toPerson(actor);

  return {
    reports,
    manager: managerLink
      ? (people.get(managerLink.managerUserId) ?? null)
      : null,
    outgoingInvites: outgoing.map((invite) => ({
      id: invite.id,
      email: invite.reportEmail,
      direction: "outgoing" as const,
      inviter: inviterSelf,
      createdAt: invite.createdAt,
    })),
    incomingInvites: incoming.map((invite) => ({
      id: invite.id,
      email: invite.reportEmail,
      direction: "incoming" as const,
      inviter: inviterPeople.get(invite.inviterUserId) ?? {
        id: invite.inviterUserId,
        name: "Someone",
        email: "",
      },
      createdAt: invite.createdAt,
    })),
  };
}

async function rosterStatsForReport(
  db: Db,
  reportUserId: string,
  date: string,
) {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, reportUserId),
      isNull(tasks.deletedAt),
      eq(tasks.isPrivate, false),
      notPendingInbox(),
    ),
  });

  const open = rows.filter((row) => row.completedAt === null);
  const nowTasks = open.filter(
    (row) => row.scheduledDate === date && row.bucket === "now",
  );
  const slipping = open.filter((row) =>
    isSlipping({
      carriedDays: row.carriedDays,
      deadline: row.deadline?.toISOString() ?? null,
    }),
  );

  return {
    nowCount: nowTasks.length,
    openCount: open.length,
    slippingCount: slipping.length,
    nowTitle: nowTasks[0]?.title ?? null,
  };
}

export async function listReportDayTasks(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  date: string,
): Promise<{ report: Person; tasks: TaskRowWithSubtasks[] }> {
  const link = await findLiveLink(db, managerUserId, reportUserId);
  if (!link?.permissions || !link.permissions.canSeeDay) {
    throw new ManagerActionError("Not a report of yours", 403);
  }

  const report = await db.query.user.findFirst({
    where: eq(user.id, reportUserId),
  });
  if (!report) {
    throw new ManagerActionError("Report not found", 404);
  }

  const hidePrivate = !link.permissions.canSeePrivate;
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, reportUserId),
      isNull(tasks.deletedAt),
      eq(tasks.scheduledDate, date),
      ...(hidePrivate ? [eq(tasks.isPrivate, false)] : []),
      notPendingInbox(),
    ),
    with: liveSubtasks,
    orderBy: [asc(tasks.bucket), asc(tasks.position)],
  });

  return {
    report: toPerson(report),
    tasks: await attachCommentCounts(db, rows),
  };
}

export async function createManagerInvite(
  db: Db,
  actorId: string,
  email: string,
): Promise<{ id: string; email: string }> {
  const normalized = normalizeInviteEmail(email);
  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorId),
  });
  if (!actor) {
    throw new ManagerActionError("User not found", 404);
  }

  if (actor.email.toLowerCase() === normalized) {
    throw new ManagerActionError("You cannot add yourself", 400);
  }

  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, normalized),
  });

  if (existingUser) {
    const alreadyManaged = await findLiveLinkForReport(db, existingUser.id);
    if (alreadyManaged) {
      throw new ManagerActionError("That person already has a manager", 400);
    }

    const alreadyReport = await findLiveLink(db, actorId, existingUser.id);
    if (alreadyReport) {
      throw new ManagerActionError("They already report to you", 400);
    }
  }

  const pending = await db.query.managerInvites.findFirst({
    where: and(
      eq(managerInvites.inviterUserId, actorId),
      eq(managerInvites.reportEmail, normalized),
      eq(managerInvites.status, "pending"),
      isNull(managerInvites.deletedAt),
    ),
  });

  if (pending) {
    throw new ManagerActionError("Invite already pending", 400);
  }

  const [created] = await db
    .insert(managerInvites)
    .values({
      inviterUserId: actorId,
      reportEmail: normalized,
      reportUserId: existingUser?.id ?? null,
      status: "pending",
    })
    .returning();

  return { id: created!.id, email: normalized };
}

export async function acceptManagerInvite(
  db: Db,
  actorId: string,
  inviteId: string,
): Promise<void> {
  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorId),
  });
  if (!actor) {
    throw new ManagerActionError("User not found", 404);
  }

  const invite = await db.query.managerInvites.findFirst({
    where: and(
      eq(managerInvites.id, inviteId),
      eq(managerInvites.status, "pending"),
      isNull(managerInvites.deletedAt),
    ),
  });

  if (!invite || invite.reportEmail !== actor.email.toLowerCase()) {
    throw new ManagerActionError("Invite not found", 404);
  }

  const already = await findLiveLinkForReport(db, actorId);
  if (already) {
    throw new ManagerActionError("You already have a manager", 400);
  }

  const [link] = await db
    .insert(managerLinks)
    .values({
      managerUserId: invite.inviterUserId,
      reportUserId: actorId,
    })
    .returning();

  await db.insert(managerPermissions).values({
    managerLinkId: link!.id,
    ...DEFAULT_MANAGER_PERMISSIONS,
  });

  await db
    .update(managerInvites)
    .set({
      status: "accepted",
      reportUserId: actorId,
    })
    .where(eq(managerInvites.id, invite.id));
}

export async function declineManagerInvite(
  db: Db,
  actorId: string,
  inviteId: string,
): Promise<void> {
  const actor = await db.query.user.findFirst({
    where: eq(user.id, actorId),
  });
  if (!actor) {
    throw new ManagerActionError("User not found", 404);
  }

  const invite = await db.query.managerInvites.findFirst({
    where: and(
      eq(managerInvites.id, inviteId),
      eq(managerInvites.status, "pending"),
      isNull(managerInvites.deletedAt),
    ),
  });

  if (!invite || invite.reportEmail !== actor.email.toLowerCase()) {
    throw new ManagerActionError("Invite not found", 404);
  }

  await db
    .update(managerInvites)
    .set({ status: "declined", reportUserId: actorId })
    .where(eq(managerInvites.id, invite.id));
}

export async function reorderReportTasks(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  lanes: { scheduledDate: string | null; bucket: Bucket | null; taskIds: string[] }[],
): Promise<boolean> {
  const link = await findLiveLink(db, managerUserId, reportUserId);
  if (!link?.permissions || !permitManagerAction(permissionsFromRow(link.permissions), "reorder")) {
    throw new ManagerActionError("Not allowed to reorder", 403);
  }

  const { reorderTasks } = await import("./tasks.js");
  return reorderTasks(db, reportUserId, lanes);
}

export async function deleteReportTask(
  db: Db,
  managerUserId: string,
  taskId: string,
): Promise<boolean> {
  const access = await resolveTaskAccess(db, managerUserId, taskId);
  if (!access) {
    return false;
  }

  assertManagerAction(access, "delete");
  const { softDeleteTask } = await import("./tasks.js");
  return softDeleteTask(db, access.task.userId, taskId);
}
