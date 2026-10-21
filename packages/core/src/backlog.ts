import type { Task } from './tasks';

/** The Backlog's two views: what is still to do, and what was crossed off there. */
export type BacklogView = 'open' | 'done';

/**
 * The count beside the Backlog's title: "4 tasks", "1 task", "2 tasks in Platform", "Nothing waiting"; in the
 * Crossed off view "3 crossed off", "1 crossed off in Home", "Nothing crossed off".
 */
export function backlogCount(n: number, view: BacklogView, projectName?: string | null): string {
  const where = projectName ? ` in ${projectName}` : '';
  if (view === 'done') {
    if (!n && !projectName) return 'Nothing crossed off';
    return `${n} crossed off${where}`;
  }
  if (!n && !projectName) return 'Nothing waiting';
  return `${n} ${n === 1 ? 'task' : 'tasks'}${where}`;
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

/** How many tasks of a list each project has, by project id. Tasks with no project are not counted. */
export function countByProject<T extends Pick<Task, 'projectId'>>(tasks: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) if (t.projectId) out[t.projectId] = (out[t.projectId] ?? 0) + 1;
  return out;
}
