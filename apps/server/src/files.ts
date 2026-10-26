import { FILE_MAX_BYTES, type Attachment, type NoteFile } from '@tudu/core';
import { and, eq, isNotNull, isNull, lt, or, schema, type Db } from '@tudu/db';
import { randomUUID } from 'node:crypto';
import type { Storage } from './storage';

/** A file nobody refers to is kept this long before the sweep takes it. */
export const ORPHAN_KEEP_MS = 24 * 60 * 60 * 1000;

export { FILE_MAX_BYTES };

function toAttachment(r: typeof schema.attachments.$inferSelect): Attachment {
  return {
    id: r.id,
    spaceId: r.spaceId!,
    taskId: r.taskId,
    name: r.name,
    size: r.size,
    type: r.type,
    createdAt: r.createdAt.toISOString(),
  };
}

/** A file's name as the person sees it: no paths, no control characters, something rather than nothing. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Control characters have no place in a name.
  const clean = Array.from(base)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c > 31 && c !== 127;
    })
    .join('')
    .trim()
    .slice(0, 255);
  return clean || 'file';
}

/** Put a file into the bucket under its space and remember it. */
export async function storeFile(
  db: Db,
  storage: Storage,
  input: {
    spaceId: string;
    taskId: string | null;
    name: string;
    type: string;
    body: Uint8Array;
    userId: string;
  },
): Promise<Attachment> {
  const id = randomUUID();
  const key = `spaces/${input.spaceId}/${id}`;
  const type = input.type || 'application/octet-stream';
  await storage.put(key, input.body, type);
  const [row] = await db
    .insert(schema.attachments)
    .values({
      id,
      spaceId: input.spaceId,
      taskId: input.taskId,
      key,
      name: cleanFileName(input.name),
      size: input.body.byteLength,
      type,
      uploadedBy: input.userId,
    })
    .returning();
  return toAttachment(row!);
}

/** Put a file into your Notebook's own corner of the bucket (`notes/<you>/…`): no space, yours alone. */
export async function storeNoteFile(
  db: Db,
  storage: Storage,
  input: { userId: string; name: string; type: string; body: Uint8Array },
): Promise<NoteFile> {
  const id = randomUUID();
  const key = `notes/${input.userId}/${id}`;
  const type = input.type || 'application/octet-stream';
  await storage.put(key, input.body, type);
  const [row] = await db
    .insert(schema.attachments)
    .values({
      id,
      ownerId: input.userId,
      key,
      name: cleanFileName(input.name),
      size: input.body.byteLength,
      type,
      uploadedBy: input.userId,
    })
    .returning();
  return {
    id: row!.id,
    name: row!.name,
    size: row!.size,
    type: row!.type,
    createdAt: row!.createdAt.toISOString(),
  };
}

export async function attachmentById(db: Db, id: string) {
  const [row] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, id));
  return row ?? null;
}

/**
 * Files nobody refers to any more: uploaded for a task that never came (no task after a day), or whose task
 * was deleted more than a day ago; a Notebook file no note refers to after a day. Returns how many went.
 */
export async function sweepAttachments(db: Db, storage: Storage, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ORPHAN_KEEP_MS);
  const rows = await db
    .select({ id: schema.attachments.id, key: schema.attachments.key })
    .from(schema.attachments)
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.attachments.taskId))
    .where(
      or(
        and(
          isNotNull(schema.attachments.spaceId),
          isNull(schema.attachments.taskId),
          lt(schema.attachments.createdAt, cutoff),
        ),
        lt(schema.tasks.deletedAt, cutoff),
        and(
          isNotNull(schema.attachments.ownerId),
          isNull(schema.attachments.noteId),
          lt(schema.attachments.createdAt, cutoff),
        ),
      ),
    );
  for (const r of rows) {
    await storage.delete(r.key).catch(() => {});
    await db.delete(schema.attachments).where(eq(schema.attachments.id, r.id));
  }
  return rows.length;
}
