import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  calendarDayIso,
  effectiveDayIso,
  isMidnightBoundary,
} from "@tudu/shared";
import { X } from "lucide-react";
import {
  dismissMidnight,
  isMidnightDismissed,
  readDayOverride,
  writeDayOverride,
} from "@/lib/rolloverState";

export type MidnightBannerProps = {
  selectedDate: string;
  onStartDay: (calendarDay: string) => void;
};

function parseNoon(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function dayName(iso: string) {
  return format(parseNoon(iso), "EEEE");
}

export function MidnightBanner({ selectedDate, onStartDay }: MidnightBannerProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const calendarDay = calendarDayIso(now);
  const override = readDayOverride();

  if (override === selectedDate) {
    return null;
  }

  if (!isMidnightBoundary({ selectedDate, now })) {
    return null;
  }

  if (isMidnightDismissed(calendarDay)) {
    return null;
  }

  const timeLabel = format(now, "HH:mm");
  const calendarDayName = dayName(calendarDay);
  const viewingDayName = dayName(selectedDate);

  return (
    <div
      className="flex items-center gap-[16px] border-b-2 border-foreground bg-card px-[28px] py-[13px]"
      role="status"
    >
      <span
        className="flex size-[16px] shrink-0 items-center justify-center border border-foreground text-foreground"
        aria-hidden
      >
        <span className="size-[6px] bg-foreground" style={{ borderRadius: "50%" }} />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-[1.45] text-muted-foreground">
        It&apos;s{" "}
        <span className="font-bold text-foreground">
          {timeLabel} on {calendarDayName}
        </span>
        , and you&apos;re still on {viewingDayName}&apos;s list. Nothing has moved.
      </p>
      <div className="flex shrink-0 items-center gap-[8px]">
        <button
          type="button"
          className="bg-primary px-[12px] py-[6px] text-[12.5px] font-bold text-primary-foreground"
          onClick={() => {
            writeDayOverride(null);
            dismissMidnight(calendarDay);
            onStartDay(calendarDay);
          }}
        >
          Start {format(parseNoon(calendarDay), "EEE d MMM")}
        </button>
        <button
          type="button"
          className="border border-rule px-[12px] py-[5px] text-[12.5px] text-muted-foreground"
          onClick={() => {
            writeDayOverride(selectedDate);
            dismissMidnight(calendarDay);
          }}
        >
          Stay on {viewingDayName}
        </button>
      </div>
      <button
        type="button"
        className="shrink-0 text-ghost"
        aria-label="Dismiss midnight banner"
        onClick={() => dismissMidnight(calendarDay)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function shouldShowMidnightBanner(selectedDate: string, now = new Date()) {
  const calendarDay = calendarDayIso(now);
  if (readDayOverride() === selectedDate) {
    return false;
  }
  if (!isMidnightBoundary({ selectedDate, now })) {
    return false;
  }
  if (isMidnightDismissed(calendarDay)) {
    return false;
  }
  return true;
}

export { effectiveDayIso };
