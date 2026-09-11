import { BUCKETS } from "@tudu/shared";
import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { TaskRowSkeleton } from "@/components/loading/TaskRowSkeleton";
import { bucketLabel } from "@/lib/buckets";

const ROWS_BY_BUCKET = {
  now: 2,
  next: 3,
  later: 2,
} as const;

export function DayListSkeleton({
  announce = true,
  isToday = true,
}: {
  announce?: boolean;
  isToday?: boolean;
}) {
  let rowIndex = 0;

  const body = BUCKETS.map((bucket) => {
    const rows = ROWS_BY_BUCKET[bucket];
    const start = rowIndex;
    rowIndex += rows;

    return (
      <section key={bucket}>
        <header className="flex items-center gap-[8px] px-[16px] pb-[8px] pt-[22px] xl:gap-[11px] xl:px-[28px] xl:pt-[28px]">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
                {bucketLabel(bucket, isToday)}
          </span>
        </header>
        {Array.from({ length: rows }, (_, offset) => (
          <TaskRowSkeleton key={offset} index={start + offset} />
        ))}
      </section>
    );
  });

  if (!announce) {
    return <div className="h-full min-h-0 bg-card">{body}</div>;
  }

  return <LoadingStatus className="bg-card">{body}</LoadingStatus>;
}

