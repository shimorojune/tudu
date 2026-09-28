import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import {
  applyAccept,
  calendarDayIso,
  clampPlacementIndex,
  effectiveDayIso,
  inProgressForPlacement,
  isFieldStale,
  nextStatus,
  PERSONAL_REQUESTS_SPACE,
  proposalFields,
  type ProposalFieldKey,
  type ProposalFields,
  type TaskRequestView,
  type TaskSnapshotForStale,
} from "@tudu/shared";
import type { Bucket } from "@tudu/shared";
import { AccessError, assertMemberIds } from "./access.js";
import { insertTimelineEvents } from "./activity.js";
import {
  assertNowCapForCreate,
  assertNowCapForUpdate,
  NowCapExceededError,
} from "./nowCap.js";
import type { Db } from "./index.js";
import { findCachedJiraIssue, linkTaskToJiraIssue } from "./jira.js";
import { mapTask } from "./mapTask.js";
import { orgMembers, orgs } from "./orgs-schema.js";
import { user } from "./auth-schema.js";
import { taskRequests, type TaskRequestRow } from "./task-requests-schema.js";
import {
  createSubtask,
  createTask,
  loadTaskWithSubtasks,
  nextPosition,
  softDeleteTask,
  type TaskRowWithSubtasks,
} from "./tasks.js";
import { tasks } from "./tasks-schema.js";

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

function mapAccess(error: AccessError): never {
  const status = error.code === "NOT_A_MEMBER" ? 422 : 404;
  throw new RequestError(error.code, error.message, status);
}

function taskSnapshotForStale(row: TaskRowWithSubtasks): TaskSnapshotForStale {
  return {
    scheduledDate: row.scheduledDate,
    bucket: row.bucket,
    title: row.title,
    description: row.description,
    deadline: row.deadline?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    isPrivate: row.isPrivate,
  };
}

function emptyProposal(): ProposalFields {
  return {};
}

export function recipientsForRequest(
  fromUserId: string,
  toUserId: string,
): string[] {
  return fromUserId === toUserId ? [fromUserId] : [fromUserId, toUserId];
}

async function orgIdsForUser(db: Db, userId: string): Promise<string[]> {
  const rows = await db.query.orgMembers.findMany({
    where: and(eq(orgMembers.userId, userId), isNull(orgMembers.leftAt)),
    columns: { orgId: true },
  });
  return rows.map((row) => row.orgId);
}

async function assertLiveOrgMember(
  db: Db,
  userId: string,
  orgId: string,
): Promise<void> {
  try {
    await assertMemberIds(db, orgId, [userId]);
  } catch (error) {
    if (error instanceof AccessError) {
      mapAccess(error);
    }
    throw error;
  }
}

async function loadUsers(
  db: Db,
  ids: string[],
): Promise<Map<string, { name: string | null; email: string }>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, ids));
  return new Map(
    rows.map((row) => [row.id, { name: row.name, email: row.email }]),
  );
}

