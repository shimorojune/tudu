import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { format, parseISO } from "date-fns";
import type { Comment } from "@tudu/shared";
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
import { LinkifiedText } from "@/components/text/LinkifiedText";
import { cn } from "@/lib/utils";

export type CommentRowProps = {
  comment: Comment;
  taskId: string;
  focused?: boolean;
};

function authorInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function CommentEditableBody({
  text,
  editing,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  text: string;
  editing: boolean;
  onStartEdit: (event: MouseEvent) => void;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const snapshot = useRef(text);

  useLayoutEffect(() => {
    if (!editing) {
      return;
    }

    const node = nodeRef.current;
    if (!node) {
      return;
    }

    snapshot.current = text;
    node.textContent = text;
    node.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  function commit() {
    const node = nodeRef.current;
    if (!node) {
      return;
    }

    const next = (node.textContent ?? "").trim();
    if (!next) {
      node.textContent = snapshot.current;
      onCancel();
      return;
    }

    if (next !== text) {
      onCommit(next);
      return;
    }

    onCancel();
  }

  function cancelEdit() {
    const node = nodeRef.current;
    if (node) {
      node.textContent = snapshot.current;
    }
    onCancel();
  }

  return editing ? (
    <div
      key="edit"
      ref={nodeRef}
      className="mt-[6px] min-h-[1.5em] cursor-text whitespace-pre-wrap break-words text-[13px] leading-[1.5] outline-none"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      onClick={(event) => event.stopPropagation()}
      onBlur={() => {
        commit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelEdit();
        }
      }}
    />
  ) : (
    <div
      key="view"
      className="mt-[6px] cursor-text whitespace-pre-wrap break-words text-[13px] leading-[1.5] outline-none"
      onClick={onStartEdit}
    >
      <LinkifiedText text={text} />
    </div>
  );
}

export function CommentRow({ comment, taskId, focused = false }: CommentRowProps) {
  const { data: me } = useGetMeQuery();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isSelf = me?.id === comment.authorId;
  const canEdit = isSelf;

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
            {canEdit ? (
              <button
                type="button"
                className="ml-auto text-[11px] text-muted-foreground"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </button>
            ) : null}
          </div>
          {canEdit ? (
            <CommentEditableBody
              text={comment.body}
              editing={editing}
              onStartEdit={() => setEditing(true)}
              onCommit={handleCommit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <p className="mt-[6px] whitespace-pre-wrap break-words text-[13px] leading-[1.5]">
              {comment.body}
            </p>
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
