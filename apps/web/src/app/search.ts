import type { IsoDate } from '@tudu/core';
import { useSyncExternalStore } from 'react';
import { askBacklogView, locateTask, showDay } from './dayView';

/**
 * What Search remembers per browser and per space (local storage): the searches that led somewhere and the tasks
 * you opened lately, five each, newest first. The last search itself lives in the panel for the visit.
 */
const HISTORY_KEY = 'tudu.search.history';
const RECENT_KEY = 'tudu.search.recent';
export const SEARCH_MEMORY = 5;
type Memory = Record<string, string[]>;

function read(key: string): Memory {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Memory) : {};
  } catch {
    return {};
  }
}

function write(key: string, m: Memory): void {
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    /* fine: it lasts for this visit */
  }
}

let history: Memory = read(HISTORY_KEY);
let recent: Memory = read(RECENT_KEY);
const NONE: string[] = [];
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());

function push(m: Memory, spaceId: string, value: string, same: (a: string, b: string) => boolean): Memory {
  const list = [value, ...(m[spaceId] ?? []).filter((x) => !same(x, value))].slice(0, SEARCH_MEMORY);
  return { ...m, [spaceId]: list };
}

/** A search that led somewhere joins the space's recent searches (the same words again move to the top). */
export function addSearch(spaceId: string, q: string): void {
  const t = q.trim();
  if (!t) return;
  history = push(history, spaceId, t, (a, b) => a.toLowerCase() === b.toLowerCase());
  write(HISTORY_KEY, history);
  notify();
}

export function clearSearches(spaceId: string): void {
  if (!history[spaceId]) return;
  const next = { ...history };
  delete next[spaceId];
  history = next;
  write(HISTORY_KEY, history);
  notify();
}

export function getSearches(spaceId: string): string[] {
  return history[spaceId] ?? NONE;
}

export function useSearches(spaceId: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => history[spaceId] ?? NONE,
    () => NONE,
  );
}

/** A task you opened (from Search, or its panel) joins the space's recently opened. */
export function addRecentTask(spaceId: string, taskId: string): void {
  recent = push(recent, spaceId, taskId, (a, b) => a === b);
  write(RECENT_KEY, recent);
  notify();
}

export function getRecentTasks(spaceId: string): string[] {
  return recent[spaceId] ?? NONE;
}

export function useRecentTasks(spaceId: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => recent[spaceId] ?? NONE,
    () => NONE,
  );
}

/** For tests: forget everything. */
export function resetSearchMemory(): void {
  history = {};
  recent = {};
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(RECENT_KEY);
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
