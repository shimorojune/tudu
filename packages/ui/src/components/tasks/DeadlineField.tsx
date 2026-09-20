import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { QuickAddCalendarPlacement } from "@/lib/quickAddCalendarPlacement";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bindQuickAddPopoverOpenChange } from "@/lib/quickAddPopoverOpen";
import { cn } from "@/lib/utils";

export type DeadlineFieldProps = {
  value: string | null;
  onChange: (iso: string | null) => void;
  allowClear?: boolean;
  "aria-label"?: string;
  className?: string;
  triggerClassName?: string;
  compactTriggerLabel?: string;
  popoverSide?: "top" | "bottom";
  popoverAlign?: "start" | "center" | "end";
  quickAddShell?: boolean;
  leadingIcon?: ReactNode;
  disabled?: boolean;
};

function splitDeadline(value: string | null): {
  dateIso: string;
  time: string;
} {
  if (!value) {
    return { dateIso: "", time: "18:00" };
  }
  const parsed = parseISO(value);
  const dateIso = format(parsed, "yyyy-MM-dd");
  const time = format(parsed, "HH:mm");
  return { dateIso, time };
}

function mergeDeadline(dateIso: string, time: string): string {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const [year, month, day] = dateIso.split("-").map((part) => Number(part));
  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return local.toISOString();
}

export function DeadlineField({
  value,
  onChange,
  allowClear = true,
  "aria-label": ariaLabel = "Pick a deadline",
  className,
  popoverSide = "bottom",
  popoverAlign = "start",
  triggerClassName,
  compactTriggerLabel,
  quickAddShell = false,
  leadingIcon,
  disabled = false,
}: DeadlineFieldProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [quickAddPlacement, setQuickAddPlacement] =
    useState<QuickAddCalendarPlacement | null>(null);
  const handleOpenChange = bindQuickAddPopoverOpenChange(quickAddShell, setOpen, {
    variant: "deadline",
    getTrigger: () => triggerRef.current,
    onPlacement: setQuickAddPlacement,
  });
  const resolvedSide = quickAddShell
    ? (quickAddPlacement?.side ?? popoverSide)
    : popoverSide;
  const resolvedAlign = quickAddShell
    ? (quickAddPlacement?.align ?? popoverAlign)
    : popoverAlign;
  const quickAddPopoverClass = quickAddShell
    ? "z-[200] w-auto max-w-[calc(100vw-16px)] p-0 [--cell-size:1.75rem]"
    : "z-[200] w-auto p-0 [--cell-size:2rem]";
  const { dateIso, time } = splitDeadline(value);
  const selected = dateIso ? parseISO(`${dateIso}T12:00:00`) : undefined;
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const [timeValue, setTimeValue] = useState(time);

  useEffect(() => {
    setTimeValue(splitDeadline(value).time);
  }, [value]);

  useEffect(() => {
    if (selected) {
      setMonth(selected);
    }
  }, [dateIso]);

  const label =
    compactTriggerLabel ??
    (value ? format(parseISO(value), "EEE d MMM, HH:mm") : "No deadline");

  return (
    <div className={cn("flex min-w-0 gap-[6px]", className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              "min-w-0 flex-1 border border-rule bg-card px-[11px] py-[9px] text-left text-[13.5px] tabular-nums outline-none",
              !value && !compactTriggerLabel && "text-muted-foreground",
              !value && compactTriggerLabel && "text-muted-foreground",
              triggerClassName,
              disabled && "opacity-50",
            )}
          >
            {leadingIcon}
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align={resolvedAlign}
          side={resolvedSide}
          sideOffset={6}
          collisionPadding={quickAddShell ? 12 : 8}
          className={quickAddPopoverClass}
        >
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(date) => {
              if (!date) {
                if (allowClear) {
                  onChange(null);
                }
                return;
              }
              const nextDate = format(date, "yyyy-MM-dd");
              onChange(mergeDeadline(nextDate, timeValue));
            }}
            classNames={{
              day: "rounded-none",
              day_button: "rounded-none",
            }}
          />
          <div className="flex items-center gap-[8px] border-t border-hair px-[12px] py-[8px]">
            <span className="text-[12px] text-muted-foreground">Time</span>
            <input
              type="time"
              value={timeValue}
              className="border border-rule bg-card px-[8px] py-[4px] text-[12px] tabular-nums"
              onChange={(event) => {
                const nextTime = event.target.value;
                setTimeValue(nextTime);
                if (dateIso) {
                  onChange(mergeDeadline(dateIso, nextTime));
                }
              }}
            />
          </div>
          {allowClear && value ? (
            <button
              type="button"
              className="w-full border-t border-hair px-[12px] py-[8px] text-left text-[12.5px] text-muted-foreground"
              onClick={() => {
                onChange(null);
                handleOpenChange(false);
              }}
            >
              Clear
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
