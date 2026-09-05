import { format } from "date-fns";

// Noon anchor keeps the arithmetic safe across DST boundaries, matching daySlice.
function shiftIso(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return format(date, "yyyy-MM-dd");
}

export function dayTabLabel(selectedDate: string, today: string): string {
  if (selectedDate === today) return "Today";
  if (selectedDate === shiftIso(today, 1)) return "Tomorrow";
  if (selectedDate === shiftIso(today, -1)) return "Yesterday";

  return format(new Date(`${selectedDate}T12:00:00`), "EEE d MMM");
}
