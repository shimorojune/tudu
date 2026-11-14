import { NO_PROJECT } from '@tudu/core';
import { useMemo, useSyncExternalStore } from 'react';

/**
 * "By project" (group the page's tasks under their projects) and which projects are folded, remembered per browser
 * and per space in local storage. Every page of a space reads the same entry: Today, another day, 2 days, the
 * Backlog beside the day and the Backlog page, so a project folded on one opens folded on the others. All spaces
 * keeps its own choice under ALL_SCOPE; its folds are each space's own (a project lives in one space), plus its own
 * for No project.
 */
const KEY = 'tudu.group';
/** The Backlog's old project filter, replaced by grouping: forgotten on the first read. */
const OLD_KEY = 'tudu.backlog.filter';
export const ALL_SCOPE = 'all';

export interface Grouping {
  /** By project is on. */
  on: boolean;
  /** Folded groups: project ids, and NO_PROJECT. */
  folded: string[];
}
type Kept = Record<string, Grouping>;
const OFF: Grouping = { on: false, folded: [] };

function read(): Kept {
  try {
    localStorage.removeItem(OLD_KEY);
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Kept = {};
    for (const [scope, g] of Object.entries(v as Record<string, unknown>)) {
      if (!g || typeof g !== 'object') continue;
      const { on, folded } = g as { on?: unknown; folded?: unknown };
      out[scope] = {
        on: on === true,
        folded: Array.isArray(folded) ? folded.filter((x): x is string => typeof x === 'string') : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

let kept: Kept = read();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function write(scope: string, next: Grouping): void {
  const all = { ...kept };
  if (!next.on && !next.folded.length) delete all[scope];
  else all[scope] = next;
  kept = all;
  try {
    if (Object.keys(kept).length) localStorage.setItem(KEY, JSON.stringify(kept));
    else localStorage.removeItem(KEY);
  } catch {
    /* fine: it lasts for this visit */
  }
  listeners.forEach((l) => l());
}

export function getGrouping(scope: string): Grouping {
  return kept[scope] ?? OFF;
}

/** Turn By project on or off for a space (or ALL_SCOPE). */
export function setGrouped(scope: string, on: boolean): void {
  const g = getGrouping(scope);
  if (g.on !== on) write(scope, { ...g, on });
}

/** Fold or open one group. `scope` is the space the project lives in (ALL_SCOPE for All spaces' No project). */
export function setFolded(scope: string, key: string, folded: boolean): void {
  const g = getGrouping(scope);
  if (g.folded.includes(key) === folded) return;
  write(scope, { ...g, folded: folded ? [...g.folded, key] : g.folded.filter((k) => k !== key) });
}

/** Forget the folds of projects that are gone. `live` is every project id the space has now. */
export function pruneFolds(scope: string, live: string[]): void {
  const g = getGrouping(scope);
  const folded = g.folded.filter((k) => k === NO_PROJECT || live.includes(k));
  if (folded.length !== g.folded.length) write(scope, { ...g, folded });
}

/** A space's grouping: whether By project is on, and its folded groups. */
export function useGrouping(scope: string): Grouping {
  return useSyncExternalStore(
    subscribe,
    () => kept[scope] ?? OFF,
    () => OFF,
  );
}

/** All spaces: its own choice, and the folds of every space it shows (No project's fold is its own). */
export function useAllGrouping(spaceIds: string[]): Grouping {
  const all = useSyncExternalStore(
    subscribe,
    () => kept,
    () => kept,
  );
  const ids = spaceIds.join(' ');
  return useMemo(() => {
    const own = all[ALL_SCOPE] ?? OFF;
    const folded: string[] = own.folded.filter((k) => k === NO_PROJECT);
    for (const id of ids ? ids.split(' ') : [])
      for (const k of all[id]?.folded ?? []) if (k !== NO_PROJECT) folded.push(k);
    return { on: own.on, folded };
  }, [all, ids]);
}

/** For tests: forget everything (and read local storage again). */
export function resetGrouping(fromStorage = false): void {
  if (fromStorage) kept = read();
  else {
    kept = {};
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* fine */
    }
  }
  listeners.forEach((l) => l());
}
