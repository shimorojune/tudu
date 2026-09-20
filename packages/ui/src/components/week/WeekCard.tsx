import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { Task } from "@tudu/shared";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { taskMetaSegments } from "@/lib/taskMeta";
import { LinkifiedText } from "@/components/text/LinkifiedText";
import { cn } from "@/lib/utils";

export type WeekCardProps = Omit<ComponentPropsWithoutRef<"button">, "type"> & {
  task: Task;
  scheduledDate: string;
  isToday: boolean;
  dragging?: boolean;
  dimmed?: boolean;
};

export const WeekCard = forwardRef<HTMLButtonElement, WeekCardProps>(
  function WeekCard(
    {
      task,
      scheduledDate,
      isToday: _isToday,
      dragging = false,
      dimmed = false,
      className,
      ...rest
    },
    ref,
  ) {
    const completed = task.completedAt !== null;
    const inProgress = task.inProgress && !completed;
    const segments = taskMetaSegments(task, scheduledDate);
    const isNow = task.bucket === "now";

    return (
      <button
        ref={ref}
        type="button"
        data-week-card={task.id}
        className={cn(
          "w-full border-l-2 px-[9px] py-[3px] text-left",
          inProgress
            ? "border-primary"
            : isNow
              ? "border-foreground"
              : "border-hair",
          completed && "opacity-55",
          dimmed && "opacity-35",
          dragging && "opacity-40",
          className,
        )}
        {...rest}
      >
        <div
          className={cn(
            "text-[12.5px] leading-[1.4]",
            completed && "line-through decoration-[1.5px]",
            isNow && !completed && "font-semibold",
          )}
        >
          <LinkifiedText text={task.title} />
        </div>
        {segments.length > 0 || task.project ? (
          <div className="mt-[3px] flex flex-wrap items-center gap-x-[6px] gap-y-[2px] text-[11px] text-muted-foreground">
            {task.project ? <ProjectChip project={task.project} /> : null}
            {task.project && segments.length > 0 ? (
              <span className="text-faint" aria-hidden>
                ·
              </span>
            ) : null}
            {segments.map((segment, index) => {
              if (segment.kind === "dot") {
                return (
                  <span key={`dot-${index}`} className="text-faint" aria-hidden>
                    ·
                  </span>
                );
              }
              return (
                <span
                  key={`${segment.text}-${index}`}
                  className={cn(
                    segment.accent && "text-primary-text",
                    segment.emphasis && "font-semibold text-foreground",
                  )}
                >
                  {segment.text}
                </span>
              );
            })}
          </div>
        ) : null}
      </button>
    );
  },
);
