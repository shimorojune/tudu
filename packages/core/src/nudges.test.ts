import { describe, expect, it } from 'vitest';
import { DEFAULT_HOURS, type WorkHours } from './hours';
import { gatherToday } from './menubar';
import {
  dueNow,
  localTimeOf,
  nextNudge,
  nudgeSlots,
  nudgeWords,
  pauseUntil,
  type LastNudge,
  type LocalTime,
  type NudgeState,
} from './nudges';
import type { SpaceSummary } from './spaces';

// 2026-10-27 is a Tuesday; 2026-10-30 a Friday.
const TUE = '2026-10-27';
const at = (day: string, hhmm: string): LocalTime => ({
  day,
  min: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)),
});
const times = (slots: Array<{ min: number }>) =>
  slots.map(
    (s) => `${String(Math.floor(s.min / 60)).padStart(2, '0')}:${String(s.min % 60).padStart(2, '0')}`,
  );
const state = (over: Partial<NudgeState>): NudgeState => ({
  hours: DEFAULT_HOURS,
  every: 60,
  pausedUntil: null,
  now: at(TUE, '09:00'),
  last: null,
  ...over,
});
const sent = (day: string, hhmm: string, done = 0, once: LastNudge['once'] = null): LastNudge => ({
  at: `${day}T${hhmm}`,
  done,
  once,
});

describe('WH-U03 nudgeSlots', () => {
  it('WH-U03 hourly from the start plus the end; 30 min; 3 hours; an end off the grid; a day off', () => {
    expect(times(nudgeSlots(DEFAULT_HOURS, TUE, 60))).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ]);
    const s = nudgeSlots(DEFAULT_HOURS, TUE, 60);
    expect(s[0]!.kind).toBe('start');
    expect(s[1]!.kind).toBe('after');
    expect(s.at(-1)!.kind).toBe('end');
    expect(nudgeSlots(DEFAULT_HOURS, TUE, 30)).toHaveLength(19);
    expect(times(nudgeSlots(DEFAULT_HOURS, TUE, 180))).toEqual(['09:00', '12:00', '15:00', '18:00']);
    const short: WorkHours = { days: [{ day: 2, start: '09:00', end: '17:30' }], same: true };
    expect(times(nudgeSlots(short, TUE, 60)).slice(-2)).toEqual(['17:00', '17:30']);
    expect(nudgeSlots(DEFAULT_HOURS, '2026-10-31', 60)).toEqual([]);
  });
});

describe('WH-U04 nextNudge', () => {
  it('WH-U04 before the start, mid-day, after the end, a day off', () => {
    expect(nextNudge(state({ now: at(TUE, '07:10') }))).toMatchObject({ day: TUE, min: 540, kind: 'start' });
    expect(nextNudge(state({ now: at(TUE, '10:20'), last: sent(TUE, '10:00') }))).toMatchObject({ min: 660 });
    expect(nextNudge(state({ now: at(TUE, '18:30') }))).toMatchObject({ day: '2026-10-28', min: 540 });
    expect(nextNudge(state({ now: at('2026-10-31', '11:00') }))).toMatchObject({
      day: '2026-11-02',
      min: 540,
    });
  });

  it('WH-U04 paused for today: the next is tomorrow at the start; over a weekend, Monday', () => {
    const now = at(TUE, '11:05');
    expect(pauseUntil(DEFAULT_HOURS, now)).toBe('2026-10-28T09:00');
    expect(nextNudge(state({ now, pausedUntil: pauseUntil(DEFAULT_HOURS, now) }))).toMatchObject({
      day: '2026-10-28',
      min: 540,
    });
    const fri = at('2026-10-30', '15:00');
    expect(pauseUntil(DEFAULT_HOURS, fri)).toBe('2026-11-02T09:00');
  });
});

describe('WH-U05 dueNow', () => {
  it('WH-U05 on a slot once; the same slot again is not due', () => {
    expect(dueNow(state({ now: at(TUE, '09:00') }))).toMatchObject({ min: 540, kind: 'start' });
    expect(dueNow(state({ now: at(TUE, '09:01'), last: sent(TUE, '09:00') }))).toBeNull();
    expect(dueNow(state({ now: at(TUE, '08:59') }))).toBeNull();
  });

  it('WH-U05 a missed slot is not sent late: woke 13:20 hourly → one now; woke 13:40 → waits for 14:00', () => {
    const last = sent(TUE, '12:00');
    expect(dueNow(state({ now: at(TUE, '13:20'), last }))).toMatchObject({ min: 800, kind: 'after' });
    expect(dueNow(state({ now: at(TUE, '13:40'), last }))).toBeNull();
    expect(dueNow(state({ now: at(TUE, '14:00'), last }))).toMatchObject({ min: 840 });
  });

  it('WH-U05 asleep through two slots: one nudge, never two', () => {
    const woke = dueNow(state({ now: at(TUE, '13:20'), last: sent(TUE, '10:00') }));
    expect(woke).not.toBeNull();
    expect(dueNow(state({ now: at(TUE, '13:21'), last: sent(TUE, '13:20') }))).toBeNull();
  });

  it('WH-U05 paused, a day off, after the end: none', () => {
    expect(dueNow(state({ now: at(TUE, '10:00'), pausedUntil: '2026-10-28T09:00' }))).toBeNull();
    expect(dueNow(state({ now: at('2026-10-31', '10:00') }))).toBeNull();
    expect(dueNow(state({ now: at(TUE, '18:40'), last: sent(TUE, '17:00') }))).toBeNull();
    expect(dueNow(state({ now: at(TUE, '18:00'), last: sent(TUE, '17:00') }))).toMatchObject({ kind: 'end' });
  });
});

