import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { useSelector } from "react-redux";
import { format } from "date-fns";
import type { Task } from "@tudu/shared";
import { BUCKETS, type Bucket } from "@tudu/shared";
import { selectVisible } from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";
import { containerDroppableId } from "@/lib/dragSort";
import { containerForDayBucket, isWeekendIso, parseIsoDate } from "@/lib/week";
import { useProjectFilterId } from "@/hooks/useProjectFilterId";
import { isTaskDimmed } from "@/lib/projectFilter";
import { SortableWeekCard } from "@/components/week/SortableWeekCard";
import { WeekCardPopover } from "@/components/week/WeekCardPopover";
import { cn } from "@/lib/utils";
import { noSortingStrategy } from "@/lib/dragSort";

export type WeekColumnProps = {
  date: string;
  tasks: Task[];
  isToday: boolean;
  highlighted: boolean;
  dropTargetBucket: string | null;
  popoverTaskId: string | null;
  onHighlight: () => void;
  onPopoverChange: (taskId: string | null) => void;
};

function BucketZone({
  date,
  bucket,
  tasks,
  allDayTasks,
  isToday,
  dropActive,
  popoverTaskId,
  onPopoverChange,
}: {
  date: string;
  bucket: Bucket;
  tasks: Task[];
  allDayTasks: Task[];
  isToday: boolean;
  dropActive: boolean;
  popoverTaskId: string | null;
  onPopoverChange: (taskId: string | null) => void;
}) {
  const remoteMovedTaskIds = useSelector(selectVisible).remoteMovedTaskIds;
  const filterProjectId = useProjectFilterId();
  const container = containerForDayBucket(date, bucket);
  const { setNodeRef } = useDroppable({ id: containerDroppableId(container) });
  const label = bucketLabel(bucket, isToday);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[28px] px-[12px] py-[6px]",
        dropActive && "bg-foreground/[0.03]",
      )}
    >
      <div className="mb-[4px] text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
      <SortableContext items={tasks.map((task) => task.id)} strategy={noSortingStrategy}>
        <div className="flex flex-col gap-[8px]">
          {tasks.map((task, index) => {
            const open = popoverTaskId === task.id;
            return (
              <WeekCardPopover
                key={task.id}
                task={task}
                scheduledDate={date}
                isToday={isToday}
                dayTasks={allDayTasks}
                open={open}
                onOpenChange={(next) => onPopoverChange(next ? task.id : null)}
              >
                <SortableWeekCard
                  task={task}
                  scheduledDate={date}
                  isToday={isToday}
                  orderKey={`${date}:${index}`}
                  skipSlide={remoteMovedTaskIds.includes(task.id)}
                  dimmed={isTaskDimmed(task, filterProjectId)}
                />
              </WeekCardPopover>
            );
          })}
        </div>
      </SortableContext>
    </div>
  );
}

export function WeekColumn({
  date,
  tasks,
  isToday,
  highlighted,
  dropTargetBucket,
  popoverTaskId,
  onHighlight,
  onPopoverChange,
}: WeekColumnProps) {
  const weekend = isWeekendIso(date);
  const dayDate = parseIsoDate(date);
  const weekday = format(dayDate, "EEE").toUpperCase();
  const dayNumber = format(dayDate, "d");
  const carriedCount = tasks.filter((task) => task.carriedDays > 0).length;

  const byBucket = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, [] as Task[]]),
  ) as Record<Bucket, Task[]>;

  for (const task of tasks) {
    if (task.bucket) {
      byBucket[task.bucket].push(task);
    }
  }

  for (const bucket of BUCKETS) {
    byBucket[bucket].sort((a, b) => a.position - b.position);
  }

  return (
    <div
      data-week-col={date}
      className={cn(
        "flex min-h-0 flex-col border-r border-hair",
        isToday && "bg-[#f6f4f3]",
        weekend && !isToday && "bg-[#f1efed]",
      )}
    >
      <button
        type="button"
        className={cn(
          "border-b border-hair px-[14px] py-[10px] text-left",
          highlighted && "shadow-[inset_0_-2px_0_var(--foreground)]",
        )}
        onClick={onHighlight}
      >
        <div
          className={cn(
            "text-[10.5px] font-extrabold uppercase tracking-[0.14em]",
            isToday ? "text-primary" : weekend ? "text-ghost" : "text-faint",
          )}
        >
          {isToday ? `${weekday} · today` : weekday}
        </div>
        <div
          className={cn(
            "text-[16px] font-extrabold tabular-nums tracking-[-0.02em]",
            weekend && !isToday && "text-ghost",
          )}
        >
          {dayNumber}
        </div>
        {carriedCount > 0 ? (
          <div className="mt-[6px] text-[11.5px] text-muted-foreground">
            {carriedCount} carried forward
          </div>
        ) : null}
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {BUCKETS.map((bucket) => (
          <BucketZone
            key={bucket}
            date={date}
            bucket={bucket}
            tasks={byBucket[bucket]}
            allDayTasks={tasks}
            isToday={isToday}
            dropActive={dropTargetBucket === containerForDayBucket(date, bucket)}
            popoverTaskId={popoverTaskId}
            onPopoverChange={onPopoverChange}
          />
        ))}
      </div>
    </div>
  );
}
