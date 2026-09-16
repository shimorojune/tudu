import type { TaskDescriptionUploadFn } from "@/components/editor/taskDescriptionAttachments";
import { finalizeNewTaskDescriptionAttachments } from "@/lib/finalizeNewTaskDescriptionAttachments";

export type UploadTaskAttachmentFn = (input: {
  taskId: string;
  file: File;
}) => Promise<{
  attachment: {
    contentUrl: string;
    mimeType: string;
    fileName: string;
  };
}>;

export async function applyPendingTaskDescriptionAttachments(
  taskId: string,
  description: string | null,
  pendingAttachments: Map<string, File>,
  uploadTaskAttachment: UploadTaskAttachmentFn,
): Promise<string | null> {
  if (!description || pendingAttachments.size === 0) {
    return description;
  }

  const upload: TaskDescriptionUploadFn = async (file) => {
    const { attachment } = await uploadTaskAttachment({ taskId, file });
    return {
      contentUrl: attachment.contentUrl,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
    };
  };

  return finalizeNewTaskDescriptionAttachments(
    description,
    pendingAttachments,
    upload,
  );
}
