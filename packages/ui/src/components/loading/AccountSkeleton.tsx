import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";

export function AccountSkeleton() {
  return (
    <LoadingStatus className="px-[30px] py-[26px]">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        You
      </div>
      <div className="mt-[14px] flex items-center gap-[14px]">
        <Skeleton className="size-[44px]" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-[15px] w-[140px]" />
          <Skeleton className="mt-[8px] h-[12px] w-[180px]" />
        </div>
      </div>
      <div className="mt-[22px] grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-[16px] gap-y-[14px]">
        <Skeleton className="h-[14px] w-[92px]" />
        <Skeleton className="h-[14px] w-[120px]" />
        <Skeleton className="h-[14px] w-[80px]" />
        <Skeleton className="h-[14px] w-[160px]" />
      </div>
    </LoadingStatus>
  );
}
