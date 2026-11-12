import {
  diffDays,
  dueDistance,
  formatLong,
  MONTHS_SHORT,
  partsOf,
  WEEKDAYS_SHORT,
  weekdayName,
  weekdayOf,
  type DueTone,
  type IsoDate,
} from './dates';

export interface DueLabel {
  /**
   * What follows "Due" or "Overdue since" in the byline: "today", "tomorrow" and "yesterday" for the three days
   * nearest; "Fri" within a week either way; "4 Nov" further out.
   */
  label: string;
  /**
   * The tooltip: "Due Friday 16 October", "Was due Friday 16 October". For today, tomorrow and yesterday it is the
   * row's own words ("Due today", "Overdue since yesterday"), so the row shows no tooltip that only repeats them.
   */
  tip: string;
  overdue: boolean;
  iso: IsoDate;
}

/** The "Due Fri" pill of a task due on `due`, seen on `today`. Overdue once today is past it. */
export function dueLabel(due: IsoDate, today: IsoDate): DueLabel {
  const days = diffDays(today, due);
  if (days === 0) return { label: 'today', tip: 'Due today', overdue: false, iso: due };
  if (days === 1) return { label: 'tomorrow', tip: 'Due tomorrow', overdue: false, iso: due };
  if (days === -1) return { label: 'yesterday', tip: 'Overdue since yesterday', overdue: true, iso: due };
  const near = Math.abs(days) < 7;
  const { month, day } = partsOf(due);
  const label = near ? WEEKDAYS_SHORT[weekdayOf(due)]! : `${day} ${MONTHS_SHORT[month - 1]}`;
  const when = near ? weekdayName(due) : formatLong(due);
  const overdue = days < 0;
  return { label, tip: overdue ? `Was due ${when}` : `Due ${when}`, overdue, iso: due };
}

/** The due fact in the panel: "Fri 16 Oct" and "2 days overdue" (red), "today" (brand), "in 4 days". */
export function dueWords(due: IsoDate, today: IsoDate): { text: string; tone: DueTone } {
  return dueDistance(due, today);
}
