/** Hour (0-23) when the logical day starts. Step 11 makes this a preference. */
export const DAY_START_HOUR = 4;

/** Carried this many days or more counts as slipping. Step 11 may expose as preference. */
export const SLIPPING_CARRY_DAYS = 2;

/** ISO date for the logical "today" given a clock reading. Before DAY_START_HOUR the
    effective day is still yesterday. */
export function effectiveDayIso(now: Date = new Date()): string {
  const shifted = new Date(now);
  if (shifted.getHours() < DAY_START_HOUR) {
    shifted.setDate(shifted.getDate() - 1);
  }
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Calendar date (wall clock), ignoring day-start offset. */
export function calendarDayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function carriedDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function isSlipping(args: {
  carriedDays: number;
  deadline: string | null;
  now?: Date;
}): boolean {
  const { carriedDays, deadline, now = new Date() } = args;
  if (carriedDays >= SLIPPING_CARRY_DAYS) {
    return true;
  }
  if (!deadline) {
    return false;
  }
  return new Date(deadline).getTime() < now.getTime();
}

/** True between midnight and DAY_START_HOUR when calendar date > selected viewing day. */
export function isMidnightBoundary(args: {
  selectedDate: string;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  if (now.getHours() >= DAY_START_HOUR) {
    return false;
  }
  return calendarDayIso(now) > args.selectedDate;
}
