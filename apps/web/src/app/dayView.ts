import type { AppPage, IsoDate, QuickAddFrom } from '@tudu/core';
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
/** A task picked in Search: its list scrolls it into the middle and it glows. */
let locate: { id: string; day: IsoDate | null; nonce: number } | null = null;
/** The search panel, over the page. */
let search = false;
/** Words to start Quick Add's title with (Create from Search), or who it is for ("Send Meera a task"). */
/** What Quick Add opens on: words for the title (and the note), a person, a space, the note it is made from. */
export interface QuickAddSeed {
  title?: string;
  note?: string;
  toId?: string;
  spaceId?: string;
  from?: QuickAddFrom;
}

let quickAddSeed: (QuickAddSeed & { nonce: number }) | null = null;
/** The view the Backlog should open on next (a crossed-off task picked in Search). */
let backlogView: { view: 'open' | 'done'; nonce: number } | null = null;
/** The Create a space dialog, and the Members card, over the page. */
let createSpace = false;
let members = false;
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

/** Quick Add, over the page; with words, they become the title; with a person, it is for them. */
export function openQuickAdd(seed?: QuickAddSeed): void {
  // A click handler may pass its event: only real words or a real person count.
  const words = seed && typeof seed.title === 'string' ? seed.title : undefined;
  const toId = seed && typeof seed.toId === 'string' ? seed.toId : undefined;
  const spaceId = seed && typeof seed.spaceId === 'string' ? seed.spaceId : undefined;
  if (words !== undefined || toId !== undefined)
    quickAddSeed = {
      title: words,
      toId,
      spaceId,
      note: typeof seed?.note === 'string' ? seed.note : undefined,
      from: seed?.from && typeof seed.from.noteId === 'string' ? seed.from : undefined,
      nonce: (quickAddSeed?.nonce ?? 0) + 1,
    };
  if (quickAdd) {
    if (words !== undefined || toId !== undefined) notify();
    return;
  }
  quickAdd = true;
  notify();
}

export function useQuickAddSeed(): (QuickAddSeed & { nonce: number }) | null {
  return useSyncExternalStore(
    subscribe,
    () => quickAddSeed,
    () => null,
  );
}

/** The search panel, over the page. */
export function openSearch(): void {
  if (search) return;
  search = true;
  notify();
}

export function closeSearch(): void {
  if (!search) return;
  search = false;
  notify();
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => search,
    () => false,
  );
}

/** Show a task where it sits: its list scrolls it into the middle and it glows. Kept a few seconds for a list still loading. */
let locateTimer: ReturnType<typeof setTimeout> | null = null;
let locateSeq = 0;
export function locateTask(id: string, day: IsoDate | null): void {
  locate = { id, day, nonce: ++locateSeq };
  notify();
  if (locateTimer) clearTimeout(locateTimer);
  locateTimer = setTimeout(() => {
    locate = null;
    notify();
  }, 6000);
}

export function useLocate(): { id: string; day: IsoDate | null; nonce: number } | null {
  return useSyncExternalStore(
    subscribe,
    () => locate,
    () => null,
  );
}

/** Ask the Backlog to open on a view (To do or Crossed off) the next time it looks. */
export function askBacklogView(view: 'open' | 'done'): void {
  backlogView = { view, nonce: (backlogView?.nonce ?? 0) + 1 };
  notify();
}

export function useBacklogViewAsk(): { view: 'open' | 'done'; nonce: number } | null {
  return useSyncExternalStore(
    subscribe,
    () => backlogView,
    () => null,
  );
}

export function openCreateSpace(): void {
  if (createSpace) return;
  createSpace = true;
  notify();
}
export function closeCreateSpace(): void {
  if (!createSpace) return;
  createSpace = false;
  notify();
}
export function useCreateSpaceOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => createSpace,
    () => false,
  );
}

export function openMembers(): void {
  if (members) return;
  members = true;
  notify();
}
export function closeMembers(): void {
  if (!members) return;
  members = false;
  notify();
}
export function useMembersOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => members,
    () => false,
  );
}

/** For tests: everything back to the start. */
export function resetDayViewForTests(): void {
  shown = null;
  createSpace = false;
  members = false;
  page = null;
  shownWeek = null;
  quickAdd = false;
  second = null;
  flash = null;
  locate = null;
  search = false;
  quickAddSeed = null;
  backlogView = null;
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
