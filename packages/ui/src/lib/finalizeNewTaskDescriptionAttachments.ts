import {
  htmlFragmentForUploadedAttachment,
  type TaskDescriptionUploadFn,
} from "@/components/editor/taskDescriptionAttachments";
import {
  descriptionHtmlReferencesBlobUrl,
  fixAttachmentAnchorLabels,
  replaceBlobUrlInDescriptionHtmlAttributes,
} from "@/lib/replaceBlobUrlsInDescriptionHtml";

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
    const result = await upload(file);
    const fileName = result.fileName || file.name || "attachment";

    if (descriptionHtmlReferencesBlobUrl(next, blobUrl)) {
      next = replaceBlobUrlInDescriptionHtmlAttributes(
        next,
        blobUrl,
        result.contentUrl,
      );
      next = fixAttachmentAnchorLabels(next, result.contentUrl, fileName);
    } else {
      const fragment = htmlFragmentForUploadedAttachment(result, file);
      const trimmed = next.trim();
      next =
        trimmed.length > 0 && trimmed !== "<p></p>"
          ? `${trimmed}${fragment}`
          : fragment;
    }

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
