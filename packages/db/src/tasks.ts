import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { planTaskTimelineEvents } from "@tudu/shared";
import type { Bucket, JiraTaskLinkSummary, Lane } from "@tudu/shared";
import type { Db } from "./index.js";
import {
  applyTaskPatch,
  countCommentsForTasks,
  insertTimelineEvents,
  taskRowPersistableChanged,
  taskRowToSnapshot,
} from "./activity.js";
import { timelineEvents } from "./activity-schema.js";
import { assertAssignableProject, projectNameById } from "./projects.js";
import type { ProjectRow } from "./projects-schema.js";
import { linkSummariesForTasks } from "./jira.js";
import { subtasks, tasks, type SubtaskRow, type TaskRow } from "./tasks-schema.js";

export type TaskRowWithSubtasks = TaskRow & {
  subtasks: SubtaskRow[];
  commentCount: number;
  project: ProjectRow | null;
  jiraLinks: JiraTaskLinkSummary[];
};

export type TaskPlacement = {
  taskId: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
  position: number;
};

/** Flattens lanes into one placement per task. Pure, so it is unit tested directly.
    Positions are contiguous from zero inside each lane. */
export function planReorder(lanes: Lane[]): TaskPlacement[] {
  const placements: TaskPlacement[] = [];
  const seen = new Set<string>();

  for (const lane of lanes) {
    lane.taskIds.forEach((taskId, index) => {
      if (seen.has(taskId)) {
        throw new Error(`Task ${taskId} appears in more than one lane`);
      }

      seen.add(taskId);

      placements.push({
        taskId,
        scheduledDate: lane.scheduledDate,
        bucket: lane.bucket,
        position: index,
      });
    });
  }

  return placements;
}

/** Qualify inbox_items by name. Interpolating `${inboxItems.taskId}` inside a
    tasks query makes Drizzle rewrite it as `"tasks"."task_id"`. */
export function notPendingInbox() {
  return sql`not exists (
    select 1 from "inbox_items"
    where "inbox_items"."task_id" = ${tasks.id}
      and "inbox_items"."status" = 'pending'
      and "inbox_items"."deleted_at" is null
  )`;
}

function laneFilter(
  userId: string,
  scheduledDate: string | null,
  bucket: Bucket | null,
) {
  return and(
    eq(tasks.userId, userId),
    isNull(tasks.deletedAt),
    scheduledDate === null
      ? isNull(tasks.scheduledDate)
      : eq(tasks.scheduledDate, scheduledDate),
    bucket === null ? isNull(tasks.bucket) : eq(tasks.bucket, bucket),
  );
}

const liveSubtasks = {
  subtasks: {
    where: isNull(subtasks.deletedAt),
    orderBy: [asc(subtasks.position)],
  },
  project: true as const,
};

async function attachCommentCounts(
  db: Db,
  rows: (TaskRow & { subtasks: SubtaskRow[]; project?: ProjectRow | null })[],
): Promise<TaskRowWithSubtasks[]> {
  const counts = await countCommentsForTasks(
    db,
    rows.map((row) => row.id),
  );
  const links = await linkSummariesForTasks(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    project: row.project ?? null,
    commentCount: counts.get(row.id) ?? 0,
    jiraLinks: links.get(row.id) ?? [],
  }));
}

export async function listTasksForDay(
  db: Db,
  userId: string,
  scheduledDate: string,
): Promise<TaskRowWithSubtasks[]> {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      eq(tasks.scheduledDate, scheduledDate),
      notPendingInbox(),
    ),
    with: liveSubtasks,
    // Enum sorts in declaration order, so this is Now, Next, Later.
    orderBy: [asc(tasks.bucket), asc(tasks.position)],
  });

  return attachCommentCounts(db, rows);
}

