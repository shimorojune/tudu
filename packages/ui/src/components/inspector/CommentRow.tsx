import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { format, parseISO } from "date-fns";
import type { Comment } from "@tudu/shared";
import { sanitizeRichTextHtml, richTextToPlainPreview } from "@tudu/shared";
import {
  useDeleteCommentMutation,
  useGetMeQuery,
  useUpdateCommentMutation,
} from "@tudu/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { RichTextContent } from "@/components/editor/RichTextContent";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { cn } from "@/lib/utils";

export type CommentRowProps = {
  comment: Comment;
  taskId: string;
  focused?: boolean;
  canEdit?: boolean;
};

function authorInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function CommentEditableBody({
  text,
  editing,
  readOnly,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  text: string;
  editing: boolean;
  readOnly?: boolean;
  onStartEdit: (event: MouseEvent) => void;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    if (editing) {
      setDraft(text);
    }
  }, [editing, text]);

  function commit() {
    const next = sanitizeRichTextHtml(draft);
    if (!richTextToPlainPreview(next)) {
      onCancel();
      return;
    }
    if (next !== text) {
      onCommit(next);
      return;
    }
    onCancel();
  }

  return editing ? (
    <div
      className="mt-[6px]"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        commit();
      }}
    >
      <RichTextEditor
        mode="html"
        value={draft}
        readOnly={readOnly}
        aria-label="Edit comment"
        onChange={setDraft}
      />
    </div>
  ) : (
    <div
      className="mt-[6px] cursor-text outline-none"
      onClick={onStartEdit}
    >
      <RichTextContent value={text} />
    </div>
  );
}

export function CommentRow({
  comment,
  taskId,
  focused = false,
  canEdit = true,
}: CommentRowProps) {
  const { data: me } = useGetMeQuery();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isSelf = me?.id === comment.authorId;
  const canEditComment = canEdit && isSelf;

  const timestamp = format(parseISO(comment.createdAt), "EEE d MMM, HH:mm");

  useLayoutEffect(() => {
    if (!focused) {
      return;
    }
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  const handleCommit = useCallback(
    (body: string) => {
      setEditing(false);
      if (body === comment.body) {
        return;
      }
      void updateComment({
        id: comment.id,
        taskId,
        patch: { body },
      });
    },
    [comment.body, comment.id, taskId, updateComment],
  );

  return (
    <>
      <div
        ref={rootRef}
        data-comment-id={comment.id}
        className={cn("flex gap-[12px] py-[14px]", focused && "comment-focus-tint")}
      >
        <Avatar
          size="sm"
          className={cn(
            "size-[28px] text-[11px] font-bold",
            isSelf ? "border-[1.5px] border-rule bg-card" : "bg-foreground text-card",
          )}
        >
          <AvatarFallback>{authorInitial(comment.author.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-[8px]">
            <span className="text-[12.5px] font-bold">{comment.author.name}</span>
            <span className="text-[11px] tabular-nums text-faint">
              {timestamp}
              {comment.editedAt ? " edited" : ""}
            </span>
            {canEditComment ? (
              <button
                type="button"
                className="ml-auto text-[11px] text-muted-foreground"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </button>
            ) : null}
          </div>
          {canEditComment ? (
            <CommentEditableBody
              text={comment.body}
              editing={editing}
              onStartEdit={() => setEditing(true)}
              onCommit={handleCommit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="mt-[6px]">
              <RichTextContent value={comment.body} />
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void deleteComment({ id: comment.id, taskId });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
