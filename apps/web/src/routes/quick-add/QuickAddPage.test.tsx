import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeResponse } from '@tudu/client';
import type { SpaceSummary } from '@tudu/core';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetThemeForTests } from '@tudu/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDesktop, type DesktopFake } from '../../app/desktop';
import type * as QuickAddModule from '../../app/quickAdd';
import { FloatingQuickAdd } from './QuickAddPage';

const save = vi.fn();
const usedSpace = vi.fn();
vi.mock('../../app/quickAdd', async (orig) => ({
  sendLine: (await orig<typeof QuickAddModule>()).sendLine,
  useSpacePeople: () => [],
  useQuickAddActions: (spaceId: string | undefined) => {
    usedSpace(spaceId);
    return {
      today: '2026-10-18',
      projects: [],
      online: true,
      save,
      newProject: () => undefined,
      upload: async () => ({ id: 'f', name: 'f', size: 1 }),
    };
  },
}));
vi.mock('../../app/live', () => ({ useLiveEvents: () => {} }));
vi.mock('../../app/workingDay', () => ({
  WorkingDayProvider: ({ children }: { children: unknown }) => children,
}));
const refreshMe = vi.fn();
vi.mock('../../app/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  refreshMe: () => refreshMe(),
}));

const space = (id: string, slug: string, kind: 'personal' | 'team'): SpaceSummary => ({
  id,
  kind,
  name: slug,
  color: null,
  role: 'admin',
  slug,
  prefix: 'XX',
  members: 1,
  inbox: { toAnswer: 0, unread: 0 },
});
const ME = {
  user: { id: 'u', name: 'Rohit', email: 'r@example.com', color: null, image: null },
  spaces: [space('p', 'me', 'personal'), space('n', 'northwind', 'team')],
} as unknown as MeResponse;

let fake: DesktopFake;
const emit = (event: string, payload?: unknown) =>
  act(() => {
    for (const fn of fake.listeners?.[event] ?? []) fn(payload);
  });
const hides = () => fake.calls.filter((c) => c.name === 'hideFloating').length;

function mount(me: MeResponse | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <FloatingQuickAdd me={me} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  fake = { window: 'floating', calls: [] };
  window.__tuduDesktopFake = fake;
  resetDesktop();
  save.mockReset();
  usedSpace.mockReset();
  refreshMe.mockReset();
  refreshMe.mockResolvedValue(ME);
  localStorage.clear();
  resetThemeForTests();
});

describe('C17-U04 the floating window says where', () => {
  it('starts on the space the desk was last on, Personal before any; the line can switch it; a summon reads it again', async () => {
    const user = userEvent.setup();
    mount(ME);
    const line = () => document.querySelector('.tp-qa-toline')!.textContent;
    expect(line()).toMatch(/^In.*me.*for.*Me/);
    expect(usedSpace).toHaveBeenLastCalledWith('p');
    await user.click(screen.getByRole('button', { name: 'Space: me' }));
    await user.click(screen.getByRole('menuitemradio', { name: /northwind/ }));
    expect(usedSpace).toHaveBeenLastCalledWith('n');
    localStorage.setItem('tudu.space', 'me');
    emit('floating:shown');
    await waitFor(() => expect(usedSpace).toHaveBeenLastCalledWith('p'));
    localStorage.setItem('tudu.space', 'northwind');
    emit('floating:shown');
    await waitFor(() => expect(line()).toMatch(/^In.*northwind.*for/));
  });
});

