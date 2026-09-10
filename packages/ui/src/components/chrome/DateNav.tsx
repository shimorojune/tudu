import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftSelectedDate, setSelectedDate } from "@tudu/store";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@tudu/store";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DateNav() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const [open, setOpen] = useState(false);
  const label = format(new Date(`${selectedDate}T12:00:00`), "EEE d MMM");
  const selected = parseISO(`${selectedDate}T12:00:00`);

  return (
    <div className="flex items-center gap-[10px] text-muted-foreground">
      <button
        type="button"
        aria-label="Previous day"
        className="text-muted-foreground"
        onClick={() => dispatch(shiftSelectedDate(-1))}
      >
        <ChevronLeft size={14} strokeWidth={1.7} />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-[13.5px] font-semibold tabular-nums text-foreground hover:text-primary"
            aria-label="Pick a date"
          >
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) {
                return;
              }
              const iso = format(date, "yyyy-MM-dd");
              dispatch(setSelectedDate(iso));
              setOpen(false);
            }}
            classNames={{
              day: "rounded-none",
              day_button: "rounded-none",
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label="Next day"
        className="text-muted-foreground"
        onClick={() => dispatch(shiftSelectedDate(1))}
      >
        <ChevronRight size={14} strokeWidth={1.7} />
      </button>
    </div>
  );
}
