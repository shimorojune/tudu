import { isoOfDate, type IsoDate } from './dates';
import { hoursOn, nextWorkDay, timeOf, type WorkHours } from './hours';
import { menuBarEmptyLines, type MenuBarGroup } from './menubar';
import type { SpaceSummary } from './spaces';

/**
 * Nudges: a Mac notification on the clock through your working hours that says what is done and what is left today.
 * Everything here is pure; the clock and the numbers come from the caller.
 */

/** How often, in minutes. */
export const NUDGE_EVERY = [30, 60, 120, 180] as const;
export type NudgeEvery = (typeof NUDGE_EVERY)[number];
export const DEFAULT_EVERY: NudgeEvery = 60;

export const EVERY_WORDS: Record<NudgeEvery, string> = {
  30: '30 min',
  60: 'Hourly',
  120: '2 hours',
  180: '3 hours',
};

export function isNudgeEvery(v: unknown): v is NudgeEvery {
  return NUDGE_EVERY.includes(v as NudgeEvery);
}

/** A moment on the local clock: the ISO day and minutes since midnight. */
export interface LocalTime {
  day: IsoDate;
  min: number;
}

/** A local moment as one sortable string, "2026-10-27T09:00". */
export function stampOf(t: LocalTime): string {
  return `${t.day}T${timeOf(t.min)}`;
}

/** What the device's clock says, read as a local day and minute. */
export function localTimeOf(now: Date): LocalTime {
  return { day: isoOfDate(now), min: now.getHours() * 60 + now.getMinutes() };
}

export type SlotKind = 'start' | 'after' | 'end';

export interface NudgeSlot extends LocalTime {
  kind: SlotKind;
}

/**
 * The day's nudges: on the clock from your start time, every `every` minutes while before the end, plus one at the
 * end. A day off has none.
 */
export function nudgeSlots(hours: WorkHours, day: IsoDate, every: NudgeEvery): NudgeSlot[] {
  const h = hoursOn(hours, day);
  if (!h) return [];
  const out: NudgeSlot[] = [];
  for (let m = h.start; m < h.end; m += every)
    out.push({ day, min: m, kind: m === h.start ? 'start' : 'after' });
  out.push({ day, min: h.end, kind: 'end' });
  return out;
}

/** The last nudge sent on this Mac: when, how many were done then, and whether it was a once-a-day one. */
export interface LastNudge {
  at: string;
  done: number;
  once: 'all-done' | 'nothing' | null;
}

/** A pause for today ends at the start of your next working day. */
export function pauseUntil(hours: WorkHours, now: LocalTime): string | null {
  const next = nextWorkDay(hours, now.day);
  const h = next ? hoursOn(hours, next) : null;
  return next && h ? stampOf({ day: next, min: h.start }) : null;
}

export function isPaused(pausedUntil: string | null, now: LocalTime): boolean {
  return pausedUntil !== null && stampOf(now) < pausedUntil;
}

export interface NudgeState {
  hours: WorkHours;
  every: NudgeEvery;
  pausedUntil: string | null;
  now: LocalTime;
  last: LastNudge | null;
}

/** The next nudge to come (for "Next at 11:00"), or null when none is coming within a week. */
export function nextNudge({ hours, every, pausedUntil, now, last }: NudgeState): NudgeSlot | null {
  const nowStamp = stampOf(now);
  let day = now.day;
  for (let i = 0; i < 8; i++) {
    for (const s of nudgeSlots(hours, day, every)) {
      const st = stampOf(s);
      if (st < nowStamp) continue;
      if (last && last.at >= st) continue;
      if (pausedUntil && st < pausedUntil) continue;
      return s;
    }
    const n = nextWorkDay(hours, day);
    if (!n) return null;
    day = n;
  }
  return null;
}

/** How late a slot may still be sent as on time: the clock is checked every 30 s, and a busy page can lag. */
export const SLOT_GRACE_MIN = 2;

