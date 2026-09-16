import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Bucket, Task } from "@tudu/shared";
import { cn } from "@/lib/utils";
import {
  readCompletedSectionExpanded,
  writeCompletedSectionExpanded,
} from "@/lib/completedTasks";
import { TaskRow, type TaskRowActions, type TaskViewer } from "@/components/tasks/TaskRow";
import { useProjectFilterId } from "@/hooks/useProjectFilterId";
import { isTaskDimmed } from "@/lib/projectFilter";

export type CompletedSectionProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedDate: string;
  onSelectTask: (id: string) => void;
  onDeselectTask?: () => void;
  rowActionsForTask?: (taskId: string) => TaskRowActions;
  flashTaskId?: string | null;
  onFlashComplete?: () => void;
  viewer?: TaskViewer;
  menuVariant?: "day" | "unscheduled";
  bucketForRow?: (task: Task) => Bucket;
};

export function CompletedSection({
  tasks,
  selectedTaskId,
  selectedDate,
  onSelectTask,
  onDeselectTask,
  rowActionsForTask,
  flashTaskId = null,
  onFlashComplete,
  viewer = "owner",
  menuVariant = "day",
  bucketForRow = (task) => task.bucket ?? "later",
}: CompletedSectionProps) {
  const filterProjectId = useProjectFilterId();
  const [expanded, setExpanded] = useState(() => readCompletedSectionExpanded());

  if (tasks.length === 0) {
    return null;
  }

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      writeCompletedSectionExpanded(next);
      return next;
    });
  }

  return (
    <section data-testid="completed-section" className="pb-[16px]">
      <header className="flex items-center gap-[8px] px-[16px] pb-[8px] pt-[22px] xl:gap-[11px] xl:px-[28px] xl:pt-[28px]">
        <button
          type="button"
          data-testid="completed-section-toggle"
          className="inline-flex items-center gap-[8px] text-left"
          aria-expanded={expanded}
          aria-controls="completed-section-rows"
          onClick={toggleExpanded}
        >
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            aria-hidden
            className={cn(
              "text-faint transition-transform duration-150",
              !expanded && "-rotate-90",
            )}
          />
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Completed
          </span>
          <span className="text-[11px] font-bold tabular-nums text-ghost">
            {tasks.length}
          </span>
        </button>
      </header>

      {expanded ? (
        <div id="completed-section-rows" data-testid="completed-section-rows">
          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              bucket={bucketForRow(task)}
              selected={task.id === selectedTaskId}
              selectedDate={selectedDate}
              onSelect={() => onSelectTask(task.id)}
              onCollapse={onDeselectTask}
              menuVariant={menuVariant}
              orderKey={`completed:${index}`}
              actions={rowActionsForTask?.(task.id)}
              flash={task.id === flashTaskId}
              onFlashComplete={onFlashComplete}
              viewer={viewer}
              dimmed={isTaskDimmed(task, filterProjectId)}
              draggable={false}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
