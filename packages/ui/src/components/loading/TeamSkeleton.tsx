import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewportBand } from "@/hooks/useViewportBand";

export function TeamSkeleton() {
  const band = useViewportBand();

  return (
    <LoadingStatus
      className={
        band === "phone"
          ? "grid grid-cols-1"
          : "grid grid-cols-[minmax(0,1fr)_356px]"
      }
    >
      <div className="min-h-0 border-r border-hair bg-card">
        <div className="flex justify-end border-b border-rule px-[16px] py-[14px] md:px-[32px]">
          <Skeleton className="h-[28px] w-[88px]" />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-[14px] border-b border-hair px-[16px] py-[16px] md:px-[32px] md:py-[18px]"
          >
            <Skeleton className="size-[32px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[14px] w-[40%]" />
              <Skeleton className="mt-[8px] h-[12px] w-[62%]" />
            </div>
          </div>
        ))}
      </div>
      {band === "phone" ? null : (
        <aside className="flex min-h-0 flex-col bg-background">
          <div className="border-b border-hair px-[24px] py-[20px]">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              I report to
            </span>
          </div>
          <div className="flex items-center gap-[14px] px-[24px] py-[18px]">
            <Skeleton className="size-[32px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[14px] w-[48%]" />
              <Skeleton className="mt-[8px] h-[12px] w-[72%]" />
            </div>
          </div>
        </aside>
      )}
    </LoadingStatus>
  );
}
