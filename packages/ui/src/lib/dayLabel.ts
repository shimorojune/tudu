import { format } from "date-fns";

// Noon anchor keeps the arithmetic safe across DST boundaries, matching daySlice.
export function shiftIso(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return format(date, "yyyy-MM-dd");
}

export function dayDiff(selectedDate: string, today: string): number {
  const selected = new Date(`${selectedDate}T12:00:00`).getTime();
  const anchor = new Date(`${today}T12:00:00`).getTime();
  return Math.round((selected - anchor) / 86_400_000);
}

export function formatDayLine(iso: string): string {
  return format(new Date(`${iso}T12:00:00`), "EEE d MMM");
}

export function dayTabLabel(selectedDate: string, today: string): string {
  if (selectedDate === today) return "Today";
  if (selectedDate === shiftIso(today, 1)) return "Tomorrow";
  if (selectedDate === shiftIso(today, -1)) return "Yesterday";

  return formatDayLine(selectedDate);
}

export function dayTabSubLabel(selectedDate: string, today: string): string {
  if (selectedDate === today) {
    return formatDayLine(selectedDate);
  }
  if (
    selectedDate === shiftIso(today, 1) ||
    selectedDate === shiftIso(today, -1)
  ) {
    return formatDayLine(selectedDate);
  }
  const diff = dayDiff(selectedDate, today);
  if (diff > 0) {
    return diff === 1 ? "in 1 day" : `in ${diff} days`;
  }
  const abs = Math.abs(diff);
  return abs === 1 ? "1 day ago" : `${abs} days ago`;
}

export function dayArrowTooltip(iso: string): string {
  return formatDayLine(iso);
}
