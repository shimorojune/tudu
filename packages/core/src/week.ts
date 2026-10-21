import {
  MONTHS_LONG,
  MONTHS_SHORT,
  addDays,
  compareIso,
  diffDays,
  formatLong,
  isoWeekNumber,
  mondayOf,
  partsOf,
  relativeDayLabel,
  type IsoDate,
} from './dates';

/** "This week", "Next week", "Last week", "In 2 weeks", "3 weeks ago". `monday` is the week's Monday. */
export function weekWord(monday: IsoDate, today: IsoDate): string {
  const k = Math.round(diffDays(mondayOf(today), monday) / 7);
  if (k === 0) return 'This week';
  if (k === 1) return 'Next week';
  if (k === -1) return 'Last week';
  return k > 0 ? `In ${k} weeks` : `${-k} weeks ago`;
}

export interface WeekHeading {
  /** "This week · Week 43" */
  eyebrow: string;
  /** "This week" (the phone's eyebrow) */
  word: string;
  /** The title: "12 – 18", or "28 Sep – 4 Oct" when the week crosses a month. */
  day: string;
  /** "October" beside the title, or nothing when the title already says the months. */
  date: string;
  number: number;
  isThisWeek: boolean;
}

/** The heading of a week sheet. */
export function weekHeading(monday: IsoDate, today: IsoDate): WeekHeading {
  const sunday = addDays(monday, 6);
  const a = partsOf(monday);
  const b = partsOf(sunday);
  const same = a.month === b.month;
  return {
    eyebrow: `${weekWord(monday, today)} · Week ${isoWeekNumber(monday)}`,
    word: weekWord(monday, today),
    day: same
      ? `${a.day} – ${b.day}`
      : `${a.day} ${MONTHS_SHORT[a.month - 1]} – ${b.day} ${MONTHS_SHORT[b.month - 1]}`,
    date: same ? MONTHS_LONG[a.month - 1]! : '',
    number: isoWeekNumber(monday),
    isThisWeek: mondayOf(today) === monday,
  };
}

/** The tile's count: nothing when empty, "3 tasks", "1 task", "2 of 7" once something is crossed off. */
export function tileCount(total: number, done: number): string {
  if (!total) return '';
  if (done) return `${done} of ${total}`;
  return `${total} ${total === 1 ? 'task' : 'tasks'}`;
}

/** The one line a folded day shows: its open tasks, or "All crossed off", or nothing when empty. */
export function tilePreview(openTitles: string[], total: number): string {
  if (openTitles.length) return openTitles.join(' · ');
  return total ? 'All crossed off' : '';
}

/** The tile's eyebrow: "Today", "Tomorrow", "Yesterday", "In 3 days", "2 days ago". */
export function tileEyebrow(day: IsoDate, today: IsoDate): string {
  return relativeDayLabel(day, today);
}

/** The folded day's eyebrow on tablets and phones: only Today and Tomorrow say anything. */
export function tileEyebrowShort(day: IsoDate, today: IsoDate): string {
  const n = diffDays(today, day);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : '';
}

/** What a tile is called for screen readers: "Today, Sunday 18 October". */
export function tileLabel(day: IsoDate, today: IsoDate): string {
  return `${day === today ? 'Today, ' : ''}${formatLong(day)}`;
}

/** Where New task lands from the week: today in this week, the Monday of a later week, today for a week gone by. */
export function weekPlannedDay(monday: IsoDate, today: IsoDate): IsoDate {
  return compareIso(monday, today) > 0 ? monday : today;
}

/** Which day of a week opens first on tablets and phones: today when it is in the week, else the first day. */
export function weekFirstOpen(monday: IsoDate, today: IsoDate): IsoDate {
  const n = diffDays(monday, today);
  return n >= 0 && n < 7 ? today : monday;
}
