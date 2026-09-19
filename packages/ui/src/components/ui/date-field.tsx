import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";
import type { QuickAddCalendarPlacement } from "@/lib/quickAddCalendarPlacement";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bindQuickAddPopoverOpenChange } from "@/lib/quickAddPopoverOpen";
import { cn } from "@/lib/utils";

export type DateFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  allowClear?: boolean;
  id?: string;
  "aria-label"?: string;
  labelPrefix?: string;
  className?: string;
  popoverSide?: "top" | "bottom";
  popoverAlign?: "start" | "center" | "end";
  emptyLabel?: string;
  /** Tauri Quick Add: grow webview before open; popover opens below trigger. */
  quickAddShell?: boolean;
};

export function DateField({
  value,
  onChange,
  allowClear = true,
  id,
  "aria-label": ariaLabel = "Pick a date",
  labelPrefix,
  className,
  popoverSide = "bottom",
  popoverAlign = "start",
  emptyLabel = "Pick a date",
  quickAddShell = false,
}: DateFieldProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [quickAddPlacement, setQuickAddPlacement] =
    useState<QuickAddCalendarPlacement | null>(null);
  const handleOpenChange = bindQuickAddPopoverOpenChange(quickAddShell, setOpen, {
    variant: "date",
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
  const selected = value ? parseISO(`${value}T12:00:00`) : undefined;
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());

  useEffect(() => {
    if (selected) {
      setMonth(selected);
    }
  }, [value]);

  const label = value
    ? format(new Date(`${value}T12:00:00`), "EEE d MMM")
    : emptyLabel;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "w-full border border-rule bg-card px-[11px] py-[9px] text-left text-[13.5px] tabular-nums outline-none",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {labelPrefix ? `${labelPrefix}${label}` : label}
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
                onChange("");
              }
              return;
            }
            onChange(format(date, "yyyy-MM-dd"));
            handleOpenChange(false);
          }}
          classNames={{
            day: "rounded-none",
            day_button: "rounded-none",
          }}
        />
        {allowClear && value ? (
          <button
            type="button"
            className="w-full border-t border-hair px-[12px] py-[8px] text-left text-[12.5px] text-muted-foreground"
            onClick={() => {
              onChange("");
              handleOpenChange(false);
            }}
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
