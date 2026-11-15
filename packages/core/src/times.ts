import {
  addDays,
  diffDays,
  formatDay,
  MONTHS_SHORT,
  partsOf,
  WEEKDAYS_SHORT,
  weekdayOf,
  type IsoDate,
} from './dates';
import { minutesOf, timeOf } from './hours';

/**
 * Times on Planned and Due (docs/plans/task-times.md). A time is a wall-clock "HH:MM", like a day is an ISO day:
 * no time zone. Planned has a block (a start and an end); Due has one moment. A planned task can span several days
 * (`until`, the last day); its end time is on the last day.
 */
export type Clock = string;

/** A planned block: the start on the first day, the end on the same day (or on the last day of a span). */
export interface TimeBlock {
  start: Clock;
  end: Clock;
}

/** The longest span: a month of days. */
export const SPAN_MAX_DAYS = 31;

/** 12-hour words unless the system says 24-hour. */
export interface TimeWordsOptions {
  hour24?: boolean;
}

function parts(t: Clock): { h: number; m: number } {
  const n = minutesOf(t) ?? 0;
  return { h: Math.floor(n / 60), m: n % 60 };
}

const meridiem = (h: number) => (h < 12 ? 'AM' : 'PM');
const h12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/** "3 PM", "3:30 PM", "12 AM"; 24-hour "15:00". */
export function fmtTime(t: Clock, o: TimeWordsOptions = {}): string {
  if (o.hour24) return t;
  const { h, m } = parts(t);
  return `${h12(h)}${m ? ':' + String(m).padStart(2, '0') : ''} ${meridiem(h)}`;
}

/** "3 to 4 PM", "11 AM to 1 PM", "9:30 to 10 AM"; 24-hour "15:00–16:00". */
export function fmtBlock(b: TimeBlock, o: TimeWordsOptions = {}): string {
  if (o.hour24) return `${b.start}–${b.end}`;
  const s = parts(b.start);
  const e = parts(b.end);
  const same = meridiem(s.h) === meridiem(e.h);
  const left = same ? `${h12(s.h)}${s.m ? ':' + String(s.m).padStart(2, '0') : ''}` : fmtTime(b.start);
  return `${left} to ${fmtTime(b.end)}`;
}

/** Minutes since midnight of a Date, on the wall clock. */
export function clockOf(now: Date): Clock {
  return timeOf(now.getHours() * 60 + now.getMinutes());
}

/** "Add a time" fills the next full hour: 14:10 → 15:00; never past 23:00. */
export function nextFullHour(now: Date): Clock {
  const m = now.getHours() * 60 + now.getMinutes();
  return timeOf(Math.min(23 * 60, (Math.floor(m / 60) + 1) * 60));
}

/** The default block from a start: an hour long, kept inside the day. */
export function blockFrom(start: Clock, mins = 60): TimeBlock {
  const s = minutesOf(start) ?? 0;
  return { start, end: timeOf(Math.min(23 * 60 + 59, s + Math.max(5, mins))) };
}

/** Minutes in a one-day block (end after start). */
export function blockMinutes(b: TimeBlock): number {
  return (minutesOf(b.end) ?? 0) - (minutesOf(b.start) ?? 0);
}

/** Whether a block on one day is valid: both real times, the end after the start. */
export function blockOk(b: TimeBlock | null | undefined, span = false): boolean {
  if (!b) return true;
  const s = minutesOf(b.start);
  const e = minutesOf(b.end);
  if (s === null || e === null) return false;
  return span || e > s;
}

/** True once `day` at `at` has come, by the wall clock `now`. */
export function isPast(day: IsoDate, at: Clock, now: Date): boolean {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (day !== today) return day < today;
  return (minutesOf(at) ?? 0) <= now.getHours() * 60 + now.getMinutes();
}

/** The Date of a wall-clock day and time, in this computer's zone. */
export function dateAt(day: IsoDate, at: Clock): Date {
  const { year, month, day: d } = partsOf(day);
  const { h, m } = parts(at);
  return new Date(year, month - 1, d, h, m, 0, 0);
}

// ---- Spans: a planned task over several days ----

/** Where `day` falls in a span: the nth of `of` days; null outside it or for a one-day task. */
export interface SpanPlace {
  from: IsoDate;
  until: IsoDate;
  n: number;
  of: number;
  /** The day shown is today's date (set when spanOf is given today): its row reads in full, never tinted (#116). */
  today?: boolean;
}

