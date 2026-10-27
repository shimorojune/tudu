import { addDays, weekdayOf, type IsoDate } from './dates';

/**
 * Working hours: the days you work and, for each, one stretch from a start to an end. Times are the device's local
 * clock written "HH:MM" (24 hours); days are 1 = Monday ... 7 = Sunday. Kept on your account (`user.work_hours`).
 */
export interface WorkDay {
  day: number;
  start: string;
  end: string;
}

export interface WorkHours {
  days: WorkDay[];
  /** One stretch for every working day (true), or hours set per day (false): Settings shows what you picked. */
  same: boolean;
}

/** What a new account starts with: Monday to Friday, 09:00 to 18:00. */
export const DEFAULT_HOURS: WorkHours = {
  days: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' })),
  same: true,
};

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "09:00" → 540; anything that is not a real 24-hour time → null. */
export function minutesOf(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 540 → "09:00". */
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Monday = 1 ... Sunday = 7, for an ISO day. */
export function workDayOf(iso: IsoDate): number {
  return ((weekdayOf(iso) + 6) % 7) + 1;
}

export type HoursProblem = 'no-days' | 'end-before-start' | 'bad-time' | 'bad-shape';

/** Why a value can't be saved, in the words Settings shows. */
export const HOURS_PROBLEM_WORDS: Record<HoursProblem, string> = {
  'no-days': 'Pick at least one day.',
  'end-before-start': 'The end needs to be after the start.',
  'bad-time': 'Times are written like 09:00.',
  'bad-shape': 'Send { days: [{ day, start, end }], same }.',
};

/**
 * Reads a stored or sent value: `{ ok: true, hours }` with the days in order, or the first reason it can't be kept.
 * Refuses unknown keys, a day twice, a day outside 1..7, a time that isn't HH:MM, and an end not after its start.
 */
export function parseWorkHours(
  raw: unknown,
): { ok: true; hours: WorkHours } | { ok: false; problem: HoursProblem } {
  const bad = (problem: HoursProblem) => ({ ok: false as const, problem });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('bad-shape');
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'days' && k !== 'same')) return bad('bad-shape');
  if (!Array.isArray(o.days) || typeof o.same !== 'boolean') return bad('bad-shape');
  if (!o.days.length) return bad('no-days');
  const seen = new Set<number>();
  const days: WorkDay[] = [];
  for (const d of o.days as unknown[]) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return bad('bad-shape');
    const e = d as Record<string, unknown>;
    if (Object.keys(e).some((k) => k !== 'day' && k !== 'start' && k !== 'end')) return bad('bad-shape');
    if (typeof e.day !== 'number' || !Number.isInteger(e.day) || e.day < 1 || e.day > 7 || seen.has(e.day))
      return bad('bad-shape');
    if (typeof e.start !== 'string' || typeof e.end !== 'string') return bad('bad-time');
    const start = minutesOf(e.start);
    const end = minutesOf(e.end);
    if (start === null || end === null) return bad('bad-time');
    if (end <= start) return bad('end-before-start');
    seen.add(e.day);
    days.push({ day: e.day, start: e.start, end: e.end });
  }
  days.sort((a, b) => a.day - b.day);
  return { ok: true, hours: { days, same: o.same } };
}

/** Your hours for a stored value: the default when nothing (or something unreadable) is kept. */
export function workHoursOf(stored: unknown): WorkHours {
  if (stored == null) return DEFAULT_HOURS;
  const r = parseWorkHours(stored);
  return r.ok ? r.hours : DEFAULT_HOURS;
}

/** The stretch for an ISO day, or null on a day off. */
export function hoursOn(hours: WorkHours, iso: IsoDate): { start: number; end: number } | null {
  const d = hours.days.find((x) => x.day === workDayOf(iso));
  return d ? { start: minutesOf(d.start)!, end: minutesOf(d.end)! } : null;
}

/** The next working day after `iso` (within a week), or null if there is none. */
export function nextWorkDay(hours: WorkHours, iso: IsoDate): IsoDate | null {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(iso, i);
    if (hoursOn(hours, d)) return d;
  }
  return null;
}

/** Runs of consecutive days ("Mon to Fri", "Mon, Wed", "Every day"). */
function daysWords(days: number[]): string {
  if (days.length === 7) return 'Every day';
  const runs: Array<[number, number]> = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else runs.push([d, d]);
  }
  return runs
    .map(([a, b]) =>
      a === b
        ? DAY_SHORT[a - 1]
        : b === a + 1
          ? `${DAY_SHORT[a - 1]}, ${DAY_SHORT[b - 1]}`
          : `${DAY_SHORT[a - 1]} to ${DAY_SHORT[b - 1]}`,
    )
    .join(', ');
}

/**
 * The nav row's sub-line: "Mon to Fri, 09:00 to 18:00" when every day has the same stretch, otherwise each group of
 * days that share one ("Mon to Thu 09:00 to 18:00, Fri 09:00 to 14:00").
 */
export function hoursLine(hours: WorkHours): string {
  const groups: Array<{ days: number[]; start: string; end: string }> = [];
  for (const d of hours.days) {
    const g = groups.find((x) => x.start === d.start && x.end === d.end);
    if (g) g.days.push(d.day);
    else groups.push({ days: [d.day], start: d.start, end: d.end });
  }
  if (groups.length === 1) {
    const g = groups[0]!;
    return `${daysWords(g.days)}, ${g.start} to ${g.end}`;
  }
  return groups.map((g) => `${daysWords(g.days)} ${g.start} to ${g.end}`).join(', ');
}

/** The live stream's word that something on your own account changed (your hours): read `/api/me` again. */
export const ME_CHANGED = 'me.changed';
