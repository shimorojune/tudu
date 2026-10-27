import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { keepAppearance } from './appearance';
import { desktop, FEEDBACK_GO, UPDATES_GO, type AppInfo, type UpdateReady } from './desktop';
import { openFeedback } from './feedback';
import { interceptLinks } from './links';
import { meQuery } from './session';
import { settingsHref } from './settings';
import { inboxTotal, startUpdates, updateStore, useUpdate } from './updates';
import { appVersion } from './version';

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

/** The version for Settings: the Mac app's own once it answers (nothing until then), the build's on the web. */
export function useAppVersion(): ReturnType<typeof appVersion> | null {
  const info = useAppInfo();
  if (desktop() && !info) return null;
  return appVersion(info);
}

/**
 * The page's side of the macOS app, mounted once at the root (nothing on the web). Both windows hand links and
 * files to the app. The desk also tells the app who is signed in (so the summon knows which window to open),
 * follows its requests to show a page, checks for updates, and keeps the dock badge.
 */
export function DesktopHost() {
  const d = desktop();
  const navigate = useNavigate();
  const router = useRouter();
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
      // Settings › This Mac over the page the desk is on; the sheet already started the check.
      else if (path === UPDATES_GO)
        void navigate({ href: settingsHref(router.state.location, '', 'mac', false) });
      else if (typeof path === 'string' && path.startsWith('/')) void navigate({ href: path });
    });
  }, [d, main, navigate, router]);

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

  // The app keeps Settings › Appearance and Less motion for its windows (the desk tells it for all of them).
  useEffect(() => (d && main ? keepAppearance(d) : undefined), [d, main]);

  // The dock badge is the Inbox's count, the same as the top bar's.
  const count = me ? inboxTotal(me, update.unread) : 0;
  useEffect(() => {
    if (!d || !main || !isFetched) return;
    d.setBadge(count);
  }, [d, main, count, isFetched]);

  return null;
}