/** Whether a task planned `from` (to `until`) is on `day`. */
export function onDay(from: IsoDate | null, until: IsoDate | null | undefined, day: IsoDate | null): boolean {
  if (from === null || day === null) return from === day;
  if (!until || until <= from) return from === day;
  return day >= from && day <= until;
}

export function spanOf(
  from: IsoDate | null,
  until: IsoDate | null | undefined,
  day: IsoDate | null,
  today?: IsoDate,
): SpanPlace | null {
  if (!from || !until || until <= from || !day || day < from || day > until) return null;
  const place: SpanPlace = { from, until, n: diffDays(from, day) + 1, of: diffDays(from, until) + 1 };
  if (today !== undefined) place.today = day === today;
  return place;
}

/** Days in a span, counting both ends: Sun 18 to Wed 21 is 4. */
export function spanDays(from: IsoDate, until: IsoDate): number {
  return diffDays(from, until) + 1;
}

/** Every day of a span, first to last (a one-day task: its day). At most SPAN_MAX_DAYS. */
export function spanList(from: IsoDate, until: IsoDate | null | undefined): IsoDate[] {
  if (!until || until <= from) return [from];
  const n = Math.min(SPAN_MAX_DAYS, spanDays(from, until));
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}

/** A span moved to start on `to`, keeping its length. */
export function moveSpan(from: IsoDate, until: IsoDate, to: IsoDate): { day: IsoDate; until: IsoDate } {
  return { day: to, until: addDays(to, diffDays(from, until)) };
}

/** "Sun 18 to Wed 21 Oct"; across months "Sat 31 Oct to Mon 2 Nov". */
export function spanWords(from: IsoDate, until: IsoDate): string {
  const a = partsOf(from);
  const z = partsOf(until);
  const left =
    a.month === z.month && a.year === z.year
      ? `${WEEKDAYS_SHORT[weekdayOf(from)]} ${a.day}`
      : formatDay(from);
  return `${left} to ${WEEKDAYS_SHORT[weekdayOf(until)]} ${z.day} ${MONTHS_SHORT[z.month - 1]}`;
}

/** The time words of a span's day: "from 10 AM" on the first, "until 5 PM" on the last, nothing between. */
export function spanTimeWords(time: TimeBlock | null, place: SpanPlace, o: TimeWordsOptions = {}): string {
  if (!time) return '';
  if (place.n === 1) return `from ${fmtTime(time.start, o)}`;
  if (place.n === place.of) return `until ${fmtTime(time.end, o)}`;
  return '';
}

/** The row's pill for a span's day: "Day 2 of 4 · until 5 PM"; brief rows "2/4". */
export function spanPill(
  time: TimeBlock | null,
  place: SpanPlace,
  brief = false,
  o: TimeWordsOptions = {},
): string {
  if (brief) return `${place.n}/${place.of}`;
  const w = spanTimeWords(time, place, o);
  return `Day ${place.n} of ${place.of}${w ? ' · ' + w : ''}`;
}

/** The planned fact with a span: "Sun 18, 4 PM to Wed 21 Oct, 6 PM", or without a time "Sun 18 to Wed 21 Oct". */
export function spanFact(
  from: IsoDate,
  until: IsoDate,
  time: TimeBlock | null,
  o: TimeWordsOptions = {},
): string {
  if (!time) return spanWords(from, until);
  const a = partsOf(from);
  const z = partsOf(until);
  const left = a.month === z.month ? `${WEEKDAYS_SHORT[weekdayOf(from)]} ${a.day}` : formatDay(from);
  return `${left}, ${fmtTime(time.start, o)} to ${formatDay(until)}, ${fmtTime(time.end, o)}`;
}

/** Where a task without a place of its own sits on a later day of its span: at the top, above the day's own tasks. */
export const SPAN_TOP = Number.MIN_SAFE_INTEGER / 2;

/**
 * A task's position on `day`: its own position on its first day (or a one-day task's day); on a later day of a span,
 * the place it was moved to there, else the top.
 */
export function placeOn(
  t: { day: IsoDate | null; position: number; places?: Record<IsoDate, number> },
  day: IsoDate | null,
): number {
  if (day === null || t.day === day) return t.position;
  return t.places?.[day] ?? SPAN_TOP;
}

/** The order of a day's list: by place on that day, then the older task first. */
export function byPlaceOn<
  T extends { day: IsoDate | null; position: number; places?: Record<IsoDate, number>; createdAt: string },
>(day: IsoDate | null): (a: T, b: T) => number {
  return (a, b) => placeOn(a, day) - placeOn(b, day) || a.createdAt.localeCompare(b.createdAt);
}
