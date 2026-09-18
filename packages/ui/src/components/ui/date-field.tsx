import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DateFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  allowClear?: boolean;
  id?: string;
  "aria-label"?: string;
  labelPrefix?: string;
  className?: string;
  /** Prefer top in tight shells (Quick Add) so the grid is not clipped. */
  popoverSide?: "top" | "bottom";
  popoverAlign?: "start" | "center" | "end";
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
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(`${value}T12:00:00`) : undefined;
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());

  useEffect(() => {
    if (selected) {
      setMonth(selected);
    }
  }, [value]);

  const label = value
    ? format(new Date(`${value}T12:00:00`), "EEE d MMM")
    : "Pick a date";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
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
        align={popoverAlign}
        side={popoverSide}
        sideOffset={6}
        collisionPadding={8}
        className="z-[200] w-auto p-0 [--cell-size:2rem]"
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
            setOpen(false);
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
              setOpen(false);
            }}
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