export async function mapTaskRequest(
  db: Db,
  row: TaskRequestRow,
  task: TaskRowWithSubtasks,
): Promise<TaskRequestView> {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.id, row.orgId),
  });
  const people = await loadUsers(db, [row.fromUserId, row.toUserId]);
  const from = people.get(row.fromUserId);
  const to = people.get(row.toUserId);
  return {
    id: row.id,
    orgId: row.orgId,
    orgName: org?.name ?? "Organization",
    orgSlug: org?.slug ?? "",
    orgColor: org?.color ?? "vermilion",
    kind: row.kind,
    status: row.status,
    from: {
      id: row.fromUserId,
      name: from?.name ?? null,
      email: from?.email ?? "",
    },
    to: {
      id: row.toUserId,
      name: to?.name ?? null,
      email: to?.email ?? "",
    },
    task: mapTask(task),
    proposal: row.proposal as ProposalFields,
    baseline: row.baseline as ProposalFields,
    message: row.message,
    declineReason: row.declineReason,
    acceptedFields: row.acceptedFields,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export async function listTaskRequestsForView(
  db: Db,
  userId: string,
  space: string,
): Promise<TaskRequestView[]> {
  let orgFilter: string[];
  if (space === PERSONAL_REQUESTS_SPACE) {
    orgFilter = await orgIdsForUser(db, userId);
  } else {
    await assertLiveOrgMember(db, userId, space);
    orgFilter = [space];
  }
  if (orgFilter.length === 0) {
    return [];
  }

  const rows = await db.query.taskRequests.findMany({
    where: and(
      inArray(taskRequests.orgId, orgFilter),
      or(
        and(
          eq(taskRequests.status, "pending"),
          or(
            eq(taskRequests.toUserId, userId),
            eq(taskRequests.fromUserId, userId),
          ),
        ),
        and(
          inArray(taskRequests.status, [
            "accepted",
            "declined",
            "withdrawn",
            "outdated",
            "returned_resolved",
          ]),
          or(
            eq(taskRequests.toUserId, userId),
            eq(taskRequests.fromUserId, userId),
          ),
        ),
      ),
    ),
    orderBy: [desc(taskRequests.createdAt)],
    limit: 200,
  });

  const views: TaskRequestView[] = [];
  for (const row of rows) {
    const task = await loadTaskWithSubtasks(db, row.taskId);
    if (!task || task.deletedAt) {
      continue;
    }
    views.push(await mapTaskRequest(db, row, task));
  }
  return views;
}

async function findRequestForActor(
  db: Db,
  actorId: string,
  requestId: string,
): Promise<TaskRequestRow> {
  const row = await db.query.taskRequests.findFirst({
    where: eq(taskRequests.id, requestId),
  });
  if (!row) {
    throw new RequestError("VALIDATION", "Request not found", 404);
  }
  if (row.fromUserId !== actorId && row.toUserId !== actorId) {
    throw new RequestError("VALIDATION", "Request not found", 404);
  }
  return row;
}

async function pendingReassignForTask(
  db: Db,
  taskId: string,
): Promise<TaskRequestRow | undefined> {
  const rows = await db.query.taskRequests.findMany({
    where: and(
      eq(taskRequests.taskId, taskId),
      eq(taskRequests.kind, "reassign"),
      eq(taskRequests.status, "pending"),
    ),
    limit: 1,
  });
  return rows[0];
}

export async function sendNewTaskRequest(
  db: Db,
  actorId: string,
  input: {
    orgId: string;
    toUserId: string;
    title: string;
    description: string | null;
    suggestedBucket?: Bucket | null;
    suggestedDeadline?: string | null;
    subtasks?: string[];
    jiraIssueKey?: string | null;
    message?: string | null;
    requestId: string;
    taskId: string;
  },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  if (input.toUserId === actorId) {
    throw new RequestError("VALIDATION", "Cannot send a task to yourself", 422);
  }
  await assertMemberIds(db, input.orgId, [actorId, input.toUserId]);

  const proposal: ProposalFields = {
    title: input.title,
    description: input.description,
    deadline: input.suggestedDeadline ?? undefined,
    placement:
      input.suggestedBucket
        ? {
            scheduledDate: effectiveDayIso(),
            bucket: input.suggestedBucket,
          }
        : undefined,
    jiraIssueKey: input.jiraIssueKey ?? undefined,
  };

  const baseline = emptyProposal();

  const taskRow = await createTask(db, {
    id: input.taskId,
    userId: input.toUserId,
    title: input.title,
    description: input.description,
    scheduledDate: null,
    bucket: null,
    startDate: null,
    deadline: input.suggestedDeadline
      ? new Date(input.suggestedDeadline)
      : null,
    isPrivate: false,
    orgId: input.orgId,
  });

  const requestRows = await db
    .insert(taskRequests)
    .values({
      id: input.requestId,
      orgId: input.orgId,
      kind: "new_task",
      fromUserId: actorId,
      toUserId: input.toUserId,
      taskId: taskRow.id,
      status: "pending",
      proposal,
      baseline,
      message: input.message ?? null,
    })
    .returning();
  const request = requestRows[0]!;

  await db
    .update(tasks)
    .set({ pendingRequestId: request.id })
    .where(eq(tasks.id, taskRow.id));

  if (input.subtasks?.length) {
    for (const title of input.subtasks) {
      await createSubtask(db, taskRow.id, title);
    }
  }

  await insertTimelineEvents(db, taskRow.id, actorId, [
    { type: "inbox_sent", data: { toUserId: input.toUserId } },
  ]);

  const task = await loadTaskWithSubtasks(db, taskRow.id);
  return { request, task: task! };
}

export async function reassignTaskRequest(
  db: Db,
  actorId: string,
  input: {
    taskId: string;
    toUserId: string;
    message?: string | null;
    requestId: string;
  },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  if (input.toUserId === actorId) {
    throw new RequestError("VALIDATION", "Cannot reassign to yourself", 422);
  }

  const task = await loadTaskWithSubtasks(db, input.taskId);
  if (!task || task.userId !== actorId || !task.orgId) {
    throw new RequestError("VALIDATION", "Task not found", 404);
  }
  if (task.pendingRequestId) {
    throw new RequestError("VALIDATION", "Task is not available", 404);
  }

  await assertMemberIds(db, task.orgId, [actorId, input.toUserId]);

  const pending = await pendingReassignForTask(db, input.taskId);
  if (pending) {
    throw new RequestError(
      "REASSIGN_PENDING",
      "A reassign is already pending for this task",
      409,
    );
  }

  if (task.isPrivate) {
    await db
      .update(tasks)
      .set({ isPrivate: false })
      .where(eq(tasks.id, task.id));
    await insertTimelineEvents(db, task.id, actorId, [
      { type: "privacy_changed", data: { isPrivate: false } },
    ]);
  }

  const baseline = taskSnapshotForStale(task);
  const requestRows = await db
    .insert(taskRequests)
    .values({
      id: input.requestId,
      orgId: task.orgId,
      kind: "reassign",
      fromUserId: actorId,
      toUserId: input.toUserId,
      taskId: task.id,
      status: "pending",
      proposal: emptyProposal(),
      baseline,
      message: input.message ?? null,
    })
    .returning();

  const loaded = await loadTaskWithSubtasks(db, task.id);
  return { request: requestRows[0]!, task: loaded! };
}

export async function proposeTaskEdit(
  db: Db,
  actorId: string,
  input: {
    taskId: string;
    fields: ProposalFields;
    message?: string | null;
    requestId: string;
  },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  const task = await loadTaskWithSubtasks(db, input.taskId);
  if (!task || !task.orgId) {
    throw new RequestError("VALIDATION", "Task not found", 404);
  }
  if (task.isPrivate) {
    throw new RequestError("VALIDATION", "Task not found", 404);
  }
  if (task.userId === actorId) {
    throw new RequestError("VALIDATION", "Use direct edit on your own tasks", 422);
  }
  await assertMemberIds(db, task.orgId, [actorId]);

  const keys = proposalFields(input.fields);
  if (keys.length === 0) {
    throw new RequestError("VALIDATION", "Proposal needs at least one field", 422);
  }

  const baseline = taskSnapshotForStale(task);
  const requestRows = await db
    .insert(taskRequests)
    .values({
      id: input.requestId,
      orgId: task.orgId,
      kind: "edit",
      fromUserId: actorId,
      toUserId: task.userId,
      taskId: task.id,
      status: "pending",
      proposal: input.fields,
      baseline,
      message: input.message ?? null,
    })
    .returning();

  return { request: requestRows[0]!, task };
}

export async function outdatePendingProposals(
  db: Db,
  taskId: string,
  voidFields: ProposalFieldKey[],
  exceptRequestId?: string,
): Promise<TaskRequestRow[]> {
  if (voidFields.length === 0) {
    return [];
  }
  const pending = await db.query.taskRequests.findMany({
    where: and(
      eq(taskRequests.taskId, taskId),
      eq(taskRequests.kind, "edit"),
      eq(taskRequests.status, "pending"),
    ),
  });
  const outdated: TaskRequestRow[] = [];
  for (const row of pending) {
    if (row.id === exceptRequestId) {
      continue;
    }
    const fields = proposalFields(row.proposal as ProposalFields);
    if (!fields.some((field) => voidFields.includes(field))) {
      continue;
    }
    const [updated] = await db
      .update(taskRequests)
      .set({ status: "outdated", decidedAt: new Date() })
      .where(eq(taskRequests.id, row.id))
      .returning();
    if (updated) {
      outdated.push(updated);
    }
  }
  return outdated;
}

export async function outdateProposalsOnTaskChange(
  db: Db,
  task: TaskRowWithSubtasks,
): Promise<TaskRequestRow[]> {
  const current = taskSnapshotForStale(task);
  const pending = await db.query.taskRequests.findMany({
    where: and(
      eq(taskRequests.taskId, task.id),
      eq(taskRequests.kind, "edit"),
      eq(taskRequests.status, "pending"),
    ),
  });
  const outdated: TaskRequestRow[] = [];
  for (const row of pending) {
    const baseline = row.baseline as TaskSnapshotForStale;
    const fields = proposalFields(row.proposal as ProposalFields);
    const stale = fields.some((field) =>
      isFieldStale(field, baseline, current),
    );
    if (!stale) {
      continue;
    }
    const [updated] = await db
      .update(taskRequests)
      .set({ status: "outdated", decidedAt: new Date() })
      .where(eq(taskRequests.id, row.id))
      .returning();
    if (updated) {
      outdated.push(updated);
    }
  }
  return outdated;
}

export async function acceptTaskRequest(
  db: Db,
  actorId: string,
  input: {
    requestId: string;
    fields?: string[];
    bucket?: Bucket;
  },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  const row = await findRequestForActor(db, actorId, input.requestId);
  if (row.status !== "pending") {
    throw new RequestError(
      "REQUEST_NOT_PENDING",
      "Request is no longer pending",
      409,
    );
  }
  if (row.toUserId !== actorId) {
    throw new RequestError("VALIDATION", "Only the recipient can accept", 403);
  }

  const task = await loadTaskWithSubtasks(db, row.taskId);
  if (!task) {
    throw new RequestError("VALIDATION", "Task not found", 404);
  }

  if (row.kind === "new_task") {
    const today = effectiveDayIso();
    const bucket = input.bucket ?? "next";
    try {
      await assertNowCapForCreate(db, actorId, today, bucket, row.orgId);
    } catch (error) {
      if (error instanceof NowCapExceededError) {
        throw new RequestError(
          "NOW_CAP_REACHED",
          "Now is full in this organization",
          409,
        );
      }
      throw error;
    }
    const position = await nextPosition(db, actorId, today, bucket);
    await db
      .update(tasks)
      .set({
        pendingRequestId: null,
        scheduledDate: today,
        bucket,
        position,
        inProgress: inProgressForPlacement(bucket, today, calendarDayIso()),
      })
      .where(eq(tasks.id, task.id));
    const [updatedRequest] = await db
      .update(taskRequests)
      .set({
        status: nextStatus("pending", "accept"),
        decidedAt: new Date(),
        acceptedFields: ["placement"],
      })
      .where(eq(taskRequests.id, row.id))
      .returning();
    await insertTimelineEvents(db, task.id, actorId, [
      { type: "inbox_accepted", data: {} },
    ]);
    const loaded = await loadTaskWithSubtasks(db, task.id);
    return { request: updatedRequest!, task: loaded! };
  }

  if (row.kind === "reassign") {
    await db
      .update(tasks)
      .set({ userId: actorId })
      .where(eq(tasks.id, task.id));
    const outdated = await outdatePendingProposals(db, task.id, [
      "placement",
      "title",
      "description",
      "deadline",
      "completed",
      "jiraIssueKey",
    ]);
    void outdated;
    const [updatedRequest] = await db
      .update(taskRequests)
      .set({
        status: nextStatus("pending", "accept"),
        decidedAt: new Date(),
      })
      .where(eq(taskRequests.id, row.id))
      .returning();
    await insertTimelineEvents(db, task.id, actorId, [
      { type: "moved", data: { reason: "reassigned" } },
    ]);
    const loaded = await loadTaskWithSubtasks(db, task.id);
    return { request: updatedRequest!, task: loaded! };
  }

  const proposal = row.proposal as ProposalFields;
  const acceptedKeys = (input.fields?.length
    ? input.fields
    : proposalFields(proposal)) as ProposalFieldKey[];
  const { taskPatch, voidFields } = applyAccept(proposal, acceptedKeys);

  let position: number | undefined;
  if (taskPatch.scheduledDate && taskPatch.bucket) {
    try {
      await assertNowCapForUpdate(
        db,
        actorId,
        task,
        taskPatch.scheduledDate,
        taskPatch.bucket,
      );
    } catch (error) {
      if (error instanceof NowCapExceededError) {
        throw new RequestError(
          "NOW_CAP_REACHED",
          "Now is full in this organization",
          409,
        );
      }
      throw error;
    }
    if (proposal.placement?.index !== undefined) {
      const laneSize =
        (await nextPosition(db, actorId, taskPatch.scheduledDate, taskPatch.bucket)) +
        1;
      position = clampPlacementIndex(proposal.placement.index, laneSize);
    } else {
      position = await nextPosition(
        db,
        actorId,
        taskPatch.scheduledDate,
        taskPatch.bucket,
      );
    }
  }

  const updateFields: Record<string, unknown> = {};
  if (taskPatch.title !== undefined) updateFields.title = taskPatch.title;
  if (taskPatch.description !== undefined) {
    updateFields.description = taskPatch.description;
  }
  if (taskPatch.scheduledDate !== undefined) {
    updateFields.scheduledDate = taskPatch.scheduledDate;
  }
  if (taskPatch.bucket !== undefined) updateFields.bucket = taskPatch.bucket;
  if (position !== undefined) updateFields.position = position;
  if (taskPatch.deadline !== undefined) {
    updateFields.deadline = taskPatch.deadline
      ? new Date(taskPatch.deadline)
      : null;
  }
  if (taskPatch.completedAt !== undefined) {
    updateFields.completedAt = taskPatch.completedAt
      ? new Date(taskPatch.completedAt)
      : null;
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(tasks).set(updateFields).where(eq(tasks.id, task.id));
  }

  if (acceptedKeys.includes("jiraIssueKey") && proposal.jiraIssueKey) {
    const issue = await findCachedJiraIssue(db, actorId, proposal.jiraIssueKey);
    if (!issue) {
      throw new RequestError(
        "JIRA_NOT_CONNECTED",
        "Connect Jira before accepting this link",
        409,
      );
    }
    await linkTaskToJiraIssue(db, {
      userId: actorId,
      taskId: task.id,
      issueId: issue.id,
      issueKey: issue.key,
    });
  }

  await outdatePendingProposals(db, task.id, voidFields, row.id);

  const [updatedRequest] = await db
    .update(taskRequests)
    .set({
      status: nextStatus("pending", "accept"),
      decidedAt: new Date(),
      acceptedFields: acceptedKeys,
    })
    .where(eq(taskRequests.id, row.id))
    .returning();

  const loaded = await loadTaskWithSubtasks(db, task.id);
  return { request: updatedRequest!, task: loaded! };
}

export async function declineTaskRequest(
  db: Db,
  actorId: string,
  input: { requestId: string; reason?: string | null },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  const row = await findRequestForActor(db, actorId, input.requestId);
  if (row.status !== "pending") {
    throw new RequestError(
      "REQUEST_NOT_PENDING",
      "Request is no longer pending",
      409,
    );
  }
  if (row.toUserId !== actorId) {
    throw new RequestError("VALIDATION", "Only the recipient can decline", 403);
  }

  const task = await loadTaskWithSubtasks(db, row.taskId);
  if (!task) {
    throw new RequestError("VALIDATION", "Task not found", 404);
  }

  if (row.kind === "new_task") {
    await db
      .update(tasks)
      .set({
        userId: row.fromUserId,
        pendingRequestId: null,
      })
      .where(eq(tasks.id, task.id));
  }

  const [updatedRequest] = await db
    .update(taskRequests)
    .set({
      status: nextStatus("pending", "decline"),
      declineReason: input.reason?.trim() || null,
      decidedAt: new Date(),
    })
    .where(eq(taskRequests.id, row.id))
    .returning();

  await insertTimelineEvents(db, task.id, actorId, [
    { type: "inbox_declined", data: { reason: input.reason ?? null } },
  ]);

  const loaded = await loadTaskWithSubtasks(db, task.id);
  return { request: updatedRequest!, task: loaded! };
}

export async function withdrawTaskRequest(
  db: Db,
  actorId: string,
  requestId: string,
): Promise<TaskRequestRow> {
  const row = await findRequestForActor(db, actorId, requestId);
  if (row.fromUserId !== actorId) {
    throw new RequestError("VALIDATION", "Only the sender can withdraw", 403);
  }
  if (row.status !== "pending") {
    throw new RequestError(
      "REQUEST_NOT_PENDING",
      "Request is no longer pending",
      409,
    );
  }

  const [updated] = await db
    .update(taskRequests)
    .set({
      status: nextStatus("pending", "withdraw"),
      decidedAt: new Date(),
    })
    .where(eq(taskRequests.id, row.id))
    .returning();

  if (row.kind === "new_task") {
    await softDeleteTask(db, row.fromUserId, row.taskId);
  }

  return updated!;
}

export async function returnedTakeTaskRequest(
  db: Db,
  actorId: string,
  input: { requestId: string; bucket: Bucket },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  const row = await findRequestForActor(db, actorId, input.requestId);
  if (row.kind !== "new_task" || row.status !== "declined") {
    throw new RequestError("VALIDATION", "Request is not a returned task", 422);
  }
  if (row.fromUserId !== actorId) {
    throw new RequestError("VALIDATION", "Only the sender can take this back", 403);
  }

  const today = effectiveDayIso();
  await assertNowCapForCreate(db, actorId, today, input.bucket, row.orgId);
  const position = await nextPosition(db, actorId, today, input.bucket);
  await db
    .update(tasks)
    .set({
      scheduledDate: today,
      bucket: input.bucket,
      position,
      pendingRequestId: null,
      inProgress: inProgressForPlacement(input.bucket, today, calendarDayIso()),
    })
    .where(eq(tasks.id, row.taskId));

  const [updated] = await db
    .update(taskRequests)
    .set({
      status: nextStatus("declined", "return_resolve"),
      decidedAt: new Date(),
    })
    .where(eq(taskRequests.id, row.id))
    .returning();

  const task = await loadTaskWithSubtasks(db, row.taskId);
  return { request: updated!, task: task! };
}

export async function returnedResendTaskRequest(
  db: Db,
  actorId: string,
  input: { requestId: string; toUserId: string; newRequestId: string },
): Promise<{ request: TaskRequestRow; task: TaskRowWithSubtasks }> {
  const row = await findRequestForActor(db, actorId, input.requestId);
  if (row.kind !== "new_task" || row.status !== "declined") {
    throw new RequestError("VALIDATION", "Request is not a returned task", 422);
  }
  if (row.fromUserId !== actorId) {
    throw new RequestError("VALIDATION", "Only the sender can resend", 403);
  }
  if (input.toUserId === actorId) {
    throw new RequestError("VALIDATION", "Cannot send a task to yourself", 422);
  }

  const task = await loadTaskWithSubtasks(db, row.taskId);
  if (!task) {
    throw new RequestError("VALIDATION", "Task not found", 404);
  }

  await assertMemberIds(db, row.orgId, [actorId, input.toUserId]);

  const proposal = row.proposal as ProposalFields;
  const requestRows = await db
    .insert(taskRequests)
    .values({
      id: input.newRequestId,
      orgId: row.orgId,
      kind: "new_task",
      fromUserId: actorId,
      toUserId: input.toUserId,
      taskId: task.id,
      status: "pending",
      proposal,
      baseline: row.baseline as ProposalFields,
      message: row.message,
    })
    .returning();
  const request = requestRows[0]!;

  await db
    .update(tasks)
    .set({
      userId: input.toUserId,
      pendingRequestId: request.id,
      scheduledDate: null,
      bucket: null,
    })
    .where(eq(tasks.id, task.id));

  await db
    .update(taskRequests)
    .set({
      status: nextStatus("declined", "return_resolve"),
      decidedAt: new Date(),
    })
    .where(eq(taskRequests.id, row.id));

  const loaded = await loadTaskWithSubtasks(db, task.id);
  return { request, task: loaded! };
}

export async function returnedDiscardTaskRequest(
  db: Db,
  actorId: string,
  requestId: string,
): Promise<TaskRequestRow> {
  const row = await findRequestForActor(db, actorId, requestId);
  if (row.kind !== "new_task" || row.status !== "declined") {
    throw new RequestError("VALIDATION", "Request is not a returned task", 422);
  }
  if (row.fromUserId !== actorId) {
    throw new RequestError("VALIDATION", "Only the sender can discard", 403);
  }

  await softDeleteTask(db, actorId, row.taskId);

  const [updated] = await db
    .update(taskRequests)
    .set({
      status: nextStatus("declined", "return_resolve"),
      decidedAt: new Date(),
    })
    .where(eq(taskRequests.id, row.id))
    .returning();

  return updated!;
}

export async function listPendingSentByUser(
  db: Db,
  orgId: string,
  userId: string,
  taskId?: string,
): Promise<TaskRequestRow[]> {
  return db.query.taskRequests.findMany({
    where: and(
      eq(taskRequests.orgId, orgId),
      eq(taskRequests.fromUserId, userId),
      eq(taskRequests.status, "pending"),
      taskId ? eq(taskRequests.taskId, taskId) : undefined,
    ),
  });
}
