import { format } from "date-fns";

export function offsetLogicalDay(effectiveToday: string, dayOffset: number): string {
  const date = new Date(`${effectiveToday}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  return format(date, "yyyy-MM-dd");
}

export function logicalDayJumpOptions(effectiveToday: string) {
  return [
    { label: "Yesterday", value: offsetLogicalDay(effectiveToday, -1) },
    { label: "Today", value: effectiveToday },
    { label: "Tomorrow", value: offsetLogicalDay(effectiveToday, 1) },
  ] as const;
}
