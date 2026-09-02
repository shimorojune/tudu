import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function formatShortDate(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function relativeDayLabel(dateStr: string) {
  const today = todayStr();
  const yesterday = offsetDateStr(-1);
  const twoDaysAgo = offsetDateStr(-2);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  if (dateStr === twoDaysAgo) return "2 days ago";
  return formatShortDate(dateStr);
}

export function offsetDateStr(dayOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}
