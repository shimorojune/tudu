import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeResponse } from '@tudu/client';
import type { SpaceSummary, Task } from '@tudu/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetThemeForTests } from '@tudu/ui';
import { resetDesktop, type DesktopFake } from '../../app/desktop';
import { MenuBarPage } from './MenuBarPage';

const TODAY = '2026-10-23';
const live = vi.fn();
vi.mock('../../app/live', () => ({ useLiveEvents: (on: boolean) => live(on) }));
vi.mock('../../app/workingDay', () => ({
  WorkingDayProvider: ({ children }: { children: unknown }) => children,
  useWorkingDay: () => ({ today: '2026-10-23', night: null, start: () => {}, stay: () => {} }),
}));
const refreshMe = vi.fn();
vi.mock('../../app/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  refreshMe: () => refreshMe(),
}));

const task = (id: string, ref: string, title: string, over: Partial<Task> = {}): Task =>
  ({
    id,
    ref,
    title,
    done: false,
    ownerId: null,
    day: TODAY,
    due: null,
    carriedFrom: null,
    projectId: null,
    jira: null,
    commentCount: 0,
    subtasks: [],
    ...over,
  }) as unknown as Task;
const days: Record<string, Task[]> = {
  p: [task('t1', 'ME-1', 'Book the dentist'), task('t2', 'ME-2', 'Send the invoice')],
  n: [task('t3', 'NW-4', 'Someone else’s', { ownerId: 'other' })],
};
const cross = vi.fn();
const refreshAll = vi.fn();
vi.mock('../../app/tasks', () => ({
  useOnline: () => true,
  taskStore: {
    dayQuery: (spaceId: string, day: string) => ({
      queryKey: ['day', spaceId, day],
      queryFn: async () => ({ day, tasks: day === '2026-10-23' ? (days[spaceId] ?? []) : [] }),
    }),
    backlogQuery: (spaceId: string) => ({
      queryKey: ['day', spaceId, null],
      queryFn: async () => ({ day: null, tasks: [] }),
    }),
    projectsQuery: (spaceId: string) => ({ queryKey: ['projects', spaceId], queryFn: async () => [] }),
    cross: (id: string, done: boolean) => cross(id, done),
    refreshAll: () => refreshAll(),
  },
}));

const space = (id: string, slug: string, kind: 'personal' | 'team'): SpaceSummary => ({
  id,
  kind,
  name: kind === 'personal' ? 'Personal' : 'Northwind',
  color: null,
  role: 'admin',
  slug,
  prefix: 'XX',
  members: 2,
  inbox: { toAnswer: 0, unread: 0 },
});
const ME = {
  user: { id: 'u', name: 'Rohit', email: 'r@example.com', color: null, image: null },
  spaces: [space('n', 'northwind', 'team'), space('p', 'me', 'personal')],
} as unknown as MeResponse;

let fake: DesktopFake;
const emit = (event: string) =>
  act(() => {
    for (const fn of fake.listeners?.[event] ?? []) fn(undefined);
  });
const calls = (name: string) => fake.calls.filter((c) => c.name === name).map((c) => c.args);

function mount(me: MeResponse | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <MenuBarPage me={me} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  fake = { window: 'menubar', calls: [] };
  window.__tuduDesktopFake = fake;
  resetDesktop();
  live.mockReset();
  cross.mockReset();
  refreshAll.mockReset();
  refreshMe.mockReset();
  refreshMe.mockResolvedValue(ME);
});

describe('C20-U04 the menu bar page', () => {
  it('C20-U04 a tick goes to the outbox once and the row stays where it is', async () => {
    const user = userEvent.setup();
    mount(ME);
    const list = await screen.findByRole('list', { name: 'Today in Personal' });
    // Northwind has only someone else's task today: it is left out, so Personal is one plain list.
    expect(screen.queryByText('Someone else’s')).toBeNull();
    expect(screen.getAllByRole('list')).toHaveLength(1);
    await user.click(within(list).getByRole('checkbox', { name: 'Book the dentist' }));
    expect(cross).toHaveBeenCalledTimes(1);
    expect(cross).toHaveBeenCalledWith('t1', true);
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((r) => r.textContent),
    ).toEqual([expect.stringContaining('Book the dentist'), expect.stringContaining('Send the invoice')]);
  });

  it('C20-U04 a title asks the app to open the task on the desk; the foot asks for the rest', async () => {
    const user = userEvent.setup();
    mount(ME);
    await user.click(await screen.findByRole('button', { name: 'Open Send the invoice in Tudu' }));
    expect(calls('openTask')).toEqual([['/me?task=ME-2']]);
    await user.click(screen.getByRole('button', { name: /^New task/ }));
    expect(calls('summon')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Open Tudu Test' }));
    expect(calls('showMain')).toEqual([[null]]);
    await user.keyboard('{Escape}');
    expect(calls('hideMenubar')).toHaveLength(1);
  });

  it('C20-U04 the stream opens on show and closes on hide; showing reads the day again', async () => {
    mount(ME);
    await screen.findByRole('list', { name: 'Today in Personal' });
    expect(live).toHaveBeenLastCalledWith(true);
    emit('menubar:hidden');
    expect(live).toHaveBeenLastCalledWith(false);
    emit('menubar:shown');
    expect(live).toHaveBeenLastCalledWith(true);
    expect(refreshAll).toHaveBeenCalledTimes(1);
    expect(refreshMe).toHaveBeenCalledTimes(1);
  });

  it('C20-U04 signed out: no stream, the sentence and Open Tudu', async () => {
    mount(null);
    expect(await screen.findByText('Sign in to see your day.')).toBeInTheDocument();
    expect(live).not.toHaveBeenCalledWith(true);
  });
});

