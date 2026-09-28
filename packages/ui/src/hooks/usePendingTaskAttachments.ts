import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { rejectOversizeFile } from "@/components/editor/taskDescriptionAttachments";
import { appendBlobImageToDescriptionHtml } from "@/lib/quickAddNote";
import { clearPendingAttachmentBlobUrls } from "@/lib/finalizeNewTaskDescriptionAttachments";

export type StagedQuickAddFile = {
  blobUrl: string;
  file: File;
  previewUrl: string;
};

export function usePendingTaskAttachments() {
  const pendingAttachmentsRef = useRef<Map<string, File>>(new Map());
  const [stagedFiles, setStagedFiles] = useState<StagedQuickAddFile[]>([]);

  const clear = useCallback(() => {
    setStagedFiles((current) => {
      for (const entry of current) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return [];
    });
    clearPendingAttachmentBlobUrls(pendingAttachmentsRef.current);
  }, []);

  const removeFile = useCallback((blobUrl: string) => {
    pendingAttachmentsRef.current.delete(blobUrl);
    setStagedFiles((current) => {
      const next = current.filter((entry) => {
        if (entry.blobUrl === blobUrl) {
          URL.revokeObjectURL(entry.previewUrl);
          URL.revokeObjectURL(blobUrl);
          return false;
        }
        return true;
      });
      return next;
    });
  }, []);

  const stageFile = useCallback(
    (
      file: File,
      onDescriptionChange?: (next: string | null) => void,
      descriptionHtml?: string | null,
    ): string | null => {
      if (rejectOversizeFile(file)) {
        return null;
      }
      const blobUrl = URL.createObjectURL(file);
      const previewUrl = URL.createObjectURL(file);
      pendingAttachmentsRef.current.set(blobUrl, file);
      setStagedFiles((current) => [
        ...current,
        { blobUrl, file, previewUrl },
      ]);
      if (onDescriptionChange && file.type.startsWith("image/")) {
        onDescriptionChange(
          appendBlobImageToDescriptionHtml(descriptionHtml ?? null, blobUrl, file.name),
        );
      }
      return blobUrl;
    },
    [],
  );

  return {
    pendingAttachmentsRef,
    stagedFiles,
    stageFile,
    removeFile,
    clear,
  };
}

export function stageFilesFromList(
  files: FileList | File[],
  stageFile: (
    file: File,
    onDescriptionChange?: (next: string | null) => void,
    descriptionHtml?: string | null,
  ) => string | null,
  onDescriptionChange?: (next: string | null) => void,
  descriptionHtml?: string | null,
): number {
  const list = Array.from(files);
  let added = 0;
  for (const file of list) {
    const blobUrl = stageFile(file, onDescriptionChange, descriptionHtml);
    if (blobUrl) {
      added += 1;
    }
  }
  if (added === 0 && list.length > 0) {
    toast.error("Could not attach file");
  }
  return added;
}
