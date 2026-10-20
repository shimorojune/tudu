import {
  addDays,
  diffDays,
  formatDay,
  formatLong,
  isoOfDate,
  MONTHS_SHORT,
  partsOf,
  WEEKDAYS_SHORT,
  weekdayName,
  weekdayOf,
  type IsoDate,
} from './dates';

/** A carried task turns red once it has been carried this many days. */
export const SLIPPING_AFTER_DAYS = 2;

export interface CarriedLabel {
  /** What follows "From" in the pill: "Sat" within a week, "4 Oct" further back. */
  label: string;
  /** The tooltip: "Carried over from Saturday". */
  tip: string;
  /** Carried for two days or more: the pill turns red. */
  slipping: boolean;
}

/** The "→ From Sat" pill of a task carried over from `from`, seen on `today`. */
export function carriedLabel(from: IsoDate, today: IsoDate): CarriedLabel {
  const days = diffDays(from, today);
  const near = days >= 0 && days < 7;
  const { month, day } = partsOf(from);
  return {
    label: near ? WEEKDAYS_SHORT[weekdayOf(from)]! : `${day} ${MONTHS_SHORT[month - 1]}`,
    tip: near ? `Carried over from ${weekdayName(from)}` : `Carried over from ${formatLong(from)}`,
    slipping: days >= SLIPPING_AFTER_DAYS,
  };
}

/**
 * The working day. Tudu's "today" is the day the app is on, which follows the calendar except in the small hours:
 * after midnight the list stays where it was and the app asks ("It's 00:40 on Monday. You're still on Sunday's list.")
 * until 04:00, when it moves on by itself.
 */
export const NIGHT_ENDS_AT_HOUR = 4;

export type DayTurn =
  { kind: 'same' } | { kind: 'switch'; to: IsoDate } | { kind: 'ask'; from: IsoDate; to: IsoDate };

/**
 * What to do when the clock says `now` and the app is on `working`. `stayed` is the calendar day on which the person
 * chose to stay on the old list, so they are asked only once.
 */
export function dayTurn(working: IsoDate, now: Date, stayed: IsoDate | null = null): DayTurn {
  const real = isoOfDate(now);
  if (real === working) return { kind: 'same' };
  if (now.getHours() < NIGHT_ENDS_AT_HOUR && addDays(working, 1) === real) {
    return stayed === real ? { kind: 'same' } : { kind: 'ask', from: working, to: real };
  }
  return { kind: 'switch', to: real };
}

/** The words of the after-midnight banner. */
export function nightWords(
  now: Date,
  from: IsoDate,
  to: IsoDate,
): {
  title: string;
  body: string;
  start: string;
  stay: string;
} {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return {
    title: `It’s ${hh}:${mm} on ${weekdayName(to)}.`,
    body: `You’re still on ${weekdayName(from)}’s list. Nothing has moved.`,
    start: `Start ${weekdayName(to)}`,
    stay: `Stay on ${weekdayName(from)}`,
  };
}

/** "Moved to Tomorrow", "Moved to Mon 26 Oct", "Moved to the Backlog". */
export function dayWord(day: IsoDate | null, today: IsoDate): string {
  if (day === null) return 'the Backlog';
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return formatDay(day);
}
