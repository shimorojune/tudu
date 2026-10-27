import type { MeResponse } from '@tudu/client';
import {
  addDays,
  DEFAULT_EVERY,
  DEFAULT_HOURS,
  gatherToday,
  dueNow,
  isNudgeEvery,
  localTimeOf,
  nextNudge,
  nudgeSlots,
  nudgeWords,
  stampOf,
  timeOf,
  weekdayName,
  type IsoDate,
  type LastNudge,
  type LocalTime,
  type NudgeEvery,
  type NudgeWords,
  type SlotKind,
  type Task,
  type WorkHours,
} from '@tudu/core';
import { useSyncExternalStore } from 'react';
import type { DesktopBridge } from './desktop';
import { queryClient } from './session';
import { taskStore } from './tasks';

/**
 * Nudges on this Mac: whether they are on, how often, and a pause, kept in this app's own storage (so each Mac, and
 * each of Tudu, Tudu Staging and Tudu Test, keeps its own). The last nudge sent is kept per account, so a reload
 * never sends the same slot twice.
 */
export interface NudgePrefs {
  on: boolean;
  every: NudgeEvery;
  pausedUntil: string | null;
}

const PREFS_KEY = 'tudu.nudges';
const lastKey = (userId: string) => `tudu.nudges.last.${userId}`;
/** How often the clock is looked at; a slot is sent within the grace after it (`SLOT_GRACE_MIN`). */
export const CLOCK_CHECK_MS = 30_000;

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* fine: it lasts while the app runs */
  }
}

function parsePrefs(raw: unknown): NudgePrefs {
  const o = (raw ?? {}) as Partial<NudgePrefs>;
  return {
    on: o.on === true,
    every: isNudgeEvery(o.every) ? o.every : DEFAULT_EVERY,
    pausedUntil: typeof o.pausedUntil === 'string' ? o.pausedUntil : null,
  };
}

let prefs: NudgePrefs | null = null;
const listeners = new Set<() => void>();

