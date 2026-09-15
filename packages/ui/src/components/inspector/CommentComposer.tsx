import { useState } from "react";
import { richTextToPlainPreview, sanitizeRichTextHtml } from "@tudu/shared";
import { useCreateCommentMutation } from "@tudu/store";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { FormBusy } from "@/components/forms/FormBusy";
import { Button } from "@/components/ui/button";
import { notifyAction, mutationResult } from "@/lib/notifyAction";

export type CommentComposerProps = {
  taskId: string;
  disabled?: boolean;
};

export function CommentComposer({ taskId, disabled = false }: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [createComment, commentState] = useCreateCommentMutation();
  const isLoading = Boolean(commentState?.isLoading);

  async function send() {
    const plainBody = richTextToPlainPreview(body);
    if (!plainBody || isLoading || disabled) {
      return;
    }
    const payload = sanitizeRichTextHtml(body);

    setBody("");
    try {
      await notifyAction(
        () => mutationResult(createComment({ taskId, body: payload })),
        { success: "Comment sent", error: "Could not send the comment" },
      );
    } catch {
      setBody(payload);
    }
  }

  return (
    <FormBusy busy={isLoading} className="shrink-0 border-t border-hair px-[24px] py-[16px]">
      <RichTextEditor
        mode="html"
        value={body}
        placeholder="Add a comment…"
        aria-label="Task comment"
        readOnly={disabled || isLoading}
        onChange={setBody}
      />
      <div className="mt-[10px] flex justify-end">
        <Button
          type="button"
          loading={isLoading}
          disabled={!richTextToPlainPreview(body) || disabled}
          className="h-auto bg-primary px-[14px] py-[6px] text-[12.5px] font-bold"
          onClick={() => void send()}
        >
          Send
        </Button>
      </div>
    </FormBusy>
  );
}
