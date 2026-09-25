import { effectiveDayIso } from "@tudu/shared";
import { setSelectedDate } from "@tudu/store";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@tudu/store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLogicalDayClock } from "@/hooks/useLogicalDayClock";
import { logicalDayJumpOptions } from "@/lib/logicalDayOptions";

export function DayJump() {
  useLogicalDayClock();
  const dispatch = useDispatch();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const effectiveToday = effectiveDayIso();
  const options = useMemo(
    () => logicalDayJumpOptions(effectiveToday),
    [effectiveToday],
  );
  const activeValue = options.some((option) => option.value === selectedDate)
    ? selectedDate
    : "";

  return (
    <ToggleGroup
      type="single"
      value={activeValue}
      onValueChange={(value) => {
        if (value) {
          dispatch(setSelectedDate(value));
        }
      }}
      className="flex items-stretch border border-rule bg-card text-[11.5px] font-bold leading-none"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.label}
          value={option.value}
          aria-label={option.label}
          className="px-[9px] py-[6px] text-muted-foreground data-[state=on]:bg-foreground data-[state=on]:text-card"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
