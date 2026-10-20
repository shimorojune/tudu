/**
 * Order in a list is a number per task: a new task, or one dropped between two others, takes a number between its
 * neighbours, so only the task that moved is written. When two neighbours get too close to split again, the whole
 * list is renumbered with even gaps.
 */

/** The gap between neighbours after a renumber, and the step for a task added at either end. */
export const POSITION_STEP = 1024;

/** Below this gap two neighbours can no longer be split reliably, so the list is renumbered. */
export const MIN_POSITION_GAP = 1e-6;

/** A position between two neighbours; either may be missing (the first or last place, or an empty list). */
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  const b = before ?? null;
  const a = after ?? null;
  if (b === null && a === null) return POSITION_STEP;
  if (b === null) return a! - POSITION_STEP;
  if (a === null) return b + POSITION_STEP;
  return b + (a - b) / 2;
}

/** True when the two neighbours are too close to put anything between them. */
export function tooClose(before: number | null | undefined, after: number | null | undefined): boolean {
  if (before === null || before === undefined || after === null || after === undefined) return false;
  return after - before < MIN_POSITION_GAP * 2;
}

/** Even positions for a list of `n`: 1024, 2048, … */
export function renumber(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i + 1) * POSITION_STEP);
}

/**
 * Where an item lands when it is put at `index` in a list whose other items have `positions` (in order, without the
 * item itself). Returns its new position, or, when the neighbours are too close, a fresh set of positions for the
 * whole list with the item in place (`renumbered`, one per item, the item's own at `index`).
 */
export function placeAt(positions: number[], index: number): { position: number; renumbered?: number[] } {
  const i = Math.max(0, Math.min(index, positions.length));
  const before = i > 0 ? positions[i - 1]! : null;
  const after = i < positions.length ? positions[i]! : null;
  if (!tooClose(before, after)) return { position: positionBetween(before, after) };
  const all = renumber(positions.length + 1);
  return { position: all[i]!, renumbered: all };
}
