import { Copy } from "lucide-react";
import type { Task } from "@tudu/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type TaskIdTagProps = {
  taskKey: string;
  onCopy?: () => void;
  className?: string;
  showCopyButton?: boolean;
};

export function TaskIdTag({
  taskKey,
  onCopy,
  className,
  showCopyButton = true,
}: TaskIdTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[12.5px] font-semibold text-foreground",
        className,
      )}
    >
      {taskKey}
      {showCopyButton && onCopy ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          aria-label="Copy task ID"
          title="Copy task ID  Cmd+Shift+C"
          onClick={(event) => {
            event.stopPropagation();
            onCopy();
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      ) : null}
    </span>
  );
}

export type TaskIdTagFromTaskProps = {
  task: Task;
  onCopy?: (taskKey: string) => void;
  className?: string;
  showCopyButton?: boolean;
};

export function TaskIdTagFromTask({
  task,
  onCopy,
  className,
  showCopyButton,
}: TaskIdTagFromTaskProps) {
  return (
    <TaskIdTag
      taskKey={task.taskKey}
      className={className}
      showCopyButton={showCopyButton}
      onCopy={onCopy ? () => onCopy(task.taskKey) : undefined}
    />
  );
}
