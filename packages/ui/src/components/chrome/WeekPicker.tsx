import { addWeeks, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  defaultWeekId,
  isoWeekId,
  parseIsoWeekId,
  weekPickerRows,
  weekRangeLabel,
} from "@/lib/week";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type WeekPickerProps = {
  weekId: string;
  weekDays: string[];
};

export function WeekPicker({ weekId, weekDays }: WeekPickerProps) {
  const navigate = useNavigate();
  const label = weekRangeLabel(weekDays[0], weekDays[6]);
  const pickerRows = weekPickerRows({ anchorWeekId: weekId });
  const monthLabel = format(parseIsoWeekId(weekId), "MMMM yyyy");

  function goToWeek(nextWeekId: string) {
    void navigate({ to: "/week", search: { week: nextWeekId } });
  }

  function shiftWeek(delta: number) {
    const monday = parseIsoWeekId(weekId);
    goToWeek(isoWeekId(addWeeks(monday, delta)));
  }

  return (
    <div className="relative flex items-center gap-[9px] text-muted-foreground">
      <button
        type="button"
        aria-label="Previous week"
        className="text-muted-foreground"
        onClick={() => shiftWeek(-1)}
      >
        <ChevronLeft size={14} strokeWidth={1.7} />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-[8px] border border-rule bg-card px-[10px] py-[5px] text-[13.5px] font-semibold tabular-nums text-foreground"
          >
            {label}
            <ChevronRight size={11} strokeWidth={2.4} className="rotate-90" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[232px] p-0">
          <div className="flex items-center justify-between border-b border-hair px-[12px] py-[8px]">
            <button
              type="button"
              aria-label="Earlier weeks"
              className="text-muted-foreground"
              onClick={() => shiftWeek(-1)}
            >
              <ChevronLeft size={13} strokeWidth={1.9} />
            </button>
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-foreground">
              {monthLabel}
            </span>
            <button
              type="button"
              aria-label="Later weeks"
              className="text-muted-foreground"
              onClick={() => shiftWeek(1)}
            >
              <ChevronRight size={13} strokeWidth={1.9} />
            </button>
          </div>
          {pickerRows.map((row) => {
            const selected = row.weekId === weekId;
            const weekNumber = row.weekId.split("-W")[1];
            return (
              <button
                key={row.weekId}
                type="button"
                className={cn(
                  "grid w-full grid-cols-[32px_minmax(0,1fr)_6px] items-center gap-[9px] px-[12px] py-[7px] text-left text-[12.5px]",
                  selected && "bg-[#f2efec] font-bold text-foreground",
                )}
                onClick={() => goToWeek(row.weekId)}
              >
                <span className="text-[10.5px] font-extrabold tabular-nums text-faint">
                  W{weekNumber}
                </span>
                <span className="tabular-nums">{row.label}</span>
                <span
                  className={cn(
                    "size-[5px]",
                    selected ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
          <button
            type="button"
            className="flex w-full items-center gap-[8px] border-t border-hair px-[12px] py-[9px] text-left text-[11px] text-faint"
            onClick={() => goToWeek(defaultWeekId())}
          >
            <span>Jump to this week</span>
            <span className="ml-auto font-mono text-[10px] text-faint">
              Cmd+Shift+W
            </span>
          </button>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label="Next week"
        className="text-muted-foreground"
        onClick={() => shiftWeek(1)}
      >
        <ChevronRight size={14} strokeWidth={1.7} />
      </button>
    </div>
  );
}
