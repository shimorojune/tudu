import type { Bucket, Task } from "@tudu/shared";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { taskMetaSegments } from "@/lib/taskMeta";

export type TaskRowProps = {
  task: Task;
  bucket: Bucket;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
};

function TaskCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "mt-px flex size-[18px] shrink-0 items-center justify-center border-[1.5px] bg-card",
        checked
          ? "border-foreground bg-foreground text-card"
          : "border-ghost",
      )}
    >
      {checked ? <Check size={12} strokeWidth={3} /> : null}
    </div>
  );
}

function SubtaskCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-[14px] shrink-0 items-center justify-center border-[1.5px]",
        checked
          ? "border-foreground bg-foreground text-card"
          : "border-ghost bg-card",
      )}
    >
      {checked ? <Check size={10} strokeWidth={3} /> : null}
    </div>
  );
}

function DragHandleDots() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-2 gap-[3px] pt-[6px] text-ghost"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="size-[3px] bg-current" />
      ))}
    </div>
  );
}

function titleClass(bucket: Bucket, selected: boolean) {
  if (bucket === "now") {
    return selected
      ? "text-[15.5px] font-semibold leading-[1.42] tracking-[-0.005em]"
      : "text-[15.5px] font-semibold leading-[1.42] tracking-[-0.005em]";
  }
  if (bucket === "later") {
    return "text-[14.5px] text-muted-foreground";
  }
  return "text-[15px] leading-[1.42]";
}

export function TaskRow({
  task,
  bucket,
  selected,
  selectedDate,
  onSelect,
}: TaskRowProps) {
  const segments = selectedDate
    ? taskMetaSegments(task, selectedDate)
    : taskMetaSegments(task, task.scheduledDate ?? "");
  const isLater = bucket === "later";
  const isCompleted = task.completedAt !== null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "grid cursor-default border-b border-hair outline-none",
        selected
          ? "grid-cols-[13px_19px_minmax(0,1fr)] gap-x-[12px] bg-foreground/[0.03] py-[14px] pl-[13px] pr-[28px] shadow-[inset_2px_0_0_var(--foreground)]"
          : "grid-cols-[19px_minmax(0,1fr)] gap-x-[15px] px-[28px] hover:bg-foreground/[0.02]",
        isLater && !selected ? "items-center py-[12px]" : !selected && "py-[15px]",
      )}
    >
      {selected ? <DragHandleDots /> : null}
      <TaskCheckbox checked={isCompleted} />
      <div className="min-w-0">
        <div
          className={cn(
            isLater && task.startDate
              ? "flex items-baseline gap-[10px]"
              : undefined,
          )}
        >
          <span className={titleClass(bucket, selected)}>{task.title}</span>
          {isLater && task.startDate ? (
            <span className="text-[12px] tabular-nums text-faint">
              starts{" "}
              {new Date(`${task.startDate}T12:00:00`).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "short" },
              )}
            </span>
          ) : null}
        </div>
        {segments.length > 0 ? (
          <div className="mt-[4px] flex flex-wrap items-center gap-[9px] text-[12.5px] tabular-nums text-muted-foreground">
            {segments.map((segment, index) =>
              segment.kind === "dot" ? (
                <span key={`dot-${index}`} className="text-ghost">
                  ·
                </span>
              ) : (
                <span
                  key={`text-${index}`}
                  className={cn(segment.emphasis && "font-bold text-foreground")}
                >
                  {segment.text}
                </span>
              ),
            )}
          </div>
        ) : null}
        {selected && task.subtasks.length > 0 ? (
          <ul className="mt-[10px] space-y-[4px]">
            {task.subtasks.map((subtask) => (
              <li
                key={subtask.id}
                className="flex items-start gap-[11px] py-[4px]"
              >
                <SubtaskCheckbox checked={subtask.done} />
                <span
                  className={cn(
                    "text-[13.5px] leading-[1.4]",
                    subtask.done && "text-faint line-through",
                  )}
                >
                  {subtask.title}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
