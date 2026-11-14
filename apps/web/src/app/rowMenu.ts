import { useQueries } from '@tanstack/react-query';
import type { TaskItem, TaskListMenu } from '@tudu/ui';
import { rowLink } from './links';
import { taskStore } from './tasks';

export interface RowMenuOptions {
  /** The spaces the list's tasks live in: one for a space, every space in All spaces. */
  spaceIds: string[];
  /** The space a row's task lives in, so its Project list holds that space's projects only. */
  spaceIdOf: (key: string) => string;
  meId?: string;
  /** The task open in the panel: deleting it closes the panel. */
  openKey?: string;
  onCloseTask?: () => void;
}

/**
 * What the row menu needs from the app, the same for Today, the Backlog, the week and All spaces: each space's
 * projects, who owns a task, and the project, delete and Undo changes.
 */
export function useRowMenu(o: RowMenuOptions): TaskListMenu {
  const results = useQueries({ queries: o.spaceIds.map((id) => taskStore.projectsQuery(id)) });
  const by = new Map(o.spaceIds.map((id, i) => [id, results[i]?.data]));
  return {
    projects: (t: TaskItem) => by.get(o.spaceIdOf(t.key)),
    linkFor: rowLink,
    readOnly: (t: TaskItem) => {
      const owner = taskStore.lastSeen(t.key)?.ownerId;
      return !!owner && !!o.meId && owner !== o.meId;
    },
    onSetProject: (t, id) => taskStore.setProject(t.key, id),
    onDelete: (t) => {
      if (o.openKey === t.key) o.onCloseTask?.();
      taskStore.remove(t.key);
    },
    onRestore: (t) => taskStore.restore(t.key),
  };
}