export async function listUnscheduledTasks(
  db: Db,
  userId: string,
): Promise<TaskRowWithSubtasks[]> {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.scheduledDate),
      notPendingInbox(),
    ),
    with: liveSubtasks,
    orderBy: [asc(tasks.position)],
  });

  return attachCommentCounts(db, rows);
}

export async function listTasksForProject(
  db: Db,
  userId: string,
  projectId: string,
): Promise<TaskRowWithSubtasks[]> {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      eq(tasks.projectId, projectId),
      isNull(tasks.deletedAt),
      notPendingInbox(),
    ),
    with: liveSubtasks,
    orderBy: [asc(tasks.scheduledDate), asc(tasks.bucket), asc(tasks.position)],
  });

  return attachCommentCounts(db, rows);
}

export async function findTaskById(
  db: Db,
  userId: string,
  taskId: string,
): Promise<TaskRowWithSubtasks | undefined> {
  const row = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, taskId),
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
    ),
    with: liveSubtasks,
  });

  if (!row) {
    return undefined;
  }

  const [withCount] = await attachCommentCounts(db, [row]);
  return withCount;
}

export async function loadTaskWithSubtasks(
  db: Db,
  taskId: string,
): Promise<TaskRowWithSubtasks | undefined> {
  const row = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), isNull(tasks.deletedAt)),
    with: liveSubtasks,
  });

  if (!row) {
    return undefined;
  }

  const [withCount] = await attachCommentCounts(db, [row]);
  return withCount;
}

/** Next free position at the bottom of a lane. The design appends: a typed task and an
    accepted task both land at the bottom of their bucket. */
export async function nextPosition(
  db: Db,
  userId: string,
  scheduledDate: string | null,
  bucket: Bucket | null,
): Promise<number> {
  const rows = await db
    .select({ highest: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(laneFilter(userId, scheduledDate, bucket));

  return (rows[0]?.highest ?? -1) + 1;
}

export type CreateTaskInput = {
  id?: string;
  userId: string;
  title: string;
  description?: string | null;
  scheduledDate: string | null;
  bucket: Bucket | null;
  startDate: string | null;
  deadline: Date | null;
  isPrivate: boolean;
  projectId?: string | null;
};

export async function createTask(
  db: Db,
  input: CreateTaskInput,
): Promise<TaskRow> {
  if (input.projectId) {
    await assertAssignableProject(db, input.userId, input.projectId);
  }

  const position = await nextPosition(
    db,
    input.userId,
    input.scheduledDate,
    input.bucket,
  );

  const rows = await db
    .insert(tasks)
    .values({ ...input, description: input.description ?? null, position })
    .returning();
  const row = rows[0]!;

  // Two round trips: partial failure leaves a task without a created row; the UI
  // synthesizes Created from task.createdAt for old tasks.
  await insertTimelineEvents(db, row.id, input.userId, [
    { type: "created", data: {} },
  ]);

  return row;
}

type NewTaskFields = {
  title: string;
  description: string | null;
  scheduledDate: string | null;
  bucket: Bucket | null;
  startDate: string | null;
  deadline: Date | null;
  completedAt: Date | null;
  inProgress: boolean;
  isPrivate: boolean;
  projectId: string | null;
};

export type UpdateTaskFields = Partial<
  Pick<
    NewTaskFields,
    | "title"
    | "description"
    | "scheduledDate"
    | "bucket"
    | "startDate"
    | "deadline"
    | "completedAt"
    | "inProgress"
    | "isPrivate"
    | "projectId"
  >
>;

export async function updateTask(
  db: Db,
  userId: string,
  taskId: string,
  fields: UpdateTaskFields,
): Promise<TaskRow | undefined> {
  const existing = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, taskId),
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
    ),
  });

  if (!existing) {
    return undefined;
  }

  const patch: UpdateTaskFields & {
    position?: number;
    carriedDays?: number;
    carriedSince?: string | null;
  } = { ...fields };

  // Moving a task into a different lane sends it to the bottom of that lane.
  if ("scheduledDate" in fields || "bucket" in fields) {
    patch.scheduledDate =
      "scheduledDate" in fields ? fields.scheduledDate ?? null : existing.scheduledDate;
    patch.bucket =
      "bucket" in fields ? fields.bucket ?? null : existing.bucket;
    patch.position = await nextPosition(
      db,
      userId,
      patch.scheduledDate ?? null,
      patch.bucket ?? null,
    );
  }

  if (
    "scheduledDate" in fields &&
    fields.scheduledDate !== existing.scheduledDate
  ) {
    patch.carriedDays = 0;
    patch.carriedSince = null;
  }

  if ("completedAt" in fields) {
    const completing = fields.completedAt !== null;
    const wasCompleted = existing.completedAt !== null;
    if (completing && !wasCompleted) {
      patch.inProgress = false;
      patch.position = await nextPosition(
        db,
        userId,
        existing.scheduledDate,
        existing.bucket,
      );
    }
  }

  if ("inProgress" in fields && fields.inProgress === true && existing.completedAt) {
    delete patch.inProgress;
  }

  if ("projectId" in fields && fields.projectId && fields.projectId !== existing.projectId) {
    await assertAssignableProject(db, userId, fields.projectId);
  }

  const afterRow = applyTaskPatch(existing, patch);
  const [beforeProjectName, afterProjectName] = await Promise.all([
    projectNameById(db, existing.projectId),
    projectNameById(db, afterRow.projectId),
  ]);
  const drafts = planTaskTimelineEvents({
    before: taskRowToSnapshot(existing, beforeProjectName),
    after: taskRowToSnapshot(afterRow, afterProjectName),
  });

  if (!taskRowPersistableChanged(existing, afterRow)) {
    return existing;
  }

  const updateStmt = db
    .update(tasks)
    .set(patch)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();

  if (drafts.length === 0) {
    const rows = await updateStmt;
    return rows[0];
  }

  const timelineInserts = drafts.map((draft) =>
    db.insert(timelineEvents).values({
      taskId,
      actorId: userId,
      type: draft.type,
      data: draft.data,
    }),
  );

  const [first, ...rest] = [updateStmt, ...timelineInserts];
  const batchResult = await db.batch([first, ...rest]);
  const rows = batchResult[0] as TaskRow[];

  return rows[0];
}

