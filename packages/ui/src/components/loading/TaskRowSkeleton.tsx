import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TITLE_WIDTHS = ["w-[72%]", "w-[58%]", "w-[84%]", "w-[64%]"];

export function TaskRowSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="grid grid-cols-[13px_19px_minmax(0,1fr)] items-center gap-x-[12px] border-b border-hair px-[16px] py-[15px] xl:px-[28px]">
      <span aria-hidden />
      <Skeleton className="size-[18px]" />
      <Skeleton
        className={cn("h-[14px]", TITLE_WIDTHS[index % TITLE_WIDTHS.length])}
      />
    </div>
  );
}
