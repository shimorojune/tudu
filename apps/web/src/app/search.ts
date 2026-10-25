import type { IsoDate } from '@tudu/core';
import { useSyncExternalStore } from 'react';
import { askBacklogView, locateTask, showDay } from './dayView';

/**
 * What Search remembers per browser (local storage): the searches that led somewhere and the tasks you opened lately,
 * five each, newest first, across every space (Search spans them all). The last search itself lives in the panel for
 * the visit. Before Search spanned every space each space kept its own lists; those are merged in once.
 */
const HISTORY_KEY = 'tudu.search.history.all';
const RECENT_KEY = 'tudu.search.recent.all';
const OLD_HISTORY_KEY = 'tudu.search.history';
const OLD_RECENT_KEY = 'tudu.search.recent';
export const SEARCH_MEMORY = 5;

/**
 * The old per-space lists as one, newest first: each list's first, then each one's second, and so on (they kept no
 * times, so that is as near to newest first as they allow), without repeats.
 */
export function mergeOld(old: Record<string, string[]>, same: (a: string, b: string) => boolean): string[] {
  const lists = Object.values(old).filter(Array.isArray);
  const out: string[] = [];
  for (let i = 0; out.length < SEARCH_MEMORY && lists.some((l) => i < l.length); i++)
    for (const l of lists) {
      const v = l[i];
      if (typeof v === 'string' && !out.some((x) => same(x, v))) out.push(v);
    }
  return out.slice(0, SEARCH_MEMORY);
}

function read(key: string, oldKey: string, same: (a: string, b: string) => boolean): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    }
    const was = localStorage.getItem(oldKey);
    if (!was) return [];
    const old = JSON.parse(was) as unknown;
    const merged =
      old && typeof old === 'object' && !Array.isArray(old)
        ? mergeOld(old as Record<string, string[]>, same)
        : [];
    localStorage.setItem(key, JSON.stringify(merged));
    localStorage.removeItem(oldKey);
    return merged;
  } catch {
    return [];
  }
}

function write(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* fine: it lasts for this visit */
  }
}

const sameWords = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sameId = (a: string, b: string) => a === b;
let history: string[] = read(HISTORY_KEY, OLD_HISTORY_KEY, sameWords);
let recent: string[] = read(RECENT_KEY, OLD_RECENT_KEY, sameId);
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());

function push(list: string[], value: string, same: (a: string, b: string) => boolean): string[] {
  return [value, ...list.filter((x) => !same(x, value))].slice(0, SEARCH_MEMORY);
}

/** A search that led somewhere joins the recent searches (the same words again move to the top). */
export function addSearch(q: string): void {
  const t = q.trim();
  if (!t) return;
  history = push(history, t, sameWords);
  write(HISTORY_KEY, history);
  notify();
}

export function clearSearches(): void {
  if (!history.length) return;
  history = [];
  write(HISTORY_KEY, history);
  notify();
}

export function getSearches(): string[] {
  return history;
}

export function useSearches(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => history,
    () => history,
  );
}

/** A task you opened (from Search, or its panel), in whichever space, joins recently opened. */
export function addRecentTask(taskId: string): void {
  recent = push(recent, taskId, sameId);
  write(RECENT_KEY, recent);
  notify();
}

export function getRecentTasks(): string[] {
  return recent;
}

export function useRecentTasks(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => recent,
    () => recent,
  );
}

/** For tests: forget everything, and read local storage again (to see the old lists merged). */
export function resetSearchMemory(reread = false): void {
  history = [];
  recent = [];
  try {
    if (reread) {
      history = read(HISTORY_KEY, OLD_HISTORY_KEY, sameWords);
      recent = read(RECENT_KEY, OLD_RECENT_KEY, sameId);
    } else {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(RECENT_KEY);
      localStorage.removeItem(OLD_HISTORY_KEY);
      localStorage.removeItem(OLD_RECENT_KEY);
    }
  } catch {
    /* fine */
  }
  notify();
}

/** Where a picked task takes you. */
export type GoTo = { page: 'today'; day: IsoDate } | { page: 'backlog'; view: 'open' | 'done' };

/**
 * Go to a task where it sits: Today showing its day (past or ahead), or the Backlog on To do or Crossed off; the
 * row is scrolled into the middle and glows. Returns where it went, for the page to navigate to.
 */
export function goToTask(
  task: { id: string; day: IsoDate | null; done: boolean },
  today: IsoDate,
  navigate: (path: string) => void,
  slug = 'me',
): GoTo {
  if (task.day === null) {
    const view = task.done ? 'done' : 'open';
    askBacklogView(view);
    navigate(`/${slug}/backlog`);
    locateTask(task.id, null);
    return { page: 'backlog', view };
  }
  showDay(task.day, today);
  navigate(`/${slug}`);
  locateTask(task.id, task.day);
  return { page: 'today', day: task.day };
}
