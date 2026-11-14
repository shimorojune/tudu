import type { Project, Task } from './tasks';

/** The key of the group for tasks without a project. It always comes last. */
export const NO_PROJECT = 'none';

export interface ProjectGroup<T> {
  /** The project's id, or NO_PROJECT. */
  key: string;
  /** The space the project lives in; undefined for No project. */
  spaceId?: string;
  name: string;
  /** The project's colour; undefined for No project. */
  color?: string;
  /** Its tasks, in the order the page's list has them. */
  tasks: T[];
}

/**
 * A page's tasks by project (the "By project" view). Groups follow the projects' own order (Settings › Projects);
 * across spaces (All spaces) the spaces go in `spaceOrder` first. Tasks without a project, and tasks whose project
 * is not known, come last under No project. Inside a group the tasks keep the order they came in, so the day's own
 * order is never thrown away. Only groups with tasks are returned.
 */
export function groupByProject<T extends Pick<Task, 'projectId'>>(
  tasks: T[],
  projects: Pick<Project, 'id' | 'spaceId' | 'name' | 'color' | 'position'>[],
  spaceOrder: string[] = [],
): ProjectGroup<T>[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const held = new Map<string, T[]>();
  const none: T[] = [];
  for (const t of tasks) {
    const p = t.projectId ? byId.get(t.projectId) : undefined;
    if (!p) none.push(t);
    else if (held.has(p.id)) held.get(p.id)!.push(t);
    else held.set(p.id, [t]);
  }
  const rank = (spaceId: string) => {
    const i = spaceOrder.indexOf(spaceId);
    return i === -1 ? spaceOrder.length : i;
  };
  const groups: ProjectGroup<T>[] = [...held.keys()]
    .map((id) => byId.get(id)!)
    .sort(
      (a, b) => rank(a.spaceId) - rank(b.spaceId) || a.position - b.position || a.name.localeCompare(b.name),
    )
    .map((p) => ({ key: p.id, spaceId: p.spaceId, name: p.name, color: p.color, tasks: held.get(p.id)! }));
  if (none.length) groups.push({ key: NO_PROJECT, name: 'No project', tasks: none });
  return groups;
}

/**
 * A move inside a group, as a place in the whole list. `order` is the page's list (ids), `group` the ids of the
 * moved task's group in the same order, `to` the place it takes in the group. The answer is its index in `order`
 * with the task itself taken out (what `place` wants): just before the group-mate that now follows it, or just
 * after the one before it when it goes last. No other task changes place.
 */
export function placeInGroup(order: string[], group: string[], id: string, to: number): number {
  const rest = order.filter((x) => x !== id);
  const mates = group.filter((x) => x !== id);
  const next = mates[to];
  if (next !== undefined) {
    const at = rest.indexOf(next);
    if (at !== -1) return at;
  }
  const last = mates[mates.length - 1];
  if (last !== undefined) {
    const at = rest.indexOf(last);
    if (at !== -1) return at + 1;
  }
  // Alone in its group: it stays where it is.
  const was = order.indexOf(id);
  return was === -1 ? rest.length : Math.min(was, rest.length);
}

/** Where a task written at the end of a group goes in the whole list: right after the group's last task. */
export function endOfGroup(order: string[], group: string[]): number {
  for (let i = group.length - 1; i >= 0; i--) {
    const at = order.indexOf(group[i]!);
    if (at !== -1) return at + 1;
  }
  return order.length;
}
