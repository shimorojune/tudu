import {
  addWeeks,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
} from "date-fns";
import { effectiveDayIso } from "@tudu/shared";
import type { Bucket } from "@tudu/shared";
import { BUCKETS } from "@tudu/shared";

export const UNSCHEDULED_CONTAINER = "unscheduled";

const ISO_WEEK_RE = /^(\d{4})-W(\d{2})$/;

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function isoDateFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** ISO week id such as 2026-W36 for the Monday that starts the week containing `date`. */
export function isoWeekId(date: Date): string {
  const monday = startOfISOWeek(date);
  const year = getISOWeekYear(monday);
  const week = getISOWeek(monday);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function parseIsoWeekId(weekId: string): Date {
  const match = ISO_WEEK_RE.exec(weekId);
  if (!match) {
    throw new Error(`Invalid ISO week id: ${weekId}`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(year, 0, 4, 12, 0, 0);
  const weekOneMonday = startOfISOWeek(jan4);
  return addWeeks(weekOneMonday, week - 1);
}

export function defaultWeekId(now: Date = new Date()): string {
  return isoWeekId(parseIsoDate(effectiveDayIso(now)));
}

export function weekDaysFromWeekId(weekId: string): string[] {
  const monday = parseIsoWeekId(weekId);
  const days: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(monday);
    day.setDate(day.getDate() + offset);
    days.push(isoDateFromDate(day));
  }
  return days;
}

export function weekRangeLabel(startIso: string, endIso: string): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, "d")} to ${format(end, "d MMM")}`;
  }
  return `${format(start, "d MMM")} to ${format(end, "d MMM")}`;
}

export function weekContainersForDays(days: readonly string[]): string[] {
  const containers: string[] = [UNSCHEDULED_CONTAINER];
  for (const day of days) {
    for (const bucket of BUCKETS) {
      containers.push(containerForDayBucket(day, bucket));
    }
  }
  return containers;
}

export function containerForDayBucket(date: string, bucket: Bucket): string {
  return `${date}|${bucket}`;
}

export function parseDayBucketContainer(
  container: string,
): { date: string; bucket: Bucket } | null {
  if (container === UNSCHEDULED_CONTAINER) {
    return null;
  }
  const pipe = container.indexOf("|");
  if (pipe < 0) {
    return null;
  }
  const date = container.slice(0, pipe);
  const bucket = container.slice(pipe + 1) as Bucket;
  if (!BUCKETS.includes(bucket)) {
    return null;
  }
  return { date, bucket };
}

export function dayFromContainer(container: string): string | null {
  return parseDayBucketContainer(container)?.date ?? null;
}

export function isWeekendIso(iso: string): boolean {
  const day = parseIsoDate(iso).getDay();
  return day === 0 || day === 6;
}

export function weekPickerRows(args: {
  anchorWeekId: string;
  count?: number;
}): { weekId: string; label: string }[] {
  const count = args.count ?? 5;
  const anchorMonday = parseIsoWeekId(args.anchorWeekId);
  const rows: { weekId: string; label: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    const monday = addWeeks(anchorMonday, index);
    const days = weekDaysFromWeekId(isoWeekId(monday));
    rows.push({
      weekId: isoWeekId(monday),
      label: weekRangeLabel(days[0], days[6]),
    });
  }
  return rows;
}

export function defaultHighlightDay(
  weekDays: readonly string[],
  today: string = effectiveDayIso(),
): string {
  if (weekDays.includes(today)) {
    return today;
  }
  return weekDays[0] ?? today;
}
