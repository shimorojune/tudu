import { useSyncExternalStore } from 'react';

/**
 * The Backlog's project filter, remembered per browser and per space (local storage), so the Backlog opens on
 * the project you were looking at. The view (To do or Crossed off) is not kept: it starts at To do each visit.
 */
const KEY = 'tudu.backlog.filter';
type Filters = Record<string, string>;

function read(): Filters {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Filters) : {};
  } catch {
    return {};
  }
}

let filters: Filters = read();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Keep (or with null, forget) the project a space's Backlog is filtered by. */
export function setBacklogFilter(spaceId: string, projectId: string | null): void {
  if ((filters[spaceId] ?? null) === projectId) return;
  const next = { ...filters };
  if (projectId) next[spaceId] = projectId;
  else delete next[spaceId];
  filters = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    /* fine: it lasts for this visit */
  }
  listeners.forEach((l) => l());
}

export function getBacklogFilter(spaceId: string): string | null {
  return filters[spaceId] ?? null;
}

/** The remembered project id for a space's Backlog, or null for all projects. */
export function useBacklogFilter(spaceId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => filters[spaceId] ?? null,
    () => null,
  );
}

/** For tests: forget every filter. */
export function resetBacklogFilters(): void {
  filters = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
  listeners.forEach((l) => l());
}
