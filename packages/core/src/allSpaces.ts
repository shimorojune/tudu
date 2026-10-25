import type { IsoDate } from './dates';
import { placeAt, renumber } from './positions';
import type { SpaceSummary } from './spaces';
import type { AllSpacesPlace } from './tasks';

/** The address All spaces answers to: `/all`, `/all/week`, `/all/backlog`. */
export const ALL_SLUG = 'all';

/** All spaces only shows once you are in two spaces or more: with one it would be the same list twice. */
export function hasAllSpaces(spaces: Array<{ id: string }>): boolean {
  return spaces.length >= 2;
}

/** The spaces in the switcher's order: Personal first, then the others as they come. */
export function switcherOrder<S extends Pick<SpaceSummary, 'kind'>>(spaces: S[]): S[] {
  return [...spaces.filter((s) => s.kind === 'personal'), ...spaces.filter((s) => s.kind !== 'personal')];
}

/** What gatherAll needs of a task. */
export interface GatherTask {
  id: string;
  spaceId: string;
  day: IsoDate | null;
  ownerId: string | null;
  position: number;
  createdAt: string;
  done: boolean;
}

export interface AllSpacesList<T> {
  tasks: T[];
  done: number;
  total: number;
}

/**
 * One day (or the Backlog) of All spaces: your tasks from every space you are in, in All spaces' own order.
 *
 * - Only spaces in `spaces` count: a cached list from a space you just left is dropped, whatever the cache holds.
 * - Only your own tasks: yours, or ownerless (never a colleague's), the rule every page uses.
 * - A day you never arranged reads in the switcher's order (Personal first), then each space's own order.
 * - On a day you arranged, the places win; a task with no place (new since, or moved here) goes to the end, oldest
 *   first. A place only counts while its day is still the task's day.
 * - `filter` (a space's id) narrows the list, and the counts with it.
 */
export function gatherAll<T extends GatherTask>(
  spaces: SpaceSummary[],
  lists: Record<string, T[] | undefined>,
  places: AllSpacesPlace[],
  meId: string,
  day: IsoDate | null,
  filter: string | null = null,
): AllSpacesList<T> {
  const ordered = switcherOrder(spaces);
  const rank = new Map(ordered.map((s, i) => [s.id, i]));
  const placeOf = new Map(places.filter((p) => p.day === day).map((p) => [p.taskId, p.position]));
  const all: T[] = [];
  for (const s of ordered) {
    if (filter && s.id !== filter) continue;
    for (const t of lists[s.id] ?? []) {
      if (t.spaceId !== s.id || t.day !== day) continue;
      if (t.ownerId !== null && t.ownerId !== meId) continue;
      all.push(t);
    }
  }
  const placed = all.filter((t) => placeOf.has(t.id));
  const loose = all.filter((t) => !placeOf.has(t.id));
  placed.sort((a, b) => placeOf.get(a.id)! - placeOf.get(b.id)! || a.createdAt.localeCompare(b.createdAt));
  if (placed.length) loose.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  else
    loose.sort(
      (a, b) =>
        rank.get(a.spaceId)! - rank.get(b.spaceId)! ||
        a.position - b.position ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const tasks = [...placed, ...loose];
  return { tasks, done: tasks.filter((t) => t.done).length, total: tasks.length };
}

/**
 * The places to write when a task is put at `index` (counted without it) in a day of All spaces shown as `order`.
 * When every other task there has a place, only the moved one is written (between its neighbours); otherwise, or
 * when the neighbours are too close, the whole day is numbered afresh in its new order, so nothing jumps.
 */
export function placesFor(
  order: Array<{ id: string; position: number | null }>,
  id: string,
  index: number,
): Array<{ id: string; position: number }> {
  const others = order.filter((x) => x.id !== id);
  const i = Math.max(0, Math.min(index, others.length));
  if (others.every((x) => x.position !== null)) {
    const at = placeAt(
      others.map((x) => x.position!),
      i,
    );
    if (!at.renumbered) return [{ id, position: at.position }];
  }
  const next = [...others.map((x) => x.id)];
  next.splice(i, 0, id);
  const fresh = renumber(next.length);
  return next.map((x, k) => ({ id: x, position: fresh[k]! }));
}
