import { useRef } from "react";
import { format } from "date-fns";
import { BUCKETS, effectiveDayIso } from "@tudu/shared";
import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { bucketLabel } from "@/lib/buckets";
import { isWeekendIso, parseIsoDate } from "@/lib/week";
import { cn } from "@/lib/utils";

const CARD_WIDTHS = ["w-[88%]", "w-[64%]", "w-[76%]"];

export function WeekGridSkeleton({
  weekDays,
  highlightedDay,
}: {
  weekDays: string[];
  highlightedDay?: string;
}) {
  const today = effectiveDayIso();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeDay = highlightedDay ?? weekDays[0];

  function scrollToColumn(id: string) {
    const node = scrollerRef.current?.querySelector(`[data-week-col="${id}"]`);
    node?.scrollIntoView({ inline: "start", block: "nearest" });
  }

  return (
    <LoadingStatus className="flex flex-1 flex-col">
      <div className="flex shrink-0 gap-[6px] overflow-x-auto border-b border-hair bg-card px-[10px] py-[8px] xl:hidden">
        <button
          type="button"
          aria-label="Jump to Unscheduled"
          className="shrink-0 border border-rule px-[8px] py-[5px] text-[11px] font-bold text-muted-foreground"
          onClick={() => scrollToColumn("unscheduled")}
        >
          Unscheduled
        </button>
        {weekDays.map((day) => (
          <button
            key={day}
            type="button"
            aria-label={`Jump to ${format(parseIsoDate(day), "EEEE")}`}
            className={cn(
              "shrink-0 border border-rule px-[8px] py-[5px] text-[11px] font-bold",
              day === activeDay
                ? "bg-foreground text-card"
                : "text-muted-foreground",
            )}
            onClick={() => scrollToColumn(day)}
          >
            {format(parseIsoDate(day), "EEE")}
          </button>
        ))}
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-x-auto xl:overflow-x-hidden"
      >
        <div className="grid h-full min-h-0 min-w-[1160px] grid-cols-[180px_repeat(7,minmax(140px,1fr))] xl:min-w-0 xl:grid-cols-[220px_repeat(7,minmax(0,1fr))]">
          <div
            className="flex min-h-0 flex-col border-r border-hair bg-card"
            data-week-col="unscheduled"
          >
            <div className="border-b border-hair px-[14px] py-[12px]">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
                Unscheduled
              </div>
              <Skeleton className="mt-[6px] h-[11px] w-[18px]" />
            </div>
            <div className="flex flex-col gap-[8px] px-[10px] py-[10px]">
              <Skeleton className="h-[28px] w-full" />
              <Skeleton className="h-[28px] w-[82%]" />
              <Skeleton className="h-[28px] w-[70%]" />
            </div>
          </div>
          {weekDays.map((day) => {
            const weekend = isWeekendIso(day);
            const isToday = day === today;
            const dayDate = parseIsoDate(day);
            const weekday = format(dayDate, "EEE").toUpperCase();

            return (
              <div
                key={day}
                data-week-col={day}
                className={cn(
                  "flex min-h-0 flex-col border-r border-hair",
                  isToday && "bg-[#f6f4f3]",
                  weekend && !isToday && "bg-[#f1efed]",
                )}
              >
                <div className="border-b border-hair px-[14px] py-[10px] text-left">
                  <div
                    className={cn(
                      "text-[10.5px] font-extrabold uppercase tracking-[0.14em]",
                      isToday
                        ? "text-primary"
                        : weekend
                          ? "text-ghost"
                          : "text-faint",
                    )}
                  >
                    {isToday ? `${weekday} · today` : weekday}
                  </div>
                  <div
                    className={cn(
                      "text-[16px] font-extrabold tabular-nums tracking-[-0.02em]",
                      weekend && !isToday && "text-ghost",
                    )}
                  >
                    {format(dayDate, "d")}
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  {BUCKETS.map((bucket, bucketIndex) => (
                    <div key={bucket} className="min-h-[28px] px-[12px] py-[6px]">
                      <div className="mb-[4px] text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                        {bucketLabel(bucket, isToday)}
                      </div>
                      <div className="flex flex-col gap-[8px]">
                        {Array.from(
                          { length: bucketIndex === 1 ? 2 : 1 },
                          (_, cardIndex) => (
                            <div
                              key={cardIndex}
                              className="border-l-2 border-hair px-[9px] py-[8px]"
                            >
                              <Skeleton
                                className={cn(
                                  "h-[12px]",
                                  CARD_WIDTHS[
                                    (bucketIndex + cardIndex) % CARD_WIDTHS.length
                                  ],
                                )}
                              />
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LoadingStatus>
  );
}
