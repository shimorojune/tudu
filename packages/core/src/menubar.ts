import type { SpaceSummary } from './spaces';

/** One space's part of the menu bar's today: its tasks and how many are done. */
export interface MenuBarGroup<T> {
  space: SpaceSummary;
  tasks: T[];
  done: number;
}

/**
 * Today across your spaces, as the menu bar shows it: Personal first, then the others in the switcher's order; a
 * space with nothing today is left out, and only your own tasks count (never someone else's on a shared page).
 * `days` holds each space's today, by id; a space not read yet is left out until it is.
 */
export function gatherToday<T extends { ownerId: string | null; done: boolean }>(
  spaces: SpaceSummary[],
  days: Record<string, T[] | undefined>,
  meId: string,
): MenuBarGroup<T>[] {
  const ordered = [
    ...spaces.filter((s) => s.kind === 'personal'),
    ...spaces.filter((s) => s.kind !== 'personal'),
  ];
  const out: MenuBarGroup<T>[] = [];
  for (const space of ordered) {
    const tasks = (days[space.id] ?? []).filter((t) => t.ownerId === null || t.ownerId === meId);
    if (tasks.length) out.push({ space, tasks, done: tasks.filter((t) => t.done).length });
  }
  return out;
}

/** Today's count for the menu bar's tick: how many of the gathered tasks are still open, out of how many. */
export function todayLeft(groups: Array<{ tasks: unknown[]; done: number }>): {
  left: number;
  total: number;
} {
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const done = groups.reduce((n, g) => n + g.done, 0);
  return { left: total - done, total };
}

/** "2 of 5": how far through a list. */
export function ofWords(done: number, total: number): string {
  return `${done} of ${total}`;
}

/** What an empty today says: each line only when it is true. */
export function menuBarEmptyLines(tomorrow: number, backlog: number): string[] {
  const lines: string[] = [];
  if (tomorrow > 0) lines.push(`Tomorrow has ${tomorrow}.`);
  if (backlog > 0) lines.push(`The Backlog has ${backlog} waiting for a day.`);
  return lines;
}
