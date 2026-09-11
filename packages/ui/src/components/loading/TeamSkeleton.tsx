import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";

export function TeamSkeleton() {
  return (
    <LoadingStatus className="flex flex-col bg-card">
      <div className="flex items-center justify-end border-b border-rule px-[16px] py-[14px] md:px-[32px]">
        <Skeleton className="h-[28px] w-[88px]" />
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_84px_84px_112px_214px] gap-x-[16px] border-b border-rule px-[32px] py-[14px] md:grid">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Reports to me
        </span>
        <span className="text-right text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Now
        </span>
        <span className="text-right text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Open
        </span>
        <span className="text-right text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Slipping
        </span>
        <span />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index}>
          <div className="border-b border-hair px-[16px] py-[16px] md:hidden">
            <div className="flex items-center gap-[14px]">
              <Skeleton className="size-[32px]" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-[14px] w-[40%]" />
                <Skeleton className="mt-[8px] h-[12px] w-[62%]" />
              </div>
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_84px_84px_112px_214px] items-center gap-x-[16px] border-b border-hair px-[32px] py-[18px] md:grid">
            <div className="flex items-center gap-[14px]">
              <Skeleton className="size-[32px]" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-[14px] w-[36%]" />
                <Skeleton className="mt-[8px] h-[12px] w-[52%]" />
              </div>
            </div>
            <Skeleton className="ml-auto h-[14px] w-[18px]" />
            <Skeleton className="ml-auto h-[14px] w-[18px]" />
            <Skeleton className="ml-auto h-[14px] w-[18px]" />
            <div className="flex justify-end gap-[8px]">
              <Skeleton className="h-[28px] w-[78px]" />
              <Skeleton className="h-[28px] w-[78px]" />
            </div>
          </div>
        </div>
      ))}
    </LoadingStatus>
  );
}