const space = (id: string, kind: 'personal' | 'team', name: string): SpaceSummary => ({
  id,
  kind,
  name,
  color: null,
  role: 'member',
  slug: id,
  prefix: id.toUpperCase(),
  members: kind === 'personal' ? 1 : 4,
  inbox: { toAnswer: 0, unread: 0 },
});
const me = space('me', 'personal', 'Personal');
const nw = space('nw', 'team', 'Northwind');
const task = (title: string, done = false, ownerId: string | null = 'u1') => ({ title, done, ownerId });
const words = (
  days: Record<string, ReturnType<typeof task>[]>,
  over: Partial<Parameters<typeof nudgeWords>[0]> = {},
) =>
  nudgeWords({
    groups: gatherToday([me, nw], days, 'u1'),
    kind: 'after',
    now: at(TUE, '12:00'),
    last: null,
    tomorrow: 0,
    backlog: 0,
    ...over,
  });

describe('WH-U06 nudgeWords', () => {
  const six = [task('Send invoice to Acme'), task('Call the bank'), task('Pay rent'), task('Book flights')];
  const team = [task('Review the launch draft'), task('Ship the build')];

  it('WH-U06 start of the day, each nudge after, some done since, nothing moved', () => {
    expect(words({ me: six, nw: team }, { kind: 'start' })).toEqual({
      title: '6 on today',
      body: 'First up: Send invoice to Acme',
      once: null,
    });
    const three = [
      task('Send invoice to Acme', true),
      task('Call the bank', true),
      task('Pay rent', true),
      task('Book flights'),
    ];
    expect(words({ me: three, nw: team })).toMatchObject({
      title: '3 done, 3 left today',
      body: 'Next: Book flights',
    });
    expect(words({ me: three, nw: team }, { last: sent(TUE, '11:00', 1) })).toMatchObject({
      title: '3 done, 3 left today',
      body: '2 since 11:00. Next: Book flights',
    });
    expect(words({ me: three, nw: team }, { last: sent(TUE, '11:00', 3) })).toMatchObject({
      title: 'Still 3 left today',
    });
  });

  it('WH-U06 a team task is named with its space; another person’s task never counts', () => {
    const r = words({ me: [task('Paid', true)], nw: [...team, task('Meera’s', false, 'u2')] });
    expect(r).toMatchObject({
      title: '1 done, 2 left today',
      body: 'Next: Review the launch draft · Northwind',
    });
  });

  it('WH-U06 one left, all done, nothing on today, end of the day', () => {
    expect(words({ me: [task('Paid', true), task('Call the bank')] })).toEqual({
      title: '1 left today',
      body: 'Call the bank',
      once: null,
    });
    expect(words({ me: [task('a', true), task('b', true)] }, { tomorrow: 4 })).toEqual({
      title: 'All 2 done for today',
      body: 'Tomorrow has 4.',
      once: 'all-done',
    });
    expect(words({}, { tomorrow: 2, backlog: 5 })).toEqual({
      title: 'Nothing on today',
      body: 'Tomorrow has 2. The Backlog has 5 waiting for a day.',
      once: 'nothing',
    });
    expect(words({ me: [task('a', true), task('b'), task('c')] }, { kind: 'end' })).toEqual({
      title: 'End of your day: 1 done, 2 left',
      body: 'The 2 left carry to tomorrow.',
      once: null,
    });
  });
});

describe('WH-U07 once a day', () => {
  it('WH-U07 all done is said once; a task landing on today after nudges again', () => {
    const allDone = { me: [task('a', true)] };
    expect(words(allDone, { last: sent(TUE, '11:00', 1, 'all-done') })).toBeNull();
    expect(words(allDone, { last: sent('2026-10-26', '17:00', 1, 'all-done') })).not.toBeNull();
    expect(
      words({ me: [task('a', true), task('new')] }, { last: sent(TUE, '11:00', 1, 'all-done') }),
    ).toMatchObject({
      title: '1 left today',
    });
  });

  it('WH-U07 nothing on today likewise; Send now always speaks', () => {
    expect(words({}, { last: sent(TUE, '11:00', 0, 'nothing') })).toBeNull();
    expect(words({}, { last: sent(TUE, '11:00', 0, 'nothing'), test: true })).not.toBeNull();
  });
});

describe('WH-U08 times are local', () => {
  it('WH-U08 the same hours give the same slots whatever the zone; the clock is read as local time', () => {
    const d = new Date(2026, 9, 27, 9, 0);
    expect(localTimeOf(d)).toEqual({ day: TUE, min: 540 });
    expect(dueNow(state({ now: localTimeOf(d) }))).toMatchObject({ kind: 'start' });
  });
});
