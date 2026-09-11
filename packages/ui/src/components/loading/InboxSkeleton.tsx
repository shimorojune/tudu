import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewportBand } from "@/hooks/useViewportBand";

export function InboxSkeleton() {
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
        <article className="flex flex-col gap-[14px] border-b border-hair px-[16px] py-[24px] md:px-[32px]">
          <div className="flex items-center gap-[10px]">
            <Skeleton className="size-[24px]" />
            <Skeleton className="h-[12px] w-[160px]" />
          </div>
          <Skeleton className="h-[18px] w-[78%]" />
          <Skeleton className="h-[12px] w-[42%]" />
        </article>
        <article className="flex flex-col gap-[14px] border-b border-hair px-[16px] py-[24px] md:px-[32px]">
          <div className="flex items-center gap-[10px]">
            <Skeleton className="size-[24px]" />
            <Skeleton className="h-[12px] w-[128px]" />
          </div>
          <Skeleton className="h-[18px] w-[62%]" />
        </article>
      </div>
      {band === "phone" ? null : (
        <aside className="flex min-h-0 flex-col bg-background">
          <div className="flex items-center gap-[10px] border-b border-hair px-[24px] py-[20px]">
            <Skeleton className="size-[24px]" />
            <Skeleton className="h-[10px] w-[140px]" />
          </div>
          <div className="flex flex-col gap-[16px] px-[24px] py-[20px]">
            <Skeleton className="h-[12px] w-full" />
            <Skeleton className="h-[12px] w-[84%]" />
            <Skeleton className="h-[12px] w-[70%]" />
          </div>
        </aside>
      )}
    </LoadingStatus>
  );
}
