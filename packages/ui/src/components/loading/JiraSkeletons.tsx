import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";

export function JiraIssueListSkeleton() {
  return (
    <LoadingStatus aria-label="Loading Jira issues" className="bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {Array.from({ length: 4 }, (_, index) => (
          <article
            key={index}
            data-jira-issue-skeleton
            className="border-b border-hair px-[18px] py-[14px]"
          >
            <div className="flex items-center gap-[8px]">
              <Skeleton className="h-[10px] w-[72px]" />
              <Skeleton className="h-[17px] w-[92px]" />
            </div>
            <Skeleton className="mt-[8px] h-[14px] w-[82%]" />
            <Skeleton className="mt-[7px] h-[11px] w-[64%]" />
          </article>
        ))}
      </div>
    </LoadingStatus>
  );
}

export function JiraIssuePreviewSkeleton() {
  return (
    <LoadingStatus
      aria-label="Loading Jira issue"
      className="bg-card px-[18px] py-[16px]"
    >
      <Skeleton className="h-[20px] w-[82%]" />
      <div className="mt-[12px] flex flex-wrap gap-[6px]">
        <Skeleton className="h-[22px] w-[118px]" />
        <Skeleton className="h-[22px] w-[92px]" />
        <Skeleton className="h-[22px] w-[132px]" />
      </div>
      <Skeleton className="mt-[18px] h-[96px] w-full" />
      <Skeleton className="mt-[22px] h-[12px] w-[124px]" />
      <Skeleton className="mt-[10px] h-[38px] w-full" />
    </LoadingStatus>
  );
}

export function JiraCommentsSkeleton() {
  return (
    <LoadingStatus aria-label="Loading Jira comments" className="border border-hair">
      {Array.from({ length: 2 }, (_, index) => (
        <article
          key={index}
          className="border-b border-hair px-[10px] py-[9px] last:border-b-0"
        >
          <div className="flex items-center gap-[8px]">
            <Skeleton className="h-[11px] w-[86px]" />
            <Skeleton className="h-[11px] w-[64px]" />
          </div>
          <Skeleton className="mt-[7px] h-[12px] w-[90%]" />
          <Skeleton className="mt-[5px] h-[12px] w-[58%]" />
        </article>
      ))}
    </LoadingStatus>
  );
}

export function TaskCommentsSkeleton() {
  return (
    <LoadingStatus aria-label="Loading task comments" className="py-[18px]">
      {Array.from({ length: 3 }, (_, index) => (
        <article
          key={index}
          className="border-b border-hair py-[14px] last:border-b-0"
        >
          <div className="flex items-center gap-[8px]">
            <Skeleton className="size-[24px]" />
            <Skeleton className="h-[12px] w-[108px]" />
          </div>
          <Skeleton className="mt-[8px] h-[12px] w-[88%]" />
          <Skeleton className="mt-[5px] h-[12px] w-[46%]" />
        </article>
      ))}
    </LoadingStatus>
  );
}