export const nudgePrefs = {
  get(): NudgePrefs {
    return (prefs ??= parsePrefs(readJson(PREFS_KEY)));
  },
  set(part: Partial<NudgePrefs>): void {
    prefs = { ...nudgePrefs.get(), ...part };
    writeJson(PREFS_KEY, prefs);
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Tests only. */
  reset(): void {
    prefs = null;
    listeners.forEach((l) => l());
  },
};

export function useNudgePrefs(): NudgePrefs {
  return useSyncExternalStore(nudgePrefs.subscribe, nudgePrefs.get, nudgePrefs.get);
}

export function readLast(userId: string): LastNudge | null {
  const o = readJson(lastKey(userId)) as Partial<LastNudge> | null;
  return o && typeof o.at === 'string' && typeof o.done === 'number'
    ? { at: o.at, done: o.done, once: o.once === 'all-done' || o.once === 'nothing' ? o.once : null }
    : null;
}

export function writeLast(userId: string, last: LastNudge): void {
  writeJson(lastKey(userId), last);
}

/** The clock nudges go by. Mac end-to-end tests move it (`__tuduNudgeClock`) to run a day in seconds. */
export function nudgeNow(): Date {
  const fake = (window as { __tuduNudgeClock?: string }).__tuduNudgeClock;
  return fake ? new Date(fake) : new Date();
}

export function hoursOfMe(me: MeResponse | null | undefined): WorkHours {
  return me?.workHours ?? DEFAULT_HOURS;
}

/** Yours and still open, as the menu bar's sheet counts tomorrow and the Backlog. */
const waiting = (tasks: Task[] | undefined, meId: string) =>
  (tasks ?? []).filter((t) => !t.done && (t.ownerId === null || t.ownerId === meId)).length;

/**
 * Read today fresh from every space and put it into words. `failed` when any space didn't answer (the numbers
 * would be wrong); null when a once-a-day line was already said.
 */
export async function buildNudge({
  me,
  today,
  now,
  kind,
  last,
  test,
}: {
  me: MeResponse;
  today: IsoDate;
  now: LocalTime;
  kind: SlotKind;
  last: LastNudge | null;
  test?: boolean;
}): Promise<{ words: NudgeWords | null; done: number } | 'failed'> {
  const spaces = me.spaces;
  let read: Record<string, Task[] | undefined>;
  try {
    const days = await Promise.all(
      spaces.map((s) => queryClient.fetchQuery({ ...taskStore.dayQuery(s.id, today, today), staleTime: 0 })),
    );
    read = Object.fromEntries(spaces.map((s, i) => [s.id, days[i]?.tasks]));
  } catch {
    return 'failed';
  }
  const groups = gatherToday(spaces, read, me.user.id);
  let tomorrow = 0;
  let backlog = 0;
  if (groups.every((g) => g.done === g.tasks.length)) {
    const soft = <T>(p: Promise<T>) => p.catch(() => null);
    const [t, b] = await Promise.all([
      Promise.all(
        spaces.map((s) => soft(queryClient.fetchQuery(taskStore.dayQuery(s.id, addDays(today, 1))))),
      ),
      Promise.all(spaces.map((s) => soft(queryClient.fetchQuery(taskStore.backlogQuery(s.id))))),
    ]);
    tomorrow = t.reduce((n, q) => n + waiting(q?.tasks, me.user.id), 0);
    backlog = b.reduce((n, q) => n + waiting(q?.tasks, me.user.id), 0);
  }
  const done = groups.reduce((n, g) => n + g.done, 0);
  return { words: nudgeWords({ groups, kind, now, last, tomorrow, backlog, test }), done };
}

let busy = false;

/**
 * One look at the clock: send the nudge that is due, if any. A slot is remembered before it is said, so it is never
 * sent twice; when a space doesn't answer it is skipped rather than sent with wrong numbers. `test` is Send now: it
 * ignores your hours and a pause, and leaves the day's record alone. Nudges only come in your hours, so "today" is
 * the calendar's day here, the same as the working day then.
 */
export async function tickNudges({
  d,
  me,
  at,
  test = false,
}: {
  d: DesktopBridge;
  me: MeResponse;
  at: Date;
  test?: boolean;
}): Promise<'sent' | 'quiet' | 'failed' | 'none'> {
  const p = nudgePrefs.get();
  if (!test && !p.on) return 'none';
  if (busy) return 'none';
  const now = localTimeOf(at);
  const last = readLast(me.user.id);
  const slot = test
    ? null
    : dueNow({ hours: hoursOfMe(me), every: p.every, pausedUntil: p.pausedUntil, now, last });
  if (!test && !slot) return 'none';
  busy = true;
  try {
    const built = await buildNudge({ me, today: now.day, now, kind: slot?.kind ?? 'after', last, test });
    const keep = (done: number, once: LastNudge['once']) =>
      slot && writeLast(me.user.id, { at: stampOf(slot), done, once });
    if (built === 'failed') {
      keep(last?.done ?? 0, last?.once ?? null);
      return 'failed';
    }
    keep(built.done, built.words?.once ?? last?.once ?? null);
    if (!built.words) return 'quiet';
    try {
      await d.notifyNudge(built.words.title, built.words.body);
      return 'sent';
    } catch {
      return 'failed';
    }
  } finally {
    busy = false;
  }
}

/** "Next at 11:00" today, "Next on Wednesday at 09:00" another day; null when none is coming. */
export function nextWords(
  p: NudgePrefs,
  hours: WorkHours,
  now: LocalTime,
  last: LastNudge | null,
): string | null {
  const n = nextNudge({ hours, every: p.every, pausedUntil: p.pausedUntil, now, last });
  if (!n) return null;
  return n.day === now.day ? `Next at ${timeOf(n.min)}` : `Next on ${weekdayName(n.day)} at ${timeOf(n.min)}`;
}

/** "Paused until Wednesday 09:00" while the pause holds; null otherwise. */
export function pausedWords(p: NudgePrefs, now: LocalTime): string | null {
  if (!p.pausedUntil || p.pausedUntil <= stampOf(now)) return null;
  return `Paused until ${weekdayName(p.pausedUntil.slice(0, 10))} ${p.pausedUntil.slice(11)}`;
}

/** "09:00, 10:00, 11:00": the first slots of your next working day (or a plain example when there is none). */
export function exampleWords(hours: WorkHours, every: NudgeEvery, today: IsoDate): string {
  for (let i = 0; i < 7; i++) {
    const s = nudgeSlots(hours, addDays(today, i), every);
    if (s.length)
      return s
        .slice(0, 3)
        .map((x) => timeOf(x.min))
        .join(', ');
  }
  return '09:00, 10:00, 11:00';
}
