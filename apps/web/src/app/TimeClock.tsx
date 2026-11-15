import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { MeResponse } from '@tudu/client';
import {
  addDays,
  dateAt,
  fmtBlock,
  fmtTime,
  formatDay,
  type IsoDate,
  type Task,
  type TimeWordsOptions,
} from '@tudu/core';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DesktopBridge, TimeNotice } from './desktop';
import { taskStore } from './tasks';
import { timeWords } from './times';
import { useWorkingDay } from './workingDay';

/** How far ahead the time notifications are scheduled with macOS. */
export const AHEAD_MS = 48 * 60 * 60 * 1000;
/** macOS keeps at most 64 pending; the nearest 60 go. */
export const MAX_NOTICES = 60;
/** Looked at again this often, beside every change and the window coming back. */
const LOOK_MS = 30 * 60 * 1000;

// ---- the switch: Settings › Working hours › Notify me at planned and due times (on by default) ----

const KEY = 'tudu.times';
let on: boolean | null = null;
const listeners = new Set<() => void>();

export const timesPref = {
  get(): boolean {
    if (on === null) {
      try {
        on = localStorage.getItem(KEY) !== 'off';
      } catch {
        on = true;
      }
    }
    return on;
  },
  set(v: boolean): void {
    on = v;
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {
      // Kept for this run only.
    }
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Tests only. */
  reset(): void {
    on = null;
  },
};

export function useTimesPref(): boolean {
  return useSyncExternalStore(timesPref.subscribe, timesPref.get, timesPref.get);
}

/**
 * The time notifications for the next 48 hours (docs/plans/task-times.md): at each planned start ("Starts now: …")
 * and each due time ("Due now: …"). Yours only, never a crossed-off task; a span once, at its start. Nearest first,
 * the nearest 60.
 */
export function timeNotices(
  tasks: Task[],
  now: Date,
  meId: string,
  placeOf: (t: Task) => string | undefined,
  o: TimeWordsOptions = {},
): TimeNotice[] {
  const from = now.getTime();
  const to = from + AHEAD_MS;
  const out = new Map<string, TimeNotice>();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const add = (n: TimeNotice) => {
    if (n.atMs <= from || n.atMs > to) return;
    const id = `${n.taskId}.${n.kind}`;
    if (!out.has(id)) out.set(id, n);
  };
  for (const t of tasks) {
    if (t.done || (t.ownerId && t.ownerId !== meId)) continue;
    const place = placeOf(t);
    const tail = place ? ` · ${place}` : '';
    if (t.day && t.time) {
      const words =
        t.until && t.until > t.day
          ? `${fmtTime(t.time.start, o)}, every day until ${formatDay(t.until)}`
          : fmtBlock(t.time, o);
      add({
        taskId: t.id,
        kind: 'start',
        title: `Starts now: ${t.title}`,
        body: `${words}${tail}`,
        atMs: dateAt(t.day, t.time.start).getTime(),
      });
    }
    if (t.due && t.dueAt) {
      const day = t.due === today ? 'today' : t.due === addDays(today, 1) ? 'tomorrow' : formatDay(t.due);
      add({
        taskId: t.id,
        kind: 'due',
        title: `Due now: ${t.title}`,
        body: `Due ${day} at ${fmtTime(t.dueAt, o)}${tail}`,
        atMs: dateAt(t.due, t.dueAt).getTime(),
      });
    }
  }
  return [...out.values()].sort((a, b) => a.atMs - b.atMs).slice(0, MAX_NOTICES);
}

/**
 * In the desk's window (it keeps running hidden): works out the time notifications from today, the next two days
 * and the Backlog of every space, and hands macOS the whole set on each change, when the window comes back and every
 * 30 minutes. The switch off cancels them all. Cross off on a notification crosses the task off here; Open shows it.
 */
export function TimeClock({ d, me }: { d: DesktopBridge; me: MeResponse }) {
  const { today } = useWorkingDay();
  const navigate = useNavigate();
  const pref = useTimesPref();
  const days: (IsoDate | null)[] = [today, addDays(today, 1), addDays(today, 2), null];
  const spaces = me.spaces;
  const qs = useQueries({
    queries: spaces.flatMap((s) =>
      days.map((day) => (day === null ? taskStore.backlogQuery(s.id) : taskStore.dayQuery(s.id, day, today))),
    ),
  });
  const tasks = qs.flatMap((q) => q.data?.tasks ?? []);
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name;
  const [tick, setTick] = useTickEvery(LOOK_MS);
  const notices = timeNotices(tasks, new Date(), me.user.id, (t) => spaceName(t.spaceId), timeWords);
  const key = pref ? JSON.stringify(notices) : 'off';
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === `${key}|${tick}`) return;
    sent.current = `${key}|${tick}`;
    if (!pref) void d.cancelTimes().catch(() => undefined);
    else void d.scheduleTimes(notices).catch(() => undefined);
    // `notices` is what `key` says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, key, pref, tick]);

  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') setTick();
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', setTick);
    const cross = d.on('times:cross', (id) => {
      if (typeof id === 'string') taskStore.cross(id, true);
    });
    const open = d.on('times:open', (id) => {
      const ref = typeof id === 'string' ? taskStore.lastSeen(id)?.ref : null;
      if (ref) void navigate({ href: `/t/${ref}` });
    });
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', setTick);
      cross();
      open();
    };
  }, [d, navigate, setTick]);
  return null;
}

/** A number that goes up every `ms`, and when `bump` is called. */
function useTickEvery(ms: number): [number, () => void] {
  const [n, setN] = useState(0);
  const bump = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    const id = setInterval(bump, ms);
    return () => clearInterval(id);
  }, [ms, bump]);
  return [n, bump];
}
