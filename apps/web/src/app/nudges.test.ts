import type { MeResponse } from '@tudu/client';
import { DEFAULT_HOURS, type SpaceSummary, type Task } from '@tudu/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopBridge } from './desktop';

const TODAY = '2026-10-27'; // a Tuesday
const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, ref: id, title: id, done: false, ownerId: null, day: TODAY, ...over }) as unknown as Task;
let days: Record<string, Task[] | 'fail'> = {};

vi.mock('./session', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});
vi.mock('./tasks', () => ({
  taskStore: {
    dayQuery: (spaceId: string, day: string) => ({
      queryKey: ['day', spaceId, day],
      queryFn: async () => {
        const d = day === TODAY ? days[spaceId] : [];
        if (d === 'fail') throw new Error('offline');
        return { day, tasks: d ?? [] };
      },
    }),
    backlogQuery: (spaceId: string) => ({
      queryKey: ['backlog', spaceId],
      queryFn: async () => ({ tasks: [] }),
    }),
  },
}));

const { nudgePrefs, readLast, tickNudges, writeLast } = await import('./nudges');

const space = (id: string, kind: 'personal' | 'team'): SpaceSummary => ({
  id,
  kind,
  name: kind === 'personal' ? 'Personal' : 'Northwind',
  color: null,
  role: 'admin',
  slug: id,
  prefix: 'XX',
  members: 2,
  inbox: { toAnswer: 0, unread: 0 },
});
const ME = {
  user: { id: 'u', name: 'Rohit', email: 'r@example.com', color: null, image: null },
  spaces: [space('p', 'personal'), space('n', 'team')],
  workHours: DEFAULT_HOURS,
} as unknown as MeResponse;

function bridge() {
  const posted: Array<[string, string]> = [];
  const d = {
    notifyNudge: vi.fn(async (t: string, b: string) => {
      posted.push([t, b]);
    }),
  } as unknown as DesktopBridge;
  return { d, posted };
}
const at = (hhmm: string, day = TODAY) => new Date(`${day}T${hhmm}:00`);

beforeEach(() => {
  localStorage.clear();
  nudgePrefs.reset();
  days = {
    p: [task('Send invoice to Acme'), task('Call the bank')],
    n: [task('Review the launch draft'), task('Ship', { ownerId: 'u' }), task('Theirs', { ownerId: 'x' })],
  };
});
afterEach(() => vi.restoreAllMocks());

describe('WH-U14 the nudge clock', () => {
  it('WH-U14 nothing while off; on before the start nothing; 09:00 sends the start words once; 10:00 the after words', async () => {
    const { d, posted } = bridge();
    expect(await tickNudges({ d, me: ME, at: at('09:00') })).toBe('none');
    nudgePrefs.set({ on: true });
    expect(await tickNudges({ d, me: ME, at: at('08:59') })).toBe('none');
    expect(await tickNudges({ d, me: ME, at: at('09:00') })).toBe('sent');
    expect(posted).toEqual([['4 on today', 'First up: Send invoice to Acme']]);
    expect(await tickNudges({ d, me: ME, at: at('09:00') })).toBe('none');
    days.p = [task('Send invoice to Acme', { done: true }), task('Call the bank')];
    expect(await tickNudges({ d, me: ME, at: at('10:00') })).toBe('sent');
    expect(posted[1]).toEqual(['1 done, 3 left today', '1 since 09:00. Next: Call the bank']);
  });

  it('WH-U14 when a space fails to answer, that nudge is skipped, not sent with wrong numbers', async () => {
    const { d, posted } = bridge();
    nudgePrefs.set({ on: true });
    days.n = 'fail';
    expect(await tickNudges({ d, me: ME, at: at('11:00') })).toBe('failed');
    expect(posted).toEqual([]);
    expect(readLast('u')?.at).toBe(`${TODAY}T11:00`);
    days.n = [];
    expect(await tickNudges({ d, me: ME, at: at('11:01') })).toBe('none');
  });
});

describe('WH-U15 reloads, pauses and Send now', () => {
  it('WH-U15 a reload mid-slot does not resend; a pause stops them; Send now ignores hours and the pause', async () => {
    const { d, posted } = bridge();
    nudgePrefs.set({ on: true });
    writeLast('u', { at: `${TODAY}T12:00`, done: 0, once: null });
    nudgePrefs.reset(); // a reload: read back from storage
    expect(await tickNudges({ d, me: ME, at: at('12:01') })).toBe('none');

    nudgePrefs.set({ pausedUntil: '2026-10-28T09:00' });
    expect(await tickNudges({ d, me: ME, at: at('13:00') })).toBe('none');
    expect(await tickNudges({ d, me: ME, at: at('21:30'), test: true })).toBe('sent');
    expect(posted).toEqual([['Still 4 left today', 'Next: Send invoice to Acme']]);
    // Send now leaves the day's record alone.
    expect(readLast('u')?.at).toBe(`${TODAY}T12:00`);
    expect(await tickNudges({ d, me: ME, at: at('09:00', '2026-10-28') })).toBe('sent');
  });

  it('WH-U15 macOS refusing the post reads as failed', async () => {
    const d = {
      notifyNudge: vi.fn(async () => Promise.reject(new Error('not allowed'))),
    } as unknown as DesktopBridge;
    nudgePrefs.set({ on: true });
    expect(await tickNudges({ d, me: ME, at: at('09:00') })).toBe('failed');
  });
});
