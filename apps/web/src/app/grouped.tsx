import {
  endOfGroup,
  groupByProject,
  NO_PROJECT,
  placeInGroup,
  type Project,
  type ProjectGroup,
  type Task,
} from '@tudu/core';
import { Segmented, type TaskGroupItem, type TaskItem } from '@tudu/ui';
import { useEffect, type ReactNode } from 'react';
import { ALL_SCOPE, pruneFolds, setFolded, setGrouped, useAllGrouping, useGrouping } from './grouping';

type View = 'mine' | 'by';
const VIEWS: { value: View; label: string }[] = [
  { value: 'mine', label: 'My order' },
  { value: 'by', label: 'By project' },
];

export interface ProjectGroups {
  /** By project is chosen for this space (whether or not this page has enough groups to show it). */
  wanted: boolean;
  /** The page shows its groups: By project is chosen and there are two or more. */
  on: boolean;
  /** Changes when the page goes between its own order and its groups: the list turns. */
  view: View;
  groups: TaskGroupItem[];
  folded: string[];
  /** The My order | By project switch, or null while the page has fewer than two groups. */
  control: ReactNode;
  fold: (group: string, folded: boolean) => void;
  /** Fold every group but this project's (All spaces: a row's project pill). */
  only: (projectId: string) => void;
  /** The project a task written into a group takes, and (All spaces) the space it is made in. */
  target: (group: string) => { projectId?: string; spaceId?: string };
  /** A move inside a group, as the task's index in `order` counted without it. */
  place: (order: string[], group: string, id: string, to: number) => number;
  /** Where a task written on a group's own line goes in `order`: right after the group's last task. */
  end: (order: string[], group: string) => number;
}

/**
 * A page's tasks by project, with the space's remembered choice and folds (see grouping.ts). `tasks` and `items`
 * are the page's list, row for row. `spaces` is given on All spaces only: the spaces it shows, in switcher order.
 */
export function useProjectGroups(o: {
  spaceId: string;
  tasks: Task[];
  items: TaskItem[];
  projects: Project[];
  /** The space's projects have loaded: folds kept for projects that are gone are dropped. */
  ready?: boolean;
  spaces?: string[] | null;
  /** Extra class for the switch (the Backlog's tools row leads with it). */
  className?: string;
}): ProjectGroups {
  const all = !!o.spaces;
  const own = useGrouping(o.spaceId);
  const across = useAllGrouping(o.spaces ?? []);
  const kept = all ? across : own;
  const scope = all ? ALL_SCOPE : o.spaceId;

  const live = o.projects.map((p) => p.id).join(' ');
  useEffect(() => {
    if (o.ready && !all) pruneFolds(o.spaceId, live ? live.split(' ') : []);
  }, [o.ready, all, o.spaceId, live]);

  const byId = new Map(o.items.map((it) => [it.key, it]));
  const grouped: ProjectGroup<Task>[] = groupByProject(o.tasks, o.projects, o.spaces ?? []);
  const groups: TaskGroupItem[] = grouped.map((g) => ({
    key: g.key,
    name: g.name,
    color: g.color,
    tasks: g.tasks.flatMap((t) => byId.get(t.id) ?? []),
  }));
  const can = groups.length >= 2;
  const on = can && kept.on;
  const ids = (group: string) => grouped.find((g) => g.key === group)?.tasks.map((t) => t.id) ?? [];
  // A project's fold is its space's; No project's is the page's own.
  const scopeOf = (group: string) =>
    all ? (grouped.find((g) => g.key === group)?.spaceId ?? ALL_SCOPE) : scope;

  return {
    wanted: kept.on,
    on,
    view: on ? 'by' : 'mine',
    groups,
    folded: kept.folded,
    control: can ? (
      <Segmented
        items={VIEWS}
        value={kept.on ? 'by' : 'mine'}
        onChange={(v) => setGrouped(scope, v === 'by')}
        label="Order"
        className={o.className}
      />
    ) : null,
    fold: (group, folded) => setFolded(scopeOf(group), group, folded),
    only: (projectId) => {
      for (const g of grouped) setFolded(scopeOf(g.key), g.key, g.key !== projectId);
    },
    target: (group) => {
      if (group === NO_PROJECT) return {};
      return { projectId: group, spaceId: grouped.find((g) => g.key === group)?.spaceId };
    },
    place: (order, group, id, to) => placeInGroup(order, ids(group), id, to),
    end: (order, group) => endOfGroup(order, ids(group)),
  };
}
