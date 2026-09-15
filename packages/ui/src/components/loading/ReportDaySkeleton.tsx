import { DayListSkeleton } from "@/components/loading/DayListSkeleton";
import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { PaneSkeleton } from "@/components/loading/PaneSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewportBand } from "@/hooks/useViewportBand";

export function ReportDaySkeleton({ isToday = false }: { isToday?: boolean }) {
  const band = useViewportBand();

  return (
    <LoadingStatus className="flex flex-col bg-card">
      <div className="flex h-[56px] shrink-0 items-center gap-[12px] border-b border-rule px-[12px] md:gap-[16px] md:px-[22px]">
        <Skeleton className="h-[13px] w-[52px]" />
        <Skeleton className="size-[26px]" />
        <Skeleton className="h-[16px] w-[120px]" />
      </div>
      {band === "phone" ? (
        <div className="min-h-0 flex-1">
          <DayListSkeleton announce={false} isToday={isToday} />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(280px,396px)]">
          <div className="min-h-0 border-r border-hair">
            <DayListSkeleton announce={false} isToday={isToday} />
          </div>
          <div className="min-h-0 border-r border-hair">
            <PaneSkeleton announce={false} />
          </div>
          <PaneSkeleton announce={false} />
        </div>
      )}
    </LoadingStatus>
  );
}
