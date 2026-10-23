import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { inboxBadge } from '@tudu/core';
import { useEffect, useState } from 'react';
import { desktop, FEEDBACK_GO, type AppInfo, type UpdateReady } from './desktop';
import { openFeedback } from './feedback';
import { interceptLinks } from './links';
import { meQuery } from './session';
import { startUpdates, updateStore, useUpdate } from './updates';

/**
 * The dock badge: the Inbox count (to answer plus new) across your spaces, and a version not read yet, once (it is
 * in every team space's Inbox; Personal has none).
 */
export function badgeCount(
  spaces: Array<{ kind: string; inbox: { toAnswer: number; unread: number } }>,
  update: boolean,
): number {
  const team = spaces.some((s) => s.kind === 'team');
  return spaces.reduce((n, s) => n + inboxBadge(s.inbox), 0) + (update && team ? 1 : 0);
}

let appInfo: AppInfo | null = null;
/** The app's name and track, once known ("Tudu" until then). */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState(appInfo);
  useEffect(() => {
    const d = desktop();
    if (!d || info) return;
    let live = true;
    void d.info().then((i) => {
      appInfo = i;
      if (live) setInfo(i);
    });
    return () => {
      live = false;
    };
  }, [info]);
  return info;
}

/**
 * The page's side of the macOS app, mounted once at the root (nothing on the web). Both windows hand links and
 * files to the app. The desk also tells the app who is signed in (so the summon knows which window to open),
 * follows its requests to show a page, checks for updates, and keeps the dock badge.
 */
export function DesktopHost() {
  const d = desktop();
  const navigate = useNavigate();
  const main = d?.window === 'main';
  const { data: me, isFetched } = useQuery({ ...meQuery, enabled: !!d && main });
  const update = useUpdate();

  useEffect(() => (d ? interceptLinks(d) : undefined), [d]);

  useEffect(() => {
    if (!d || !main || !isFetched) return;
    d.setSignedIn(!!me);
  }, [d, main, me, isFetched]);

  useEffect(() => {
    if (!d || !main) return;
    return d.on('go', (path) => {
      if (path === FEEDBACK_GO) openFeedback();
      else if (typeof path === 'string' && path.startsWith('/')) void navigate({ href: path });
    });
  }, [d, main, navigate]);

  useEffect(() => {
    if (!d || !main) return;
    const stop = startUpdates(d);
    const unready = d.on('update:ready', (ready) => {
      if (ready && typeof ready === 'object' && 'version' in ready)
        updateStore.setReady(ready as UpdateReady);
    });
    // Read in another window of the app (or another space's tab) counts here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'tudu.update.read') updateStore.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      stop();
      unready();
      window.removeEventListener('storage', onStorage);
    };
  }, [d, main]);

  const count = me ? badgeCount(me.spaces, update.unread) : 0;
  useEffect(() => {
    if (!d || !main || !isFetched) return;
    d.setBadge(count);
  }, [d, main, count, isFetched]);

  return null;
}