/**
 * Whether a nudge is due now, and which. On a slot (within the grace) and not sent yet: that slot. A slot missed
 * while asleep or quit is never sent late; instead, if the next one is more than half an interval away, one is sent
 * now (in the middle of the day only), otherwise it waits. Paused, a day off, or outside your hours: none.
 */
export function dueNow({ hours, every, pausedUntil, now, last }: NudgeState): NudgeSlot | null {
  if (isPaused(pausedUntil, now)) return null;
  const slots = nudgeSlots(hours, now.day, every);
  let current: NudgeSlot | null = null;
  let next: NudgeSlot | null = null;
  for (const s of slots) {
    if (s.min <= now.min) current = s;
    else if (!next) next = s;
  }
  if (!current) return null;
  if (last && last.at >= stampOf(current)) return null;
  if (now.min - current.min <= SLOT_GRACE_MIN) return current;
  if (!next) return null;
  if (next.min - now.min > every / 2) return { day: now.day, min: now.min, kind: 'after' };
  return null;
}

/** A task as the nudge reads it. */
export interface NudgeTask {
  title: string;
  done: boolean;
}

export interface NudgeWords {
  title: string;
  body: string;
  /** All done and nothing on today are sent once; the next nudge stays quiet while it is still true. */
  once: 'all-done' | 'nothing' | null;
}

/** "Send invoice to Acme", or "Review the launch draft · Northwind" for a team space's task. */
function taskLabel(t: NudgeTask, space: SpaceSummary): string {
  return space.kind === 'personal' ? t.title : `${t.title} · ${space.name}`;
}

/**
 * The nudge's words from today's groups (as `gatherToday` gives them): the title is the numbers, the body says what
 * is next. `last` is the nudge before (null if none today). Null means stay quiet: a once-a-day line already said.
 * `test` is Send now: it always says something.
 */
export function nudgeWords({
  groups,
  kind,
  now,
  last,
  tomorrow,
  backlog,
  test = false,
}: {
  groups: MenuBarGroup<NudgeTask>[];
  kind: SlotKind;
  now: LocalTime;
  last: LastNudge | null;
  tomorrow: number;
  backlog: number;
  test?: boolean;
}): NudgeWords | null {
  const today = last && last.at.slice(0, 10) === now.day ? last : null;
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const done = groups.reduce((n, g) => n + g.done, 0);
  const left = total - done;
  if (total === 0) {
    if (!test && today?.once === 'nothing') return null;
    return {
      title: 'Nothing on today',
      body: menuBarEmptyLines(tomorrow, backlog).join(' '),
      once: 'nothing',
    };
  }
  if (left === 0) {
    if (!test && today?.once === 'all-done') return null;
    return {
      title: `All ${total} done for today`,
      body: tomorrow > 0 ? `Tomorrow has ${tomorrow}.` : '',
      once: 'all-done',
    };
  }
  let next = '';
  for (const g of groups) {
    const t = g.tasks.find((x) => !x.done);
    if (t) {
      next = taskLabel(t, g.space);
      break;
    }
  }
  if (kind === 'end')
    return {
      title: `End of your day: ${done} done, ${left} left`,
      body: left === 1 ? 'The 1 left carries to tomorrow.' : `The ${left} left carry to tomorrow.`,
      once: null,
    };
  if (kind === 'start' && done === 0)
    return { title: `${total} on today`, body: `First up: ${next}`, once: null };
  if (left === 1) return { title: '1 left today', body: next, once: null };
  if (today && done === today.done)
    return { title: `Still ${left} left today`, body: `Next: ${next}`, once: null };
  if (today && done > today.done)
    return {
      title: `${done} done, ${left} left today`,
      body: `${done - today.done} since ${today.at.slice(11)}. Next: ${next}`,
      once: null,
    };
  return { title: `${done} done, ${left} left today`, body: `Next: ${next}`, once: null };
}
