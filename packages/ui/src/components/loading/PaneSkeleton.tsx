import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";

export function PaneSkeleton({ announce = true }: { announce?: boolean }) {
  const body = (
    <>
      <div className="flex gap-[16px] border-b border-hair pb-[12px]">
        <Skeleton className="h-[12px] w-[52px]" />
        <Skeleton className="h-[12px] w-[72px]" />
        <Skeleton className="h-[12px] w-[64px]" />
      </div>
      <Skeleton className="mt-[22px] h-[16px] w-[68%]" />
      <Skeleton className="mt-[12px] h-[12px] w-[92%]" />
      <Skeleton className="mt-[8px] h-[12px] w-[74%]" />
      <Skeleton className="mt-[8px] h-[12px] w-[40%]" />
    </>
  );

  if (!announce) {
    return (
      <div className="h-full min-h-0 bg-background px-[28px] py-[24px]">{body}</div>
    );
  }

  return (
    <LoadingStatus className="bg-background px-[28px] py-[24px]">{body}</LoadingStatus>
  );
}
