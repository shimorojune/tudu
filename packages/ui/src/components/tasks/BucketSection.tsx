import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
} from "@dnd-kit/sortable";
import { DEFAULT_NOW_SOFT_CAP, type Bucket, type Task } from "@tudu/shared";
import { noSortingStrategy } from "@/lib/dragSort";
import { cn } from "@/lib/utils";
import { TaskRow, type TaskRowActions } from "@/components/tasks/TaskRow";

export type BucketSectionProps = {
  bucket: Bucket;
  label: string;
  tasks: Task[];
  selectedTaskId: string | null;
  selectedDate: string;
  onSelectTask: (id: string) => void;
  showNowHelper?: boolean;
  showNowClearPrompt?: boolean;
  onNowClearPrompt?: () => void;
  nowCount?: number;
  nowSoftCap?: number;
  dropTarget?: boolean;
  rowActionsForTask?: (taskId: string) => TaskRowActions;
};

export function BucketSection({
  bucket,
  label,
  tasks,
  selectedTaskId,
  selectedDate,
  onSelectTask,
  showNowHelper = false,
  showNowClearPrompt = false,
  onNowClearPrompt,
  nowCount,
  nowSoftCap = DEFAULT_NOW_SOFT_CAP,
  dropTarget = false,
  rowActionsForTask,
}: BucketSectionProps) {
  const isNow = bucket === "now";
  const overCap = (nowCount ?? 0) > nowSoftCap;
  const { setNodeRef } = useDroppable({ id: `bucket-${bucket}` });

  return (
    // The whole section is the drop zone, header included, so there is no dead
    // band between buckets. Rows still win: see taskCollisionDetection.
    <section
      ref={setNodeRef}
      className={cn(
        "transition-colors duration-150",
        dropTarget && "bg-foreground/[0.03]",
      )}
    >
      <header
        className={cn(
          "transition-colors duration-150",
          isNow
            ? "flex items-baseline gap-[12px] px-[28px] pb-[8px] pt-[24px]"
            : "px-[28px] pb-[8px] pt-[28px]",
          dropTarget && "bg-foreground/[0.06]",
        )}
      >
        <span
          className={cn(
            "text-[10.5px] font-extrabold uppercase tracking-[0.16em] transition-colors duration-150",
            dropTarget ? "text-foreground" : "text-faint",
          )}
        >
          {label}
        </span>
        {isNow && showNowHelper ? (
          <>
            <span
              className={cn(
                "text-[11px] font-bold tabular-nums leading-none whitespace-nowrap px-[6px] py-[2px]",
                overCap
                  ? "bg-primary font-extrabold text-primary-foreground"
                  : "border border-hair text-faint",
              )}
            >
              {nowCount} / {nowSoftCap}
            </span>
            <span className="ml-auto text-[11.5px] text-ghost">
              drag a row to reorder, or into another bucket
            </span>
          </>
        ) : null}
      </header>

      {showNowClearPrompt ? (
        <p className="px-[28px] pb-[8px] text-[13px] text-muted-foreground">
          Now is clear.{" "}
          <button
            type="button"
            className="font-semibold text-foreground underline-offset-2 hover:underline"
            onClick={onNowClearPrompt}
          >
            Pull the next thing in?
          </button>
        </p>
      ) : null}

      <div className={cn(tasks.length === 0 && "min-h-[48px]")}>
        {tasks.length === 0 && !showNowClearPrompt ? (
          <p className="px-[28px] py-[8px] text-[13px] text-faint">
            Nothing here yet.
          </p>
        ) : null}

        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={noSortingStrategy}
        >
          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              bucket={bucket}
              selected={task.id === selectedTaskId}
              selectedDate={selectedDate}
              onSelect={() => onSelectTask(task.id)}
              menuVariant="day"
              orderKey={`${bucket}:${index}`}
              actions={rowActionsForTask?.(task.id)}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  );
}
