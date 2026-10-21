import type { AppPage, IsoDate } from '@tudu/core';
import { useSyncExternalStore } from 'react';

/**
 * Small pieces of page state the shell and the day page share: the day being shown (null is today), the desk's
 * "Day | 2 days" switch (remembered per browser), and a counter the New task buttons bump to open the writing line.
 * The day is kept here rather than in the address so turning it is immediate: two quick clicks on the arrow turn
 * two days.
 */
export type DayView = 'one' | 'two';
const KEY = 'tudu.view';

function readView(): DayView {
  try {
    return localStorage.getItem(KEY) === 'two' ? 'two' : 'one';
  } catch {
    return 'one';
  }
}

let view: DayView = readView();
let newTask = 0;
let shown: IsoDate | null = null;
/** Which page is up, so Quick Add knows where a new task is in view. */
let page: AppPage | null = null;
/** The Monday of the week the week page shows; null is this week. */
let shownWeek: IsoDate | null = null;
let quickAdd = false;
/** The second sheet's day while two days are open, so Quick Add knows a task landing there is in view. */
let second: IsoDate | null = null;
/** A task just added from Quick Add: its day's list opens its gap with the wash. */
let flash: { id: string; day: IsoDate | null; nonce: number } | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());

export function setDayView(v: DayView): void {
  view = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* fine: it lasts for this visit */
  }
  notify();
}

export function useDayView(): DayView {
  return useSyncExternalStore(
    subscribe,
    () => view,
    () => 'one',
  );
}

/** New task (top bar, the phone's round button): open the writing line on the day page. */
export function askNewTask(): void {
  newTask += 1;
  notify();
}

export function useNewTaskAsk(): number {
  return useSyncExternalStore(
    subscribe,
    () => newTask,
    () => 0,
  );
}

/** Show a day on the day page; null (or today itself) is today, which follows the working day. */
export function showDay(day: IsoDate | null, today?: IsoDate): void {
  const next = day === today ? null : day;
  if (next === shown) return;
  shown = next;
  notify();
}

export function useShownDay(): IsoDate | null {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => null,
  );
}

/** Quick Add, over the page. */
export function openQuickAdd(): void {
  if (quickAdd) return;
  quickAdd = true;
  notify();
}

export function closeQuickAdd(): void {
  if (!quickAdd) return;
  quickAdd = false;
  notify();
}

export function useQuickAddOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => quickAdd,
    () => false,
  );
}

/** Wash a task's row on its day (a task added from Quick Add, or Show on its toast). */
let flashTimer: ReturnType<typeof setTimeout> | null = null;
export function flashTask(id: string, day: IsoDate | null): void {
  flash = { id, day, nonce: (flash?.nonce ?? 0) + 1 };
  notify();
  // The wash is a moment; a day opened later must not wash it again.
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash = null;
    notify();
  }, 2500);
}

export function useFlash(): { id: string; day: IsoDate | null; nonce: number } | null {
  return useSyncExternalStore(
    subscribe,
    () => flash,
    () => null,
  );
}

export function setSecondDay(day: IsoDate | null): void {
  if (day === second) return;
  second = day;
  notify();
}

export function useSecondDay(): IsoDate | null {
  return useSyncExternalStore(
    subscribe,
    () => second,
    () => null,
  );
}

/** The page tells the shell which view it is (the week and the Backlog while they are mounted). */
export function setPage(p: AppPage | null): void {
  if (p === page) return;
  page = p;
  notify();
}

export function usePage(): AppPage | null {
  return useSyncExternalStore(
    subscribe,
    () => page,
    () => null,
  );
}

/** Show a week on the week page by its Monday; null is this week. */
export function showWeek(monday: IsoDate | null, thisMonday?: IsoDate): void {
  const next = monday === thisMonday ? null : monday;
  if (next === shownWeek) return;
  shownWeek = next;
  notify();
}

export function useShownWeek(): IsoDate | null {
  return useSyncExternalStore(
    subscribe,
    () => shownWeek,
    () => null,
  );
}
