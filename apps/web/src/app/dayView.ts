import type { IsoDate } from '@tudu/core';
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
