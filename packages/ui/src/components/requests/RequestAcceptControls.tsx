import type { ReactNode } from "react";
import {
  BUCKETS,
  canPlaceInNow,
  DEFAULT_NOW_SOFT_CAP,
  type Bucket,
} from "@tudu/shared";
import { Button } from "@/components/ui/button";
import { bucketLabel } from "@/lib/buckets";

export type RequestAcceptControlsProps = {
  openNowCountOnToday: number;
  today: string;
  onAccept: (bucket: Bucket) => void;
  onDecline: () => void;
  children?: ReactNode;
};

export function RequestAcceptControls({
  openNowCountOnToday,
  today,
  onAccept,
  onDecline,
  children,
}: RequestAcceptControlsProps) {
  const nowFull = openNowCountOnToday >= DEFAULT_NOW_SOFT_CAP;

  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      {BUCKETS.map((bucket) => (
        <Button
          key={bucket}
          type="button"
          size="sm"
          variant="outline"
          disabled={bucket === "now" && nowFull}
          onClick={(event) => {
            event.stopPropagation();
            if (
              bucket === "now" &&
              !canPlaceInNow({
                today,
                targetDate: today,
                targetBucket: "now",
                openNowCountOnToday,
              })
            ) {
              return;
            }
            onAccept(bucket);
          }}
        >
          Accept into {bucketLabel(bucket, true)}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onDecline();
        }}
      >
        Decline…
      </Button>
      {children}
      <span className="ml-auto text-[11.5px] text-faint">
        Cmd+1 · Cmd+2 · Cmd+\
      </span>
    </div>
  );
}