describe('C11-U05 the floating window', () => {
  it('Add task hides the window after the tick; the task goes to the last space’s Today', async () => {
    localStorage.setItem('tudu.space', 'northwind');
    const user = userEvent.setup();
    mount(ME);
    expect(usedSpace).toHaveBeenLastCalledWith('n');
    await user.type(screen.getByRole('textbox', { name: 'Task title' }), 'Call the venue');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call the venue', planned: '2026-10-18' }),
    );
    // Not at once: the tick shows first, then the window goes.
    expect(hides()).toBe(0);
    await waitFor(() => expect(hides()).toBe(1), { timeout: 2000 });
    // No toast in the app (the window is gone); the web page's note is not shown either.
    expect(screen.queryByText(/floats over whatever you are doing/)).toBeNull();
  });

  it('Esc closes a picker, then hides; a click outside the bar hides; the draft survives', async () => {
    const user = userEvent.setup();
    mount(ME);
    const title = screen.getByRole('textbox', { name: 'Task title' });
    await user.type(title, 'Draft stays');
    await user.click(screen.getByRole('button', { name: 'Choose a project' }));
    await user.keyboard('{Escape}');
    expect(hides()).toBe(0);
    await user.keyboard('{Escape}');
    expect(hides()).toBe(1);
    // The window is only hidden: the draft is there next time, and the line takes the keyboard on the summon.
    (document.activeElement as HTMLElement | null)?.blur();
    emit('floating:shown');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Task title' })),
    );
    expect((screen.getByRole('textbox', { name: 'Task title' }) as HTMLInputElement).value).toBe(
      'Draft stays',
    );
    // A click on the clear part around the bar.
    const bar = document.querySelector('.app-floating-bar')!;
    await user.pointer({ keys: '[MouseLeft]', target: bar });
    expect(hides()).toBe(2);
    // A click on the bar itself does not.
    await user.click(screen.getByRole('textbox', { name: 'Task title' }));
    expect(hides()).toBe(2);
  });

  it('with no session the desk is asked to show Sign in and the window shows nothing', async () => {
    refreshMe.mockResolvedValue(null);
    const { container } = mount(null);
    expect(container.querySelector('.app-floating')).toBeNull();
    emit('floating:shown');
    await waitFor(() => expect(fake.calls).toContainEqual({ name: 'showMain', args: ['/sign-in'] }));
  });
});

describe('C11-U09 the floating window follows the theme picked on the desk', () => {
  const painted = (c: HTMLElement) => c.querySelector('.tp-desk')?.getAttribute('data-theme');

  it('a pick made while the window is open repaints it; one made while it was hidden is taken up on the summon', async () => {
    localStorage.setItem('tudu.theme', 'light');
    const { container } = mount(ME);
    expect(painted(container)).toBe('light');

    // Dark on the desk, the bar open: the shared storage tells this window.
    localStorage.setItem('tudu.theme', 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tudu.theme', newValue: 'dark' }));
    });
    expect(painted(container)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Light on the desk while the bar was put away and heard nothing: the summon reads it again.
    localStorage.setItem('tudu.theme', 'light');
    emit('floating:shown');
    await waitFor(() => expect(painted(container)).toBe('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('C22-U27 the floating window opened by Make a task', () => {
  it('C22-U27 takes the seed once on the summon: words, note pill and Personal; the next summon is plain', async () => {
    localStorage.setItem('tudu.space', 'northwind');
    const user = userEvent.setup();
    mount(ME);
    const title = () => screen.getByRole('textbox', { name: 'Task title' }) as HTMLInputElement;
    expect(title().value).toBe('');
    fake.seed = {
      title: 'Call the venue',
      spaceId: 'p',
      from: { noteId: 'n1', name: 'Offsite agenda draft' },
    };
    emit('floating:shown');
    await waitFor(() => expect(title().value).toBe('Call the venue'));
    expect(document.querySelector('.tp-qa-from')?.textContent).toContain('Offsite agenda draft');
    expect(usedSpace).toHaveBeenLastCalledWith('p');
    expect(fake.seed).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Call the venue',
        from: { noteId: 'n1', name: 'Offsite agenda draft' },
      }),
    );
    await waitFor(() => expect(hides()).toBe(1), { timeout: 2000 });
    emit('floating:shown');
    await waitFor(() => expect(usedSpace).toHaveBeenLastCalledWith('n'));
    expect(title().value).toBe('');
    expect(document.querySelector('.tp-qa-from')).toBeNull();
  });
});
