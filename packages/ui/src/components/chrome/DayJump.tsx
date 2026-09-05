import { setSelectedDate, todayIso } from "@tudu/store";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@tudu/store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function offsetIso(dayOffset: number) {
  const date = new Date(`${todayIso()}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const options = [
  { label: "Yesterday", value: offsetIso(-1) },
  { label: "Today", value: todayIso() },
  { label: "Tomorrow", value: offsetIso(1) },
] as const;

export function DayJump() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
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
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className="px-[9px] py-[6px] text-muted-foreground data-[state=on]:bg-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
