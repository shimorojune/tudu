import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftSelectedDate } from "@tudu/store";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@tudu/store";

export function DateNav() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const label = format(new Date(`${selectedDate}T12:00:00`), "EEE d MMM");

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
      <span className="text-[13.5px] font-semibold tabular-nums text-foreground">
        {label}
      </span>
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
