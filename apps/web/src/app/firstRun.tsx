import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  allDone,
  GETTING_STARTED_HIDDEN,
  GETTING_STARTED_STEPS,
  GETTING_STARTED_WORDS,
  type GettingStarted as GettingStartedState,
  type GettingStartedDone,
  type GettingStartedRecord,
  type GettingStartedStep,
  type SpaceSummary,
} from '@tudu/core';
import { tickGettingStarted, type MeResponse } from '@tudu/client';
import { GettingStarted, onThemeChoice, showToast, type GettingStartedItem } from '@tudu/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { openQuickAdd } from './dayView';
import { openApps } from './jira';
import { api, meQuery, queryClient } from './session';
import { settingsHref } from './settings';
import { spacePath, viewOf } from './space';
import type { Viewport } from './viewport';

/** "You're set" stays this long before the card eases away. */
export const YOURE_SET_MS = 1800;
/** The fold, per browser. */
export const FOLD_KEY = 'tudu.gettingStarted';

// This browser closed the card (× or the fourth tick); the server hears it too, but the card goes at once.
let closed = false;
const told = new Set<'theme' | 'hidden'>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());

function patchMe(fn: (gs: GettingStartedState) => GettingStartedState): void {
  const me = queryClient.getQueryData<MeResponse | null>(['me']);
  if (me?.gettingStarted)
    queryClient.setQueryData<MeResponse>(['me'], { ...me, gettingStarted: fn(me.gettingStarted) });
}

/** Tell the server once per page: a theme was picked, or the card was hidden or finished. */
async function tell(rec: GettingStartedRecord): Promise<void> {
  const key = 'theme' in rec ? 'theme' : 'hidden';
  if (told.has(key)) return;
  told.add(key);
  try {
    await api.post('/api/me/getting-started', rec);
  } catch {
    // Not heard: the next pick or hide in this page tries again.
    told.delete(key);
  }
}

/** × (Hide), the end of "You're set", and the end-to-end tests' quiet sign in: the card goes, for good. */
export async function hideGettingStarted(opts: { toast?: boolean } = {}): Promise<void> {
  closed = true;
  notify();
  patchMe((gs) => ({ ...gs, open: false }));
  if (opts.toast) showToast(GETTING_STARTED_HIDDEN);
  await tell({ hidden: true });
}

/** A theme pick anywhere (Appearance, the avatar menu's switch) ticks "Pick light or dark". Both live in the shell. */
function onTheme(): void {
  const me = queryClient.getQueryData<MeResponse | null>(['me']);
  if (!me?.gettingStarted || me.gettingStarted.done.theme) return;
  tickGettingStarted(queryClient, 'theme');
  void tell({ theme: true });
}

if (typeof window !== 'undefined') {
  // For end-to-end tests: sign in with the card already hidden, the way × hides it, without the toast.
  const w = window as unknown as { __tudu?: Record<string, unknown> };
  w.__tudu = { ...w.__tudu, firstRun: { hide: () => hideGettingStarted() } };
}

/** For tests: a fresh page. */
export function resetFirstRunForTests(): void {
  closed = false;
  told.clear();
  notify();
}

/** The four rows as done: the server's record, with a name you just saved counted at once. */
export function doneOf(me: MeResponse): GettingStartedDone | null {
  const gs = me.gettingStarted;
  if (!gs) return null;
  return { ...gs.done, name: gs.done.name || !!me.user.name.trim() };
}

/** You are still new: the card is neither hidden nor finished. Today's welcome follows this. */
export function useFirstRunOpen(me: MeResponse | null | undefined): boolean {
  const here = useSyncExternalStore(
    subscribe,
    () => closed,
    () => closed,
  );
  return !here && !!me?.gettingStarted?.open;
}

function readFold(phone: boolean): boolean {
  try {
    const v = localStorage.getItem(FOLD_KEY);
    if (v === 'folded') return true;
    if (v === 'open') return false;
  } catch {
    /* fine */
  }
  return phone;
}

function storeFold(folded: boolean): void {
  try {
    localStorage.setItem(FOLD_KEY, folded ? 'folded' : 'open');
  } catch {
    /* fine */
  }
}

/** Phones keep the card beside New task, so it steps aside on the pages that have no tabs. */
export function phoneCardShows(at: { pathname: string; searchStr: string }): boolean {
  const view = viewOf(at.pathname);
  if (view === 'settings' || view === 'jira' || view === 'apps') return false;
  return !new URLSearchParams(at.searchStr).has('task');
}

/**
 * Getting started, in the corner of every page while you are new. Each row is a way in, ticked by doing the thing
 * (anywhere, by any way in). The fourth tick says "You're set" and the card eases away 1.8s later; × hides it.
 */
export function GettingStartedHost({
  me: shellMe,
  space,
  vp,
}: {
  me: MeResponse;
  space: SpaceSummary;
  vp: Viewport;
}) {
  const me = useQuery({ ...meQuery, initialData: shellMe }).data ?? shellMe;
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const phone = vp === 'phone';
  const here = useSyncExternalStore(
    subscribe,
    () => closed,
    () => closed,
  );
  const done = doneOf(me);
  const all = !!done && allDone(done);
  // Open when the page first sees you as new; "You're set" keeps it up after the server already counts it done.
  const [shown] = useState(() => !!me.gettingStarted?.open && !closed);
  const goneElsewhere = !!me.gettingStarted && !me.gettingStarted.open && !all;
  const open = shown && !here && !goneElsewhere;

  useEffect(() => onThemeChoice(onTheme), []);
  useEffect(() => {
    if (!open || !all) return;
    const t = setTimeout(() => void hideGettingStarted(), YOURE_SET_MS);
    return () => clearTimeout(t);
  }, [open, all]);

  if (!shown || !done) return null;
  if (phone && !phoneCardShows(loc)) return null;

  const go: Record<GettingStartedStep, () => void> = {
    name: () => void navigate({ href: settingsHref(loc, space.slug, 'account', phone) }),
    task: () => openQuickAdd(),
    theme: () => void navigate({ href: settingsHref(loc, space.slug, 'appearance', phone) }),
    jira: () => (phone ? void navigate({ href: spacePath(space.slug, 'apps') }) : openApps()),
  };
  const items: GettingStartedItem[] = GETTING_STARTED_STEPS.map((k) => ({
    key: k,
    ...GETTING_STARTED_WORDS[k],
    done: done[k],
    onDo: go[k],
  }));
  return (
    <GettingStarted
      items={items}
      open={open}
      phone={phone}
      collapsed={readFold(phone)}
      onCollapse={storeFold}
      onClose={() => void hideGettingStarted({ toast: true })}
    />
  );
}
