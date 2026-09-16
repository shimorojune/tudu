import type { TaskDescriptionUploadFn } from "@/components/editor/taskDescriptionAttachments";

export type UploadTaskAttachmentResult = {
  contentUrl: string;
  mimeType: string;
  fileName: string;
};

/**
 * Replaces blob: URLs in a new-task description with uploaded attachment URLs.
 */
export async function finalizeNewTaskDescriptionAttachments(
  description: string | null,
  pendingAttachments: Map<string, File>,
  upload: TaskDescriptionUploadFn,
): Promise<string | null> {
  if (!description || pendingAttachments.size === 0) {
    return description;
  }

  let next = description;
  let changed = false;

  for (const [blobUrl, file] of pendingAttachments) {
    if (!next.includes(blobUrl)) {
      continue;
    }
    const result = await upload(file);
    next = next.split(blobUrl).join(result.contentUrl);
    changed = true;
    URL.revokeObjectURL(blobUrl);
  }

  return changed ? next : description;
}

export function clearPendingAttachmentBlobUrls(
  pendingAttachments: Map<string, File>,
): void {
  for (const blobUrl of pendingAttachments.keys()) {
    URL.revokeObjectURL(blobUrl);
  }
  pendingAttachments.clear();
}
