import { useState, type ReactNode } from "react";
import {
  BUCKETS,
  canPlaceInNow,
  DEFAULT_NOW_SOFT_CAP,
  defaultAcceptOtherDate,
  type Bucket,
} from "@tudu/shared";
import { DateField } from "@/components/ui/date-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bucketLabel } from "@/lib/buckets";

export type InboxAcceptControlsProps = {
  startDate: string | null;
  today: string;
  openNowCountOnToday: number;
  onAccept: (args: { bucket: Bucket; scheduledDate: string }) => void;
  children?: ReactNode;
};

export function InboxAcceptControls({
  startDate,
  today,
  openNowCountOnToday,
  onAccept,
  children,
}: InboxAcceptControlsProps) {
  const [todayOpen, setTodayOpen] = useState(false);
  const [otherDayOpen, setOtherDayOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(() =>
    defaultAcceptOtherDate(startDate, today),
  );
  const otherDayIsToday = pickedDate === today;

  function acceptToday(bucket: Bucket) {
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
    setTodayOpen(false);
    onAccept({ bucket, scheduledDate: today });
  }

  function acceptOtherDay(bucket: Bucket, scheduledDate: string) {
    if (
      bucket === "now" &&
      scheduledDate === today &&
      !canPlaceInNow({
        today,
        targetDate: today,
        targetBucket: "now",
        openNowCountOnToday,
      })
    ) {
      return;
    }
    onAccept({ bucket, scheduledDate });
  }

  const nowFullToday =
    openNowCountOnToday >= DEFAULT_NOW_SOFT_CAP;

  function openOtherDay() {
    setTodayOpen(false);
    setPickedDate(defaultAcceptOtherDate(startDate, today));
    setOtherDayOpen(true);
  }

  if (otherDayOpen) {
    return (
      <div
        className="flex flex-col gap-[10px] border border-rule bg-card p-[14px]"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Land on
        </span>
        <DateField
          value={pickedDate}
          allowClear={false}
          onChange={setPickedDate}
          aria-label="Accept date"
          className="w-auto bg-transparent px-[10px] py-[7px] text-[13px]"
        />
        <div className="flex flex-wrap items-center gap-[10px]">
          {BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="button"
              disabled={bucket === "now" && otherDayIsToday && nowFullToday}
              className="border border-rule px-[13px] py-[8px] text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => acceptOtherDay(bucket, pickedDate)}
            >
              {bucketLabel(bucket, otherDayIsToday)}
            </button>
          ))}
          <button
            type="button"
            className="text-[12.5px] text-muted-foreground"
            onClick={() => setOtherDayOpen(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-[10px] pt-[2px]">
      <Popover open={todayOpen} onOpenChange={setTodayOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="bg-primary px-[15px] py-[8px] text-[12.5px] font-bold text-primary-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            Accept today
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] p-0">
          <div className="flex flex-col py-[4px]">
            {BUCKETS.map((bucket) => (
              <button
                key={bucket}
                type="button"
                disabled={bucket === "now" && nowFullToday}
                className="px-[14px] py-[8px] text-left text-[13px] hover:bg-foreground/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => acceptToday(bucket)}
              >
                {bucketLabel(bucket, true)}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="border border-rule px-[13px] py-[8px] text-[12.5px]"
        onClick={(event) => {
          event.stopPropagation();
          openOtherDay();
        }}
      >
        Accept another day…
      </button>
      {children}
    </div>
  );
}
