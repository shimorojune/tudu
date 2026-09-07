import { and, asc, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { TimelineEventDraft } from "@tudu/shared";
import type { Db } from "./index.js";
import {
  comments,
  timelineEvents,
  type CommentRow,
  type TimelineEventRow,
} from "./activity-schema.js";
import { tasks, type TaskRow } from "./tasks-schema.js";

export type CommentWithAuthor = CommentRow & {
  author: { id: string; name: string; email: string };
};

async function ownedTaskId(
  db: Db,
  userId: string,
  taskId: string,
): Promise<string | undefined> {
  const row = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, taskId),
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
    ),
    columns: { id: true },
  });

  return row?.id;
}

export function taskRowToSnapshot(row: TaskRow): import("@tudu/shared").TaskSnapshot {
  return {
    title: row.title,
    description: row.description,
    scheduledDate: row.scheduledDate,
    bucket: row.bucket,
    startDate: row.startDate,
    deadline: row.deadline?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    isPrivate: row.isPrivate,
  };
}

export function applyTaskPatch(
  before: TaskRow,
  fields: Partial<{
    title: string;
    description: string | null;
    scheduledDate: string | null;
    bucket: import("@tudu/shared").Bucket | null;
    startDate: string | null;
    deadline: Date | null;
    completedAt: Date | null;
    isPrivate: boolean;
  }>,
): TaskRow {
  return {
    ...before,
    ...fields,
  };
}

export async function insertTimelineEvents(
  db: Db,
  taskId: string,
  actorId: string | null,
  drafts: TimelineEventDraft[],
): Promise<void> {
  if (drafts.length === 0) {
    return;
  }

  const inserts = drafts.map((draft) =>
    db.insert(timelineEvents).values({
      taskId,
      actorId,
      type: draft.type,
      data: draft.data,
    }),
  );

  const [first, ...rest] = inserts;
  if (first) {
    await db.batch([first, ...rest]);
  }
}

export async function countCommentsForTasks(
  db: Db,
  taskIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (taskIds.length === 0) {
    return counts;
  }

  const rows = await db
    .select({
      taskId: comments.taskId,
      total: count(),
    })
    .from(comments)
    .where(
      and(inArray(comments.taskId, taskIds), isNull(comments.deletedAt)),
    )
    .groupBy(comments.taskId);

  for (const row of rows) {
    counts.set(row.taskId, Number(row.total));
  }

  return counts;
}

export async function listCommentsForTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<CommentWithAuthor[]> {
  const owned = await ownedTaskId(db, userId, taskId);
  if (!owned) {
    return [];
  }

  return db.query.comments.findMany({
    where: and(eq(comments.taskId, taskId), isNull(comments.deletedAt)),
    orderBy: [asc(comments.createdAt)],
    with: {
      author: {
        columns: { id: true, name: true, email: true },
      },
    },
  }) as Promise<CommentWithAuthor[]>;
}

export async function createComment(
  db: Db,
  userId: string,
  taskId: string,
  body: string,
): Promise<CommentWithAuthor | undefined> {
  const owned = await ownedTaskId(db, userId, taskId);
  if (!owned) {
    return undefined;
  }

  const [inserted] = await db
    .insert(comments)
    .values({ taskId, authorId: userId, body })
    .returning();

  if (!inserted) {
    return undefined;
  }

  await insertTimelineEvents(db, taskId, userId, [
    { type: "commented", data: { commentId: inserted.id } },
  ]);

  const rows = await db.query.comments.findFirst({
    where: eq(comments.id, inserted.id),
    with: {
      author: {
        columns: { id: true, name: true, email: true },
      },
    },
  });

  return rows as CommentWithAuthor | undefined;
}

export async function updateComment(
  db: Db,
  userId: string,
  commentId: string,
  body: string,
): Promise<CommentWithAuthor | undefined> {
  const existing = await db.query.comments.findFirst({
    where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
    with: {
      task: {
        columns: { userId: true },
      },
    },
  });

  if (!existing || existing.authorId !== userId) {
    return undefined;
  }

  if (existing.task.userId !== userId) {
    return undefined;
  }

  const editedAt = new Date();

  await db.batch([
    db
      .update(comments)
      .set({ body, editedAt })
      .where(eq(comments.id, commentId)),
    db.insert(timelineEvents).values({
      taskId: existing.taskId,
      actorId: userId,
      type: "comment_edited",
      data: { commentId },
    }),
  ]);

  const row = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
    with: {
      author: {
        columns: { id: true, name: true, email: true },
      },
    },
  });

  return row as CommentWithAuthor | undefined;
}

export async function softDeleteComment(
  db: Db,
  userId: string,
  commentId: string,
): Promise<boolean> {
  const existing = await db.query.comments.findFirst({
    where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
    with: {
      task: {
        columns: { userId: true },
      },
    },
  });

  if (!existing || existing.authorId !== userId) {
    return false;
  }

  if (existing.task.userId !== userId) {
    return false;
  }

  await db.batch([
    db
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, commentId)),
    db.insert(timelineEvents).values({
      taskId: existing.taskId,
      actorId: userId,
      type: "comment_deleted",
      data: { commentId },
    }),
  ]);

  return true;
}

export async function listTimelineForTask(
  db: Db,
  userId: string,
  taskId: string,
  args: { before?: string; limit: number },
): Promise<TimelineEventRow[]> {
  const owned = await ownedTaskId(db, userId, taskId);
  if (!owned) {
    return [];
  }

  const filters = [eq(timelineEvents.taskId, taskId)];

  if (args.before) {
    filters.push(lt(timelineEvents.createdAt, new Date(args.before)));
  }

  return db.query.timelineEvents.findMany({
    where: and(...filters),
    orderBy: [desc(timelineEvents.createdAt)],
    limit: args.limit,
  });
}
