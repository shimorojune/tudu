import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { effectiveDayIso } from "@tudu/shared";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  dayArrowTooltip,
  dayTabLabel,
  dayTabSubLabel,
  shiftIso,
} from "@/lib/dayLabel";
import { useScheduledDates } from "@/hooks/useScheduledDates";
import type { DayButton } from "react-day-picker";

type CoworkerDayStepperProps = {
  date: string;
};

function TaskDotDayButton({
  scheduledDates,
  ...props
}: React.ComponentProps<typeof DayButton> & { scheduledDates: Set<string> }) {
  const iso = format(props.day.date, "yyyy-MM-dd");
  const hasTask = scheduledDates.has(iso);
  return (
    <CalendarDayButton
      {...props}
      className={
        hasTask
          ? `${props.className ?? ""} after:absolute after:bottom-[3px] after:left-1/2 after:size-[4px] after:-translate-x-1/2 after:bg-primary after:content-['']`
          : props.className
      }
    />
  );
}

export function CoworkerDayStepper({ date }: CoworkerDayStepperProps) {
  const { orgSlug, userId } = useParams({ strict: false }) as {
    orgSlug: string;
    userId: string;
  };
  const navigate = useNavigate();
  const today = effectiveDayIso();
  const scheduledDates = useScheduledDates();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const primary = dayTabLabel(date, today);
  const secondary = dayTabSubLabel(date, today);
  const selected = parseISO(`${date}T12:00:00`);
  const showBackChip = date !== today;

  const calendarComponents = useMemo(
    () => ({
      DayButton: (props: React.ComponentProps<typeof DayButton>) => (
        <TaskDotDayButton scheduledDates={scheduledDates} {...props} />
      ),
    }),
    [scheduledDates],
  );

  function goToDate(iso: string) {
    void navigate({
      to: "/o/$orgSlug/coworkers/$userId",
      params: { orgSlug, userId },
      search: iso === today ? {} : { date: iso },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-[2px]">
        <button
          type="button"
          aria-label={`Previous day, ${dayArrowTooltip(shiftIso(date, -1))}`}
          className="grid size-[26px] place-items-center text-muted-foreground hover:bg-tint hover:text-foreground"
          onClick={() => goToDate(shiftIso(date, -1))}
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
        </button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-col items-start px-[4px] py-[2px] text-left hover:bg-tint"
            >
              <span className="text-[13px] font-bold leading-tight">{primary}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {secondary}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-auto border-t-2 border-t-foreground p-0"
          >
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(picked) => {
                if (!picked) {
                  return;
                }
                goToDate(format(picked, "yyyy-MM-dd"));
                setCalendarOpen(false);
              }}
              components={calendarComponents}
              classNames={{ day: "relative" }}
            />
            <div className="flex items-center justify-between border-t border-hair px-3 py-2">
              <button
                type="button"
                className="text-[12.5px] font-semibold text-primary-text hover:underline"
                onClick={() => {
                  goToDate(today);
                  setCalendarOpen(false);
                }}
              >
                Today
              </button>
              <span className="text-[11px] text-faint">⌘T</span>
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          aria-label={`Next day, ${dayArrowTooltip(shiftIso(date, 1))}`}
          className="grid size-[26px] place-items-center text-muted-foreground hover:bg-tint hover:text-foreground"
          onClick={() => goToDate(shiftIso(date, 1))}
        >
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
      </div>
      {showBackChip ? (
        <button
          type="button"
          className="border border-rule bg-card px-[8px] py-[4px] text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => goToDate(today)}
        >
          Back to today
        </button>
      ) : null}
    </div>
  );
}