describe('MC-U06 the Inbox line in the menu bar page', () => {
  it('MC-U06 what is new in the Inbox shows under the heading; it opens the desk on the Inbox and nothing else', async () => {
    const user = userEvent.setup();
    const withNew = {
      ...ME,
      spaces: [{ ...ME.spaces[0]!, inbox: { toAnswer: 1, unread: 1 } }, ME.spaces[1]!],
    } as unknown as MeResponse;
    mount(withNew);
    await user.click(await screen.findByRole('button', { name: '2 new in your Inbox, open the Inbox' }));
    expect(calls('showMain')).toEqual([['/inbox']]);
    expect(calls('openTask')).toEqual([]);
  });

  it('MC-U06 nothing new: no line', async () => {
    mount(ME);
    await screen.findByRole('list', { name: 'Today in Personal' });
    expect(screen.queryByRole('button', { name: /new in your Inbox/ })).toBeNull();
  });
});

describe('C20-U21 the menu bar sheet follows the theme picked on the desk', () => {
  const html = document.documentElement;
  const real = window.matchMedia;
  let systemDark = false;
  const schemeListeners = new Set<() => void>();
  beforeEach(() => {
    resetThemeForTests();
    localStorage.clear();
    html.className = '';
    delete html.dataset.motion;
    systemDark = false;
    schemeListeners.clear();
    window.matchMedia = ((query: string) => ({
      media: query,
      get matches() {
        return query.includes('prefers-color-scheme: dark') && systemDark;
      },
      addEventListener: (_t: string, cb: () => void) => schemeListeners.add(cb),
      removeEventListener: (_t: string, cb: () => void) => schemeListeners.delete(cb),
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
    resetThemeForTests();
    localStorage.clear();
    html.className = '';
    delete html.dataset.motion;
  });

  it('C20-U21 a pick heard live paints it; one made while hidden is painted on show; System follows macOS', async () => {
    localStorage.setItem('tudu.theme', 'light');
    mount(ME);
    await screen.findByRole('list', { name: 'Today in Personal' });
    expect(html).not.toHaveClass('dark');

    // Dark on the desk: the shared storage tells this window.
    localStorage.setItem('tudu.theme', 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tudu.theme', newValue: 'dark' }));
    });
    expect(html).toHaveClass('dark');

    // Light on the desk while the sheet was away and heard nothing: the show reads it again.
    emit('menubar:hidden');
    localStorage.setItem('tudu.theme', 'light');
    emit('menubar:shown');
    expect(html).not.toHaveClass('dark');

    // System, with macOS dark; then macOS turns light with no word from the desk.
    emit('menubar:hidden');
    systemDark = true;
    localStorage.setItem('tudu.theme', 'system');
    emit('menubar:shown');
    expect(html).toHaveClass('dark');
    act(() => {
      systemDark = false;
      schemeListeners.forEach((cb) => cb());
    });
    expect(html).not.toHaveClass('dark');

    // The desk keeps the app's look; the sheet never sends it.
    expect(calls('setAppearance')).toEqual([]);
  });

  it('C20-U22 Less motion: heard live, and taken up on show when it was missed', async () => {
    mount(ME);
    await screen.findByRole('list', { name: 'Today in Personal' });
    expect(html.dataset.motion).toBeUndefined();
    localStorage.setItem('tudu.motion', 'less');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tudu.motion', newValue: 'less' }));
    });
    expect(html.dataset.motion).toBe('less');

    emit('menubar:hidden');
    localStorage.removeItem('tudu.motion');
    emit('menubar:shown');
    expect(html.dataset.motion).toBeUndefined();
  });
});
