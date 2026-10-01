import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useUpdateTaskMutation, useUploadTaskAttachmentMutation } from "@tudu/store";
import type { TaskDescriptionUploadFn } from "@/components/editor/taskDescriptionAttachments";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { AUTOSAVE_MS } from "@/lib/autosave";

export type TaskDescriptionFieldProps = {
  taskId: string;
  description: string | null;
  readOnly?: boolean;
};

export function TaskDescriptionField({
  taskId,
  description,
  readOnly = false,
}: TaskDescriptionFieldProps) {
  const [value, setValue] = useState(description ?? "");
  const lastSaved = useRef(description ?? "");
  const focusedRef = useRef(false);
  const [updateTask] = useUpdateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();

  const uploadAttachment = useCallback<TaskDescriptionUploadFn>(
    async (file) => {
      const { attachment } = await uploadTaskAttachment({
        taskId,
        file,
      }).unwrap();
      return {
        contentUrl: attachment.contentUrl,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      };
    },
    [taskId, uploadTaskAttachment],
  );

  useEffect(() => {
    focusedRef.current = false;
    const next = description ?? "";
    setValue(next);
    lastSaved.current = next;
  }, [taskId]);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    const next = description ?? "";
    setValue(next);
    lastSaved.current = next;
  }, [description, taskId]);

  const debouncedSave = useDebouncedCallback((next: string) => {
    const trimmed = next.trim();
    const normalized = trimmed.length > 0 ? trimmed : null;
    if (normalized === (lastSaved.current.trim() || null)) {
      return;
    }
    lastSaved.current = normalized ?? "";
    void updateTask({ id: taskId, patch: { description: normalized } });
  }, AUTOSAVE_MS);

  return (
    <div
      className="mt-[14px]"
      onFocusCapture={() => {
        focusedRef.current = true;
      }}
      onBlurCapture={() => {
        focusedRef.current = false;
        if (readOnly) {
          return;
        }
        debouncedSave.flush();
        const normalized = value.trim().length > 0 ? value.trim() : null;
        lastSaved.current = normalized ?? "";
      }}
    >
      <RichTextEditor
        key={taskId}
        mode="html"
        value={value}
        readOnly={readOnly}
        placeholder={readOnly ? "" : "Add a description..."}
        aria-label="Task description"
        className="text-muted-foreground focus-within:text-foreground"
        taskAttachments={{
          upload: readOnly ? undefined : uploadAttachment,
        }}
        onChange={(next) => {
          if (readOnly) {
            return;
          }
          setValue(next);
          debouncedSave(next);
        }}
      />
    </div>
  );
}
