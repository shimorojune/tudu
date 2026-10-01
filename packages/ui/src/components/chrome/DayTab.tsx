import type { ComponentProps } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@tudu/store";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateLinkSearch } from "@/lib/daySearch";
import {
  dayArrowTooltip,
  dayTabLabel,
  dayTabSubLabel,
  shiftIso,
} from "@/lib/dayLabel";
import { useNavigateDay } from "@/hooks/useNavigateDay";
import { useScheduledDates } from "@/hooks/useScheduledDates";
import type { DayButton } from "react-day-picker";
import { cn } from "@/lib/utils";

type DayTabProps = {
  to: string;
  exact: boolean;
  orgSlug?: string;
};

function isDayTabRouteActive(pathname: string, to: string): boolean {
  return pathname === to;
}

type TaskDotDayButtonProps = ComponentProps<typeof DayButton> & {
  scheduledDates: Set<string>;
};

function TaskDotDayButton({
  scheduledDates,
  day,
  modifiers,
  ...props
}: TaskDotDayButtonProps) {
  const iso = format(day.date, "yyyy-MM-dd");
  const hasTask = scheduledDates.has(iso);

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      {...props}
      className={
        hasTask
          ? `${props.className ?? ""} after:absolute after:bottom-[3px] after:left-1/2 after:size-[4px] after:-translate-x-1/2 after:bg-primary after:content-['']`
          : props.className
      }
    />
  );
}

export function DayTab({ to, exact, orgSlug }: DayTabProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const { backToToday, goToDate, shiftDay, today } = useNavigateDay();
  const scheduledDates = useScheduledDates();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const linkRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  const isActive = isDayTabRouteActive(pathname, to);
  const primary = dayTabLabel(selectedDate, today);
  const secondary = dayTabSubLabel(selectedDate, today);
  const showBackChip = selectedDate !== today;
  const prevIso = shiftIso(selectedDate, -1);
  const nextIso = shiftIso(selectedDate, 1);
  const selected = parseISO(`${selectedDate}T12:00:00`);

  const calendarComponents = useMemo(
    () => ({
      DayButton: (props: ComponentProps<typeof DayButton>) => (
        <TaskDotDayButton scheduledDates={scheduledDates} {...props} />
      ),
    }),
    [scheduledDates],
  );

  useLayoutEffect(() => {
    const node = linkRef.current;
    if (!node) {
      return;
    }
    const sync = () => setWidth(node.getBoundingClientRect().width);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isActive, primary, secondary, showBackChip]);

  const dateLabel = (
    <>
      <span className="text-[13.5px] font-bold leading-tight">{primary}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">
        {secondary}
      </span>
    </>
  );

  return (
    <span
      className="inline-flex overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none"
      style={{ width }}
    >
      <span
        ref={linkRef}
        className={cn(
          "group flex shrink-0 items-center gap-[2px] px-px py-[10px]",
          isActive
            ? "is-active text-foreground shadow-[inset_0_-2px_0_var(--foreground)]"
            : "text-muted-foreground",
        )}
      >
        <button
          type="button"
          disabled={!isActive}
          aria-label={`Previous day, ${dayArrowTooltip(prevIso)}`}
          title={isActive ? "Previous day  ⌘←" : undefined}
          className={cn(
            "grid size-[26px] place-items-center text-muted-foreground",
            isActive && "hover:bg-tint hover:text-foreground",
            !isActive && "cursor-not-allowed opacity-40",
          )}
          onClick={() => {
            if (isActive) {
              shiftDay(-1);
            }
          }}
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
        </button>
        {isActive ? (
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${primary}, ${secondary}. Pick a date`}
                className="flex min-w-0 flex-col items-center px-[6px] py-[2px] text-center hover:bg-tint"
              >
                {dateLabel}
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
                onSelect={(date) => {
                  if (!date) {
                    return;
                  }
                  goToDate(format(date, "yyyy-MM-dd"));
                  setCalendarOpen(false);
                }}
                components={calendarComponents}
                classNames={{
                  day: "relative",
                  day_button: "",
                }}
              />
              <div className="flex items-center justify-between border-t border-hair px-3 py-2">
                <button
                  type="button"
                  className="text-[12.5px] font-semibold text-primary-text hover:underline"
                  onClick={() => {
                    backToToday();
                    setCalendarOpen(false);
                  }}
                >
                  Today
                </button>
                <span className="text-[11px] text-faint">⌘T</span>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Link
            to={to}
            params={orgSlug ? { orgSlug } : undefined}
            search={dateLinkSearch(selectedDate)}
            activeOptions={
              exact ? { exact: true, includeSearch: false } : { includeSearch: false }
            }
            className="flex min-w-0 flex-col items-center px-[6px] py-[2px] text-center hover:bg-tint"
            aria-label={`${primary}, ${secondary}. Go to Today`}
          >
            {dateLabel}
          </Link>
        )}
        <button
          type="button"
          disabled={!isActive}
          aria-label={`Next day, ${dayArrowTooltip(nextIso)}`}
          title={isActive ? "Next day  ⌘→" : undefined}
          className={cn(
            "grid size-[26px] place-items-center text-muted-foreground",
            isActive && "hover:bg-tint hover:text-foreground",
            !isActive && "cursor-not-allowed opacity-40",
          )}
          onClick={() => {
            if (isActive) {
              shiftDay(1);
            }
          }}
        >
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
        {showBackChip ? (
          <button
            type="button"
            disabled={!isActive}
            className={cn(
              "ml-[6px] border border-rule bg-card px-[8px] py-[4px] text-[11.5px] font-semibold text-muted-foreground",
              isActive && "hover:text-foreground",
              !isActive && "cursor-not-allowed opacity-40",
            )}
            onClick={() => {
              if (isActive) {
                backToToday();
              }
            }}
          >
            Back to today
          </button>
        ) : null}
      </span>
    </span>
  );
}
