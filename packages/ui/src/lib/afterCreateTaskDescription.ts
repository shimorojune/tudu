import {
  applyPendingTaskDescriptionAttachments,
  type UploadTaskAttachmentFn,
} from "@/lib/applyPendingTaskDescriptionAttachments";

export async function patchTaskDescriptionIfAttachmentsChanged(
  taskId: string,
  originalDescription: string | null,
  pendingAttachments: Map<string, File>,
  uploadTaskAttachment: UploadTaskAttachmentFn,
  updateTask: (description: string | null) => Promise<unknown>,
): Promise<void> {
  const finalDescription = await applyPendingTaskDescriptionAttachments(
    taskId,
    originalDescription,
    pendingAttachments,
    uploadTaskAttachment,
  );
  if (finalDescription !== originalDescription) {
    await updateTask(finalDescription);
  }
}
