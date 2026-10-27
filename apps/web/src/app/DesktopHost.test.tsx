import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeResponse } from '@tudu/client';
import type { SpaceSummary, Task } from '@tudu/core';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodayCount } from './DesktopHost';

const TODAY = '2026-10-23';
vi.mock('./workingDay', () => ({
  WorkingDayProvider: ({ children }: { children: unknown }) => children,
  useWorkingDay: () => ({ today: '2026-10-23', night: null, start: () => {}, stay: () => {} }),
}));

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, ref: id, title: id, done: false, ownerId: null, day: TODAY, ...over }) as unknown as Task;
let days: Record<string, Task[] | 'fail' | 'wait'> = {};
const waiting: Array<() => void> = [];
vi.mock('./tasks', () => ({
  taskStore: {
    dayQuery: (spaceId: string, day: string) => ({
      queryKey: ['day', spaceId, day],
      queryFn: async () => {
        const d = days[spaceId];
        if (d === 'fail') throw new Error('offline');
        if (d === 'wait') await new Promise<void>((r) => waiting.push(r));
        const now = days[spaceId];
        return { day, tasks: Array.isArray(now) ? now : [] };
      },
    }),
  },
}));

const space = (id: string, kind: 'personal' | 'team'): SpaceSummary => ({
  id,
  kind,
  name: id,
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
} as unknown as MeResponse;

function mount(report: (t: { left: number; total: number }) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <TodayCount me={ME} report={report} />
    </QueryClientProvider>,
  );
  return { ...r, qc };
}

afterEach(cleanup);

describe('MC-U04 the number beside the tick, from the desk', () => {
  it('MC-U04 nothing until every space has answered; then left and planned; a tick counts down', async () => {
    days = {
      p: [task('a'), task('b', { done: true })],
      n: 'wait',
    };
    const report = vi.fn();
    const { qc } = mount(report);
    await act(async () => {});
    expect(report).not.toHaveBeenCalled();

    days.n = [task('c', { ownerId: 'u' }), task('d', { ownerId: 'someone' })];
    await act(async () => waiting.splice(0).forEach((go) => go()));
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ left: 2, total: 3 }));

    // Ticking one off (as the outbox writes it into the cache) moves the number at once.
    act(() =>
      qc.setQueryData(['day', 'p', TODAY], {
        day: TODAY,
        tasks: [task('a', { done: true }), task('b', { done: true })],
      }),
    );
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ left: 1, total: 3 }));
    const count = report.mock.calls.length;
    // The same numbers again are not reported again.
    await act(async () => {
      qc.setQueryData(['day', 'n', TODAY], { day: TODAY, tasks: [task('c', { ownerId: 'u' })] });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(report.mock.calls.length).toBe(count);
  });

  it('MC-U05 a space that fails still lets the others count', async () => {
    days = { p: [task('a'), task('b')], n: 'fail' };
    const report = vi.fn();
    mount(report);
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ left: 2, total: 2 }));
  });
});
