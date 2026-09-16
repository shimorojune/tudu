import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./index.js";
import {
  taskAttachments,
  type TaskAttachmentRow,
} from "./task-attachments-schema.js";

export type CreateTaskAttachmentInput = {
  id?: string;
  taskId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

export async function createTaskAttachment(
  db: Db,
  input: CreateTaskAttachmentInput,
): Promise<TaskAttachmentRow> {
  const rows = await db
    .insert(taskAttachments)
    .values({
      id: input.id,
      taskId: input.taskId,
      userId: input.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
    })
    .returning();

  return rows[0]!;
}

export async function findTaskAttachmentById(
  db: Db,
  attachmentId: string,
): Promise<TaskAttachmentRow | undefined> {
  const rows = await db
    .select()
    .from(taskAttachments)
    .where(
      and(eq(taskAttachments.id, attachmentId), isNull(taskAttachments.deletedAt)),
    )
    .limit(1);

  return rows[0];
}

export async function softDeleteAttachmentsForTask(
  db: Db,
  taskId: string,
): Promise<void> {
  await db
    .update(taskAttachments)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(taskAttachments.taskId, taskId), isNull(taskAttachments.deletedAt)),
    );
}
