import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Bucket, Lane } from "@tudu/shared";
import type { Db } from "./index.js";
import { subtasks, tasks, type SubtaskRow, type TaskRow } from "./tasks-schema.js";

export type TaskRowWithSubtasks = TaskRow & { subtasks: SubtaskRow[] };

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
};

export async function listTasksForDay(
  db: Db,
  userId: string,
  scheduledDate: string,
): Promise<TaskRowWithSubtasks[]> {
  return db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      eq(tasks.scheduledDate, scheduledDate),
    ),
    with: liveSubtasks,
    // Enum sorts in declaration order, so this is Now, Next, Later.
    orderBy: [asc(tasks.bucket), asc(tasks.position)],
  });
}

export async function listUnscheduledTasks(
  db: Db,
  userId: string,
): Promise<TaskRowWithSubtasks[]> {
  return db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.scheduledDate),
    ),
    with: liveSubtasks,
    orderBy: [asc(tasks.position)],
  });
}

export async function findTaskById(
  db: Db,
  userId: string,
  taskId: string,
): Promise<TaskRowWithSubtasks | undefined> {
  return db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, taskId),
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
    ),
    with: liveSubtasks,
  });
}

/** Next free position at the bottom of a lane. The design appends: a typed task and an
    accepted task both land at the bottom of their bucket. */
async function nextPosition(
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
  userId: string;
  title: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
  startDate: string | null;
  deadline: Date | null;
  isPrivate: boolean;
};

export async function createTask(
  db: Db,
  input: CreateTaskInput,
): Promise<TaskRow> {
  const position = await nextPosition(
    db,
    input.userId,
    input.scheduledDate,
    input.bucket,
  );

  const rows = await db.insert(tasks).values({ ...input, position }).returning();

  return rows[0]!;
}

type NewTaskFields = {
  title: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
  startDate: string | null;
  deadline: Date | null;
  completedAt: Date | null;
  isPrivate: boolean;
};

export type UpdateTaskFields = Partial<
  Pick<
    NewTaskFields,
    | "title"
    | "scheduledDate"
    | "bucket"
    | "startDate"
    | "deadline"
    | "completedAt"
    | "isPrivate"
  >
>;

export async function updateTask(
  db: Db,
  userId: string,
  taskId: string,
  fields: UpdateTaskFields,
): Promise<TaskRow | undefined> {
  const patch: UpdateTaskFields & { position?: number } = { ...fields };

  // Moving a task into a different lane sends it to the bottom of that lane.
  if ("scheduledDate" in fields || "bucket" in fields) {
    patch.position = await nextPosition(
      db,
      userId,
      fields.scheduledDate ?? null,
      fields.bucket ?? null,
    );
  }

  const rows = await db
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

  return rows[0];
}

export async function softDeleteTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<boolean> {
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

  const owned = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        inArray(tasks.id, ids),
      ),
    );

  if (owned.length !== ids.length) {
    return false;
  }

  const writes = placements.map((placement) =>
    db
      .update(tasks)
      .set({
        scheduledDate: placement.scheduledDate,
        bucket: placement.bucket,
        position: placement.position,
      })
      .where(and(eq(tasks.id, placement.taskId), eq(tasks.userId, userId))),
  );

  // Neon over HTTP has no interactive transactions, so `db.batch` is the substitute.
  // Destructuring satisfies its non-empty tuple type without a cast.
  const [first, ...rest] = writes;

  if (first) {
    await db.batch([first, ...rest]);
  }

  return true;
}

export async function createSubtask(
  db: Db,
  taskId: string,
  title: string,
): Promise<SubtaskRow> {
  const rows = await db
    .select({ highest: sql<number | null>`max(${subtasks.position})` })
    .from(subtasks)
    .where(and(eq(subtasks.taskId, taskId), isNull(subtasks.deletedAt)));

  const position = (rows[0]?.highest ?? -1) + 1;

  const inserted = await db
    .insert(subtasks)
    .values({ taskId, title, position })
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
