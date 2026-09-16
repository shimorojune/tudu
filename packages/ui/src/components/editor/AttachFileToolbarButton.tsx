import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/tiptap-ui-primitive/button";
import {
  handleDescriptionFiles,
  type TaskDescriptionUploadFn,
} from "@/components/editor/taskDescriptionAttachments";

export type AttachFileToolbarButtonProps = {
  editor: Editor | null;
  upload: TaskDescriptionUploadFn;
  disabled?: boolean;
};

export function AttachFileToolbarButton({
  editor,
  upload,
  disabled = false,
}: AttachFileToolbarButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = event.target.files;
          if (!editor || !files?.length) {
            return;
          }
          void handleDescriptionFiles(editor, Array.from(files), upload);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        data-style="ghost"
        aria-label="Attach file"
        disabled={disabled || !editor}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="tiptap-button-icon" />
      </Button>
    </>
  );
}
