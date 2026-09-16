import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Task } from "@tudu/shared";
import {
  clearFocusCommentId,
  useGetCommentsQuery,
  type RootState,
} from "@tudu/store";
import { CommentComposer } from "@/components/inspector/CommentComposer";
import { CommentRow } from "@/components/inspector/CommentRow";
import { TaskCommentsSkeleton } from "@/components/loading/JiraSkeletons";

export type CommentsTabProps = {
  task: Task;
  canComment?: boolean;
};

export function CommentsTab({
  task,
  canComment = true,
}: CommentsTabProps) {
  const dispatch = useDispatch();
  const { data, isLoading } = useGetCommentsQuery(task.id);
  const comments = data?.comments ?? [];
  const focusCommentId = useSelector((state: RootState) => state.day.focusCommentId);

  useEffect(() => {
    if (!focusCommentId) {
      return;
    }
    if (!comments.some((comment) => comment.id === focusCommentId)) {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatch(clearFocusCommentId());
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [comments, dispatch, focusCommentId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-[24px]">
        {isLoading ? (
          <TaskCommentsSkeleton />
        ) : comments.length === 0 ? (
          <p className="py-[48px] text-center text-[13px] text-faint">
            No comments yet.
          </p>
        ) : (
          <div className="divide-y divide-hair">
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                taskId={task.id}
                focused={comment.id === focusCommentId}
                canEdit={canComment}
              />
            ))}
          </div>
        )}
      </div>
      <CommentComposer taskId={task.id} disabled={!canComment} />
      {!canComment ? (
        <p className="border-t border-hair px-[24px] py-[10px] text-[11.5px] text-faint">
          You cannot comment on this report's task.
        </p>
      ) : null}
    </div>
  );
}
