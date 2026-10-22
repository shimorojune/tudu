import '@testing-library/jest-dom/vitest';
import type { GettingStarted, SpaceSummary } from '@tudu/core';
import { tickGettingStarted, type MeResponse } from '@tudu/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { resetThemeForTests, setThemeChoice, showToast } from '@tudu/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { greet } from '../routes/sign-in/SignInPage';
import { welcomeFor } from '../routes/today/TodayPage';
import { openQuickAdd } from './dayView';
import {
  doneOf,
  FOLD_KEY,
  GettingStartedHost,
  hideGettingStarted,
  phoneCardShows,
  resetFirstRunForTests,
  YOURE_SET_MS,
} from './firstRun';
import { openApps } from './jira';
import { api, queryClient } from './session';

vi.mock('@tudu/ui', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));
vi.mock('./dayView', async (orig) => ({ ...(await orig<Record<string, unknown>>()), openQuickAdd: vi.fn() }));
vi.mock('./jira', async (orig) => ({ ...(await orig<Record<string, unknown>>()), openApps: vi.fn() }));
const navigate = vi.fn();
let location = { pathname: '/me', searchStr: '' };
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: { location: typeof location }) => unknown }) =>
    select({ location }),
}));

const PERSONAL: SpaceSummary = {
  id: 'p',
  kind: 'personal',
  name: 'Personal',
  color: null,
  role: 'admin',
  slug: 'me',
  prefix: 'ME',
  members: 1,
  inbox: { toAnswer: 0, unread: 0 },
};
const none = { name: false, task: false, theme: false, jira: false };

function meWith(gs: GettingStarted, name = ''): MeResponse {
  return {
    user: {
      id: 'u',
      email: 'rohit@x.y',
      name,
      image: null,
      color: null,
      createdAt: '2026-10-22T09:00:00.000Z',
    },
    firstSignIn: true,
    spaces: [PERSONAL],
    gettingStarted: gs,
  };
}

