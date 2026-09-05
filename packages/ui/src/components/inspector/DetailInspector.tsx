import { format, parseISO } from "date-fns";
import type { Task } from "@tudu/shared";
import { BUCKETS, type Bucket } from "@tudu/shared";
import { todayIso } from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";
import { DetailInspectorEmpty } from "@/components/inspector/DetailInspectorEmpty";
import { cn } from "@/lib/utils";

export type DetailInspectorProps = {
  task: Task | null;
  selectedDate: string;
};

function formatFieldDate(isoDate: string | null) {
  if (!isoDate) {
    return "-";
  }
  return format(new Date(`${isoDate}T12:00:00`), "EEE d MMM");
}

function formatDeadline(deadline: string | null, selectedDate: string) {
  if (!deadline) {
    return "-";
  }
  const date = parseISO(deadline);
  const today = new Date(`${selectedDate}T12:00:00`);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return `Today, ${format(date, "HH:mm")}`;
  }
  return format(date, "EEE d MMM, HH:mm");
}

function formatCarried(task: Task) {
  if (task.carriedDays <= 0) {
    return "-";
  }
  const dayWord = task.carriedDays === 1 ? "day" : "days";
  const since = task.carriedSince
    ? `, since ${format(new Date(`${task.carriedSince}T12:00:00`), "d MMM")}`
    : "";
  return `${task.carriedDays} ${dayWord}${since}`;
}

function BucketReadOnly({
  activeBucket,
  isToday,
}: {
  activeBucket: Bucket | null;
  isToday: boolean;
}) {
  if (!activeBucket) {
    return <span>-</span>;
  }

  return (
    <div className="inline-flex w-max border border-rule">
      {BUCKETS.map((bucket, index) => {
        const active = bucket === activeBucket;
        return (
          <span
            key={bucket}
            className={cn(
              "px-[14px] py-[4px] text-[11.5px]",
              index > 0 && "border-l border-rule",
              active
                ? "bg-foreground font-bold text-card"
                : "text-muted-foreground",
            )}
          >
            {bucketLabel(bucket, isToday)}
          </span>
        );
      })}
    </div>
  );
}

export function DetailInspector({ task, selectedDate }: DetailInspectorProps) {
  if (!task) {
    return <DetailInspectorEmpty />;
  }

  const isToday = selectedDate === todayIso();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-[44px] shrink-0 items-center gap-[18px] border-b border-hair px-[24px] text-[12.5px]">
        <span className="py-[13px] font-bold shadow-[inset_0_-2px_0_var(--foreground)]">
          Details
        </span>
        <span className="py-[13px] text-muted-foreground">
          Comments{" "}
          <span className="tabular-nums text-faint">2</span>
        </span>
        <span className="py-[13px] text-muted-foreground">Timeline</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[22px]">
        <h2 className="text-[19px] font-extrabold leading-[1.3] tracking-[-0.018em]">
          {task.title}
        </h2>

        <dl className="mt-[22px] grid grid-cols-[78px_minmax(0,1fr)] items-center gap-x-[16px] gap-y-[13px] text-[13px]">
          <dt className="text-muted-foreground">Bucket</dt>
          <dd>
            <BucketReadOnly activeBucket={task.bucket} isToday={isToday} />
          </dd>

          <dt className="text-muted-foreground">Start</dt>
          <dd className="tabular-nums">{formatFieldDate(task.startDate)}</dd>

          <dt className="text-muted-foreground">Deadline</dt>
          <dd className="tabular-nums">
            {formatDeadline(task.deadline, selectedDate)}
          </dd>

          <dt className="text-muted-foreground">Carried</dt>
          <dd className="tabular-nums">{formatCarried(task)}</dd>

          {task.isPrivate ? (
            <>
              <dt className="text-muted-foreground">Visibility</dt>
              <dd>
                <span className="border border-hair px-[6px] py-px text-[11px]">
                  Private
                </span>
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <footer className="mt-auto flex h-[30px] shrink-0 items-center justify-between border-t border-hair px-[24px] text-[11px] text-faint">
        <span>Panes drag to resize · rows drag to reorder</span>
        <span className="font-mono">⌘K commands</span>
      </footer>
    </div>
  );
}
