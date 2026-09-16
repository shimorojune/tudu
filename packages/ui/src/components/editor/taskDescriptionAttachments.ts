import type { Editor } from "@tiptap/react";
import { ATTACHMENT_MAX_BYTES } from "@tudu/shared";
import { toast } from "sonner";

export type TaskDescriptionUploadFn = (file: File) => Promise<{
  contentUrl: string;
  mimeType: string;
  fileName: string;
}>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rejectOversizeFile(file: File): boolean {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    toast.error("File is too large. Maximum size is 5MB.");
    return true;
  }
  return false;
}

export async function insertUploadedFileIntoEditor(
  editor: Editor,
  file: File,
  upload: TaskDescriptionUploadFn,
): Promise<void> {
  if (rejectOversizeFile(file)) {
    return;
  }

  try {
    const result = await upload(file);
    const mime = result.mimeType || file.type;
    const name = escapeHtml(result.fileName || file.name);

    if (mime.startsWith("image/")) {
      editor.chain().focus().setImage({ src: result.contentUrl, alt: result.fileName }).run();
      return;
    }

    if (mime.startsWith("video/")) {
      editor
        .chain()
        .focus()
        .insertContent(
          `<video src="${result.contentUrl}" controls></video>`,
        )
        .run();
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(
        `<p><a href="${result.contentUrl}" data-tudu-filename="${name}">${name}</a></p>`,
      )
      .run();
  } catch {
    toast.error("Could not upload that file");
  }
}

export async function handleDescriptionFiles(
  editor: Editor,
  files: File[],
  upload: TaskDescriptionUploadFn,
): Promise<void> {
  for (const file of files) {
    await insertUploadedFileIntoEditor(editor, file, upload);
  }
}