export async function softDeleteTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<boolean> {
  // No timeline row: the task and its history cascade away on soft delete.
  const rows = await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .returning({ id: tasks.id });

  return rows.length > 0;
}

/** Rewrites bucket, date and position for every task in every lane given.
    Returns false if any id is not a live task owned by this user, in which case
    nothing is written. */
export async function reorderTasks(
  db: Db,
  userId: string,
  lanes: Lane[],
): Promise<boolean> {
  const placements = planReorder(lanes);

  if (placements.length === 0) {
    return true;
  }

  const ids = placements.map((placement) => placement.taskId);

  const ownedRows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      inArray(tasks.id, ids),
    ),
  });

  if (ownedRows.length !== ids.length) {
    return false;
  }

  const beforeById = new Map(ownedRows.map((row) => [row.id, row]));
  const writes = [];
  const timelineInserts = [];

  for (const placement of placements) {
    const before = beforeById.get(placement.taskId);
    if (!before) {
      continue;
    }

    const afterRow = applyTaskPatch(before, {
      scheduledDate: placement.scheduledDate,
      bucket: placement.bucket,
    });

    const dateChanged = placement.scheduledDate !== before.scheduledDate;

    writes.push(
      db
        .update(tasks)
        .set({
          scheduledDate: placement.scheduledDate,
          bucket: placement.bucket,
          position: placement.position,
          ...(dateChanged
            ? { carriedDays: 0, carriedSince: null }
            : {}),
        })
        .where(and(eq(tasks.id, placement.taskId), eq(tasks.userId, userId))),
    );

    const drafts = planTaskTimelineEvents({
      before: taskRowToSnapshot(before),
      after: taskRowToSnapshot(afterRow),
    });

    for (const draft of drafts) {
      timelineInserts.push(
        db.insert(timelineEvents).values({
          taskId: placement.taskId,
          actorId: userId,
          type: draft.type,
          data: draft.data,
        }),
      );
    }
  }

  const [first, ...rest] = [...writes, ...timelineInserts];

  if (first) {
    await db.batch([first, ...rest]);
  }

  return true;
}

