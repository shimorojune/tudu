/**
 * Dates in Tudu are plain calendar days written as ISO strings ("2026-10-19"). No time zones, no clocks:
 * a task is planned for a day, and "today" is whatever day the client says it is. Everything here is pure.
 */

/** A calendar day as YYYY-MM-DD. */
export type IsoDate = string;

export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function assertIso(iso: string): void {
  if (!isIsoDate(iso)) throw new RangeError(`Not a calendar day: ${JSON.stringify(iso)}`);
}

/** Split an ISO day into its parts. */
export function partsOf(iso: IsoDate): { year: number; month: number; day: number } {
  assertIso(iso);
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

export function toIso(year: number, month: number, day: number): IsoDate {
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The ISO day of a Date in the machine's local time zone (what the person's calendar says). */
export function isoOfDate(date: Date): IsoDate {
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Today's ISO day, from the given clock (defaults to the real one). */
export function isoToday(now: Date = new Date()): IsoDate {
  return isoOfDate(now);
}

function utcMs(iso: IsoDate): number {
  const { year, month, day } = partsOf(iso);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const { year, month, day } = partsOf(iso);
  return toIso(year, month, day + n);
}

/** Days from `from` to `to`: positive when `to` is later. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(iso: IsoDate): number {
  return new Date(utcMs(iso)).getUTCDay();
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "Monday" */
export function weekdayName(iso: IsoDate): string {
  return WEEKDAYS_LONG[weekdayOf(iso)]!;
}

/** "19 October" */
export function dateLabel(iso: IsoDate): string {
  const { month, day } = partsOf(iso);
  return `${day} ${MONTHS_LONG[month - 1]}`;
}

/** "19 Oct" */
export function dateShort(iso: IsoDate): string {
  const { month, day } = partsOf(iso);
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

/** "Mon 19 Oct" */
export function formatDay(iso: IsoDate): string {
  const { month, day } = partsOf(iso);
  return `${WEEKDAYS_SHORT[weekdayOf(iso)]} ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** "Monday 19 October" */
export function formatLong(iso: IsoDate): string {
  return `${weekdayName(iso)} ${dateLabel(iso)}`;
}

/** "Today", "Tomorrow", "Yesterday", "In 3 days", "3 days ago". */
export function relativeDayLabel(iso: IsoDate, today: IsoDate): string {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

export type DueTone = 'today' | 'overdue' | '';

/**
 * How far a due date is from today, in words: "today", "tomorrow", "in 4 days", "in 3 weeks",
 * "1 day overdue", "2 weeks overdue". Two weeks and beyond are said in weeks.
 */
export function dueDistance(iso: IsoDate, today: IsoDate): { text: string; tone: DueTone } {
  const n = diffDays(today, iso);
  const a = Math.abs(n);
  if (n === 0) return { text: 'today', tone: 'today' };
  if (n === 1) return { text: 'tomorrow', tone: '' };
  const span = a >= 14 ? `${Math.round(a / 7)} weeks` : `${a} ${a === 1 ? 'day' : 'days'}`;
  return n > 0 ? { text: `in ${span}`, tone: '' } : { text: `${span} overdue`, tone: 'overdue' };
}

/** ISO 8601 week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeekNumber(iso: IsoDate): number {
  const t = new Date(utcMs(iso));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** The year the ISO week belongs to (31 Dec can be week 1 of the next year). */
export function isoWeekYear(iso: IsoDate): number {
  const t = new Date(utcMs(iso));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  return t.getUTCFullYear();
}

/** The Monday of the week holding `iso`. */
export function mondayOf(iso: IsoDate): IsoDate {
  const dow = weekdayOf(iso) || 7;
  return addDays(iso, 1 - dow);
}

/** Monday to Sunday of the week holding `iso`. */
export function weekRange(iso: IsoDate): { monday: IsoDate; sunday: IsoDate } {
  const monday = mondayOf(iso);
  return { monday, sunday: addDays(monday, 6) };
}

/** The seven days of the week holding `iso`, Monday first. */
export function weekDays(iso: IsoDate): IsoDate[] {
  const monday = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The eyebrow over a day: "Today · Week 42", "Tomorrow · Week 43", "In 3 days · Week 43". */
export function dayEyebrow(iso: IsoDate, today: IsoDate): string {
  return `${relativeDayLabel(iso, today)} · Week ${isoWeekNumber(iso)}`;
}

/** The heading of a day sheet. */
export function dayHeading(
  iso: IsoDate,
  today: IsoDate,
): { eyebrow: string; day: string; date: string; isToday: boolean } {
  return {
    eyebrow: dayEyebrow(iso, today),
    day: weekdayName(iso),
    date: dateLabel(iso),
    isToday: iso === today,
  };
}

/** How many days are in a month (1 to 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
