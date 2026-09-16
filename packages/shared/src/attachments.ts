import { z } from "zod";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const uuidSegment =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Relative path served by the API for attachment bytes. */
export function attachmentContentPath(attachmentId: string): string {
  return `/attachments/${attachmentId}/content`;
}

export const attachmentContentPathPattern = new RegExp(
  `^/attachments/${uuidSegment}/content$`,
  "i",
);

export function isAllowedAttachmentContentUrl(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed || /^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) {
    return false;
  }
  if (attachmentContentPathPattern.test(trimmed)) {
    return true;
  }
  try {
    const url = new URL(trimmed, "http://local.invalid");
    return attachmentContentPathPattern.test(url.pathname);
  } catch {
    return false;
  }
}

export const taskAttachmentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  contentUrl: z.string(),
});

export type TaskAttachment = z.infer<typeof taskAttachmentSchema>;

export const uploadTaskAttachmentResponseSchema = z.object({
  attachment: taskAttachmentSchema,
});

export type UploadTaskAttachmentResponse = z.infer<
  typeof uploadTaskAttachmentResponseSchema
>;
