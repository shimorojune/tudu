import { useQueries, useQuery } from '@tanstack/react-query';
import type { AddTaskHash } from '@tudu/ui';
import { meQuery } from './session';
import { taskStore } from './tasks';

/**
 * `#` on the writing lines: for each space a task can be written to, its projects (in their Settings order), its name
 * for "Projects in …", whether they are still coming in, and how a new one is made.
 */
export function useLineHash(spaceIds: readonly string[]): (spaceId: string) => AddTaskHash {
  const me = useQuery(meQuery).data;
  const results = useQueries({ queries: spaceIds.map((id) => taskStore.projectsQuery(id)) });
  return (id) => {
    const r = results[spaceIds.indexOf(id)];
    return {
      projects: r?.data ?? [],
      spaceName: me?.spaces.find((s) => s.id === id)?.name,
      loading: !r || r.isPending,
      onNew: (name, color) => taskStore.createProject(id, name, color),
    };
  };
}