export async function createSubtask(
  db: Db,
  taskId: string,
  title: string,
  id?: string,
): Promise<SubtaskRow> {
  const rows = await db
    .select({ highest: sql<number | null>`max(${subtasks.position})` })
    .from(subtasks)
    .where(and(eq(subtasks.taskId, taskId), isNull(subtasks.deletedAt)));

  const position = (rows[0]?.highest ?? -1) + 1;

  const inserted = await db
    .insert(subtasks)
    .values(id ? { id, taskId, title, position } : { taskId, title, position })
    .returning();

  return inserted[0]!;
}

/** Scoped through the parent task so a caller cannot touch someone else's subtask. */
export async function updateSubtask(
  db: Db,
  userId: string,
  subtaskId: string,
  fields: Partial<{ title: string; done: boolean }>,
): Promise<SubtaskRow | undefined> {
  const owned = await ownedSubtask(db, userId, subtaskId);

  if (!owned) {
    return undefined;
  }

  const rows = await db
    .update(subtasks)
    .set(fields)
    .where(eq(subtasks.id, subtaskId))
    .returning();

  return rows[0];
}

export async function softDeleteSubtask(
  db: Db,
  userId: string,
  subtaskId: string,
): Promise<boolean> {
  const owned = await ownedSubtask(db, userId, subtaskId);

  if (!owned) {
    return false;
  }

  await db
    .update(subtasks)
    .set({ deletedAt: new Date() })
    .where(eq(subtasks.id, subtaskId));

  return true;
}

/** Maps subtask ids to contiguous positions from zero. Pure, so it is unit tested
    directly. Returns null when ids do not match the live set exactly. */
export function planSubtaskReorder(
  subtaskIds: string[],
  liveIds: readonly string[],
): Map<string, number> | null {
  if (subtaskIds.length !== liveIds.length) {
    return null;
  }

  const live = new Set(liveIds);

  for (const id of subtaskIds) {
    if (!live.has(id)) {
      return null;
    }
  }

  const placements = new Map<string, number>();
  subtaskIds.forEach((id, index) => {
    placements.set(id, index);
  });

  return placements;
}

/** Rewrites position for every subtask in the given order.
    Returns false if the parent task is not owned, or any id is missing or
    belongs to a different task, in which case nothing is written. */
export async function reorderSubtasks(
  db: Db,
  userId: string,
  taskId: string,
  subtaskIds: string[],
): Promise<boolean> {
  const parent = await findTaskById(db, userId, taskId);

  if (!parent) {
    return false;
  }

  const placements = planSubtaskReorder(
    subtaskIds,
    parent.subtasks.map((subtask) => subtask.id),
  );

  if (!placements) {
    return false;
  }

  const writes = [...placements.entries()].map(([subtaskId, position]) =>
    db
      .update(subtasks)
      .set({ position })
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId))),
  );

  const [first, ...rest] = writes;

  if (first) {
    await db.batch([first, ...rest]);
  }

  return true;
}

async function ownedSubtask(db: Db, userId: string, subtaskId: string) {
  const rows = await db
    .select({ id: subtasks.id })
    .from(subtasks)
    .innerJoin(tasks, eq(subtasks.taskId, tasks.id))
    .where(
      and(
        eq(subtasks.id, subtaskId),
        isNull(subtasks.deletedAt),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  return rows[0];
}
