import type { Task } from "@tudu/shared";
import { useGetCommentsQuery } from "@tudu/store";
import { CommentComposer } from "@/components/inspector/CommentComposer";
import { CommentRow } from "@/components/inspector/CommentRow";

export type CommentsTabProps = {
  task: Task;
};

export function CommentsTab({ task }: CommentsTabProps) {
  const { data, isLoading } = useGetCommentsQuery(task.id);
  const comments = data?.comments ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-[24px]">
        {isLoading ? null : comments.length === 0 ? (
          <p className="py-[48px] text-center text-[13px] text-faint">
            No comments yet.
          </p>
        ) : (
          <div className="divide-y divide-hair">
            {comments.map((comment) => (
              <CommentRow key={comment.id} comment={comment} taskId={task.id} />
            ))}
          </div>
        )}
      </div>
      <CommentComposer taskId={task.id} />
    </div>
  );
}
