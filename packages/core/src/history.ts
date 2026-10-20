import { dayWord } from './carried';
import { formatDay, type IsoDate } from './dates';
import type { HistoryEvent } from './tasks';

/** The words of one history event: "Due date set to Fri 16 Oct", "Moved from the Backlog to Today". */
export function historyWords(e: HistoryEvent, today: IsoDate): string {
  switch (e.kind) {
    case 'created':
      return 'Created';
    case 'due.set':
      return `Due date set to ${formatDay(e.due)}`;
    case 'due.cleared':
      return 'Due date removed';
    case 'moved':
      return `Moved from ${placeWord(e.from, today)} to ${placeWord(e.to, today)}`;
    case 'carried':
      return `Carried over from ${formatDay(e.from)}`;
    case 'crossed':
      return 'Crossed off';
    case 'uncrossed':
      return 'Uncrossed';
    case 'restored':
      return 'Put back after a delete';
  }
}

function placeWord(day: IsoDate | null, today: IsoDate): string {
  return dayWord(day, today);
}

/** When it happened, short: "Just now", "10:12" today, "Thu" this week, "4 Oct" further back. */
export function whenWords(at: string, now: Date): string {
  const d = new Date(at);
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000 && ms > -60_000) return 'Just now';
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!;
  if (days > 0 && days < 7) return `${wd} ${hh}:${mm}`;
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ]!;
  return `${d.getDate()} ${mo}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

function startOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
