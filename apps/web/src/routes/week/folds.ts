import type { IsoDate } from '@tudu/core';
import { useSyncExternalStore } from 'react';

/**
 * Which days of the week are open on tablets and phones, remembered per browser: a day you opened stays open
 * on your phone. Keyed by the day (or `b` for the Backlog); a day nobody touched follows the page's default.
 */
const KEY = 'tudu.week.folds';
type Key = IsoDate | 'b';
type Folds = Record<string, boolean>;

function read(): Folds {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Folds) : {};
  } catch {
    return {};
  }
}

let folds: Folds = read();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setFold(key: Key, open: boolean): void {
  folds = { ...folds, [key]: open };
  try {
    localStorage.setItem(KEY, JSON.stringify(folds));
  } catch {
    /* fine: it lasts for this visit */
  }
  listeners.forEach((l) => l());
}

export interface FoldStore {
  get(key: Key): boolean | undefined;
  set(key: Key, open: boolean): void;
}

export function useFolds(): FoldStore {
  const current = useSyncExternalStore(
    subscribe,
    () => folds,
    () => folds,
  );
  return { get: (key) => current[key], set: setFold };
}

/** For tests: forget every fold. */
export function resetFolds(): void {
  folds = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
  listeners.forEach((l) => l());
}
