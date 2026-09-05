import type { Bucket, Task } from "@tudu/shared";
import { TaskRow } from "@/components/tasks/TaskRow";

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
}: BucketSectionProps) {
  const isNow = bucket === "now";

  return (
    <section>
      <header
        className={
          isNow
            ? "flex items-baseline gap-[12px] px-[28px] pb-[8px] pt-[24px]"
            : "px-[28px] pb-[8px] pt-[28px]"
        }
      >
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          {label}
        </span>
        {showNowHelper ? (
          <span className="ml-auto text-[11.5px] text-ghost">
            drag a row to reorder, or into another bucket
          </span>
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

      {tasks.length === 0 && !showNowClearPrompt ? (
        <p className="px-[28px] py-[8px] text-[13px] text-faint">
          Nothing here yet.
        </p>
      ) : null}

      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          bucket={bucket}
          selected={task.id === selectedTaskId}
          selectedDate={selectedDate}
          onSelect={() => onSelectTask(task.id)}
        />
      ))}
    </section>
  );
}
