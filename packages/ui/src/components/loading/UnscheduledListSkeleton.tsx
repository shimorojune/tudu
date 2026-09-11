import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { TaskRowSkeleton } from "@/components/loading/TaskRowSkeleton";

export function UnscheduledListSkeleton() {
  return (
    <LoadingStatus className="bg-card">
      <header className="flex items-center gap-[11px] px-[16px] pb-[8px] pt-[24px] md:px-[28px]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          Unscheduled
        </span>
      </header>
      {Array.from({ length: 5 }, (_, index) => (
        <TaskRowSkeleton key={index} index={index} />
      ))}
    </LoadingStatus>
  );
}
