import type { Task } from './tasks';

/** The Backlog's two views: what is still to do, and what was crossed off there. */
export type BacklogView = 'open' | 'done';

/**
 * The count beside the Backlog's title: "4 tasks", "1 task", "Nothing waiting"; in the Crossed off view
 * "3 crossed off", "Nothing crossed off".
 */
export function backlogCount(n: number, view: BacklogView): string {
  if (view === 'done') return n ? `${n} crossed off` : 'Nothing crossed off';
  return n ? `${n} ${n === 1 ? 'task' : 'tasks'}` : 'Nothing waiting';
}

/**
 * The Backlog split for its two views: To do in your own order (the order the list came in), Crossed off newest
 * first: by when it was crossed off, then by its last change, then the newer task first.
 */
export function splitBacklog<T extends Pick<Task, 'done' | 'doneAt' | 'updatedAt' | 'number'>>(
  tasks: T[],
): { open: T[]; done: T[] } {
  const open = tasks.filter((t) => !t.done);
  const done = tasks
    .filter((t) => t.done)
    .sort(
      (a, b) =>
        (b.doneAt ?? '').localeCompare(a.doneAt ?? '') ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        (b.number ?? 0) - (a.number ?? 0),
    );
  return { open, done };
}