let post: { mock: { calls: unknown[][] } } & ReturnType<typeof vi.fn>;
beforeEach(() => {
  queryClient.clear();
  resetFirstRunForTests();
  resetThemeForTests();
  localStorage.clear();
  navigate.mockClear();
  vi.mocked(showToast).mockClear();
  vi.mocked(openQuickAdd).mockClear();
  vi.mocked(openApps).mockClear();
  location = { pathname: '/me', searchStr: '' };
  post = vi.spyOn(api, 'post').mockResolvedValue({}) as unknown as typeof post;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function show(me: MeResponse, vp: 'desktop' | 'phone' = 'desktop') {
  queryClient.setQueryData(['me'], me);
  return render(
    <QueryClientProvider client={queryClient}>
      <GettingStartedHost me={me} space={PERSONAL} vp={vp} />
    </QueryClientProvider>,
  );
}
/** The query cache tells its watchers on the next tick. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 5)));
const row = (name: RegExp) => screen.getByRole('button', { name });
const count = () => document.querySelector('.tp-gs-n')!.textContent;

describe('C12-U03 Getting started in the web app', () => {
  it('reads the rows from /api/me, a saved name and the ticks this browser makes', async () => {
    show(meWith({ open: true, done: { ...none, jira: true } }, 'Rohit Raj'));
    expect(count()).toBe('2 of 4');
    expect(row(/Add your name and photo/)).toHaveClass('tp-done');
    expect(row(/Bring your Jira issues/)).toHaveClass('tp-done');
    // Writing a task (any way in: the task store ticks it) and connecting Jira tick at once.
    tickGettingStarted(queryClient, 'task');
    await settle();
    expect(count()).toBe('3 of 4');
    expect(row(/Write your first task/)).toHaveClass('tp-done');
    expect(doneOf(meWith({ open: true, done: none }, ' '))!.name).toBe(false);
  });

  it('each row is a way in: Account, Quick Add, Appearance, Apps; phones go to their pages', () => {
    const v = show(meWith({ open: true, done: none }));
    fireEvent.click(row(/Add your name and photo/));
    expect(navigate).toHaveBeenLastCalledWith({ href: '/me?settings=account' });
    fireEvent.click(row(/Write your first task/));
    expect(openQuickAdd).toHaveBeenCalledTimes(1);
    fireEvent.click(row(/Pick light or dark/));
    expect(navigate).toHaveBeenLastCalledWith({ href: '/me?settings=appearance' });
    fireEvent.click(row(/Bring your Jira issues/));
    expect(openApps).toHaveBeenCalledTimes(1);
    v.unmount();

    localStorage.setItem(FOLD_KEY, 'open');
    show(meWith({ open: true, done: none }), 'phone');
    fireEvent.click(row(/Add your name and photo/));
    expect(navigate).toHaveBeenLastCalledWith({ href: '/me/settings/account' });
    fireEvent.click(row(/Pick light or dark/));
    expect(navigate).toHaveBeenLastCalledWith({ href: '/me/settings/appearance' });
    fireEvent.click(row(/Bring your Jira issues/));
    expect(navigate).toHaveBeenLastCalledWith({ href: '/me/apps' });
  });

  it('a theme pick anywhere ticks its row and tells the server once', async () => {
    show(meWith({ open: true, done: none }));
    act(() => setThemeChoice('dark'));
    await settle();
    expect(row(/Pick light or dark/)).toHaveClass('tp-done');
    act(() => setThemeChoice('light'));
    await settle();
    expect(post.mock.calls.filter((c) => c[0] === '/api/me/getting-started')).toEqual([
      ['/api/me/getting-started', { theme: true }],
    ]);
  });

  it('the fourth tick says You’re set, then the card goes after 1.8s and the server hears it once', async () => {
    vi.useFakeTimers();
    show(meWith({ open: true, done: { name: true, task: true, theme: true, jira: false } }));
    // The query cache tells its watchers on the next tick.
    await act(async () => {
      tickGettingStarted(queryClient, 'jira');
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('You’re set')).toBeInTheDocument();
    expect(count()).toBe('4 of 4');
    await act(async () => vi.advanceTimersByTime(YOURE_SET_MS - 10));
    expect(post).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(20));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/me/getting-started', { hidden: true });
    expect(document.querySelector('.tp-gs')).toHaveClass('tp-leaving');
    await act(async () => vi.advanceTimersByTime(300));
    expect(document.querySelector('.tp-gs')).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('× hides it for good, tells the server and says where everything went', async () => {
    vi.useFakeTimers();
    show(meWith({ open: true, done: none }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(showToast).toHaveBeenCalledWith('Hidden. Everything it pointed to is in Settings.');
    expect(post).toHaveBeenCalledWith('/api/me/getting-started', { hidden: true });
    await act(async () => vi.advanceTimersByTime(300));
    expect(document.querySelector('.tp-gs')).toBeNull();
    expect(queryClient.getQueryData<MeResponse>(['me'])!.gettingStarted!.open).toBe(false);
    // The tests' quiet hide says nothing.
    vi.mocked(showToast).mockClear();
    await hideGettingStarted();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a hidden or finished card never mounts', () => {
    show(meWith({ open: false, done: { ...none, task: true } }));
    expect(document.querySelector('.tp-gs')).toBeNull();
  });

  it('the fold is remembered per browser; phones start folded', () => {
    const v = show(meWith({ open: true, done: none }), 'phone');
    const title = () => screen.getByRole('button', { name: /Getting started/ });
    expect(title()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(title());
    expect(localStorage.getItem(FOLD_KEY)).toBe('open');
    v.unmount();
    const w = show(meWith({ open: true, done: none }));
    expect(title()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(title());
    expect(localStorage.getItem(FOLD_KEY)).toBe('folded');
    w.unmount();
    show(meWith({ open: true, done: none }));
    expect(title()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('C12-U04 Today’s welcome', () => {
  const NW: SpaceSummary = {
    ...PERSONAL,
    id: 'n',
    kind: 'team',
    name: 'Northwind',
    slug: 'northwind',
    members: 19,
  };

  it('Personal welcomes you by name while you are new, and offers the writing line', () => {
    expect(welcomeFor(PERSONAL, 'Rohit Raj', true)).toEqual({
      title: 'Welcome to Tudu, Rohit.',
      body: 'This is your day: one calm page. Write the first thing you want to get done; it stays here until you cross it off.',
      action: 'write',
    });
    expect(welcomeFor(PERSONAL, '', true)!.title).toBe('Welcome to Tudu.');
  });

  it('a space you joined says who is there; the plain day once the card is gone', () => {
    expect(welcomeFor({ ...NW, joined: { by: 'Meera Nair' } }, 'Rohit', true)).toEqual({
      title: 'Welcome to Northwind, Rohit.',
      body: 'Meera and 17 others are here. What you add in Northwind can be shared with them; Personal stays yours.',
      action: 'write',
    });
    expect(welcomeFor({ ...NW, members: 2, joined: { by: 'Meera' } }, '', true)!.body).toMatch(
      /^Meera is here\. /,
    );
    expect(welcomeFor({ ...NW, joined: { by: 'Meera' } }, 'Rohit', false)).toBeUndefined();
    expect(welcomeFor(PERSONAL, 'Rohit', false)).toBeUndefined();
    // A team space someone else made, not by invite (none such today): plain.
    expect(welcomeFor(NW, 'Rohit', true)).toBeUndefined();
  });

  it('the creator’s “It’s just you for now” is unchanged, new or not', () => {
    for (const fresh of [true, false])
      expect(welcomeFor({ ...NW, members: 1 }, 'Rohit', fresh)).toEqual({
        title: 'Welcome to Northwind.',
        body: 'It’s just you for now. Invite the people you work with, or write the first thing for the team.',
        action: 'invite',
      });
  });
});

describe('C12-U05 sign in, joining and phones', () => {
  it('an account made by this sign in lands quietly; any other is welcomed back by name', () => {
    greet(meWith({ open: true, done: none }, 'Rohit Raj'));
    expect(showToast).not.toHaveBeenCalled();
    const back = { ...meWith({ open: false, done: none }, 'Rohit Raj'), firstSignIn: false };
    greet(back);
    expect(showToast).toHaveBeenLastCalledWith('Welcome back, Rohit.');
    greet({ ...back, user: { ...back.user, name: '' } });
    expect(showToast).toHaveBeenLastCalledWith('Welcome back.');
    greet(null);
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('the phone card steps aside on pages without tabs', () => {
    expect(phoneCardShows({ pathname: '/me', searchStr: '' })).toBe(true);
    expect(phoneCardShows({ pathname: '/me/week', searchStr: '' })).toBe(true);
    expect(phoneCardShows({ pathname: '/northwind/inbox', searchStr: '' })).toBe(true);
    expect(phoneCardShows({ pathname: '/me/more', searchStr: '' })).toBe(true);
    expect(phoneCardShows({ pathname: '/me/settings/account', searchStr: '' })).toBe(false);
    expect(phoneCardShows({ pathname: '/me/jira', searchStr: '' })).toBe(false);
    expect(phoneCardShows({ pathname: '/me/apps', searchStr: '' })).toBe(false);
    expect(phoneCardShows({ pathname: '/me', searchStr: '?task=ME-1' })).toBe(false);

    location = { pathname: '/me/settings', searchStr: '' };
    show(meWith({ open: true, done: none }), 'phone');
    expect(document.querySelector('.tp-gs')).toBeNull();
  });
});
