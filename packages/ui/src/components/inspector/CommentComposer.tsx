import { useRef, useState, type KeyboardEvent } from "react";
import { useCreateCommentMutation } from "@tudu/store";

export type CommentComposerProps = {
  taskId: string;
};

export function CommentComposer({ taskId }: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [createComment, { isLoading }] = useCreateCommentMutation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || isLoading) {
      return;
    }

    setBody("");
    await createComment({ taskId, body: trimmed });
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="shrink-0 border-t border-hair px-[24px] py-[16px]">
      <textarea
        ref={textareaRef}
        value={body}
        placeholder="Add a comment…"
        rows={3}
        className="w-full resize-none border border-rule bg-card px-[12px] py-[10px] text-[13px] outline-none placeholder:text-faint"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="mt-[10px] flex justify-end">
        <button
          type="button"
          disabled={!body.trim() || isLoading}
          className="bg-primary px-[14px] py-[6px] text-[12.5px] font-bold text-primary-foreground disabled:opacity-40"
          onClick={() => void send()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
