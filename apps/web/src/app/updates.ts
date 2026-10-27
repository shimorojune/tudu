import {
  RELEASES_URL,
  releaseUrl,
  checkedWords,
  inboxBadge,
  notesHtml,
  readyText,
  sumCounts,
  whenWords,
  type InboxCounts,
} from '@tudu/core';
import { showToast, type InboxEntry, type SettingsUpdates } from '@tudu/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppInfo, DesktopBridge, UpdateReady, UpdateStatus } from './desktop';

/** The app asks for a newer version on launch and then this often. */
export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const READ_KEY = 'tudu.update.read';
const HIDDEN_KEY = 'tudu.update.hidden';

/**
 * The version that is downloaded and ready, and which versions you have read: the Updates item in every space's
 * Inbox. The ready version lives in the app (it is asked again on every launch); read is kept per version on the Mac.
 */
export class UpdateStore {
  private ready: UpdateReady | null = null;
  private readList: string[] = [];
  private hiddenList: string[] = [];
  private listeners = new Set<() => void>();
  private snap: { ready: UpdateReady | null; unread: boolean; hidden: boolean } = {
    ready: null,
    unread: false,
    hidden: false,
  };

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    this.readList = this.load();
    this.hiddenList = this.load(HIDDEN_KEY);
    this.snapshot();
  }

  private load(key = READ_KEY): string[] {
    try {
      const v = JSON.parse(this.storage?.getItem(key) ?? '[]') as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private snapshot() {
    const r = this.ready;
    const hidden = !!r && this.hiddenList.includes(r.version);
    this.snap = { ready: r, unread: !!r && !hidden && !this.readList.includes(r.version), hidden };
    for (const l of this.listeners) l();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.snap;

  setReady(ready: UpdateReady | null) {
    if (ready?.version === this.ready?.version && ready?.notes === this.ready?.notes) return;
    this.ready = ready;
    this.snapshot();
  }

  isRead(version: string): boolean {
    return this.readList.includes(version);
  }

  markRead(version: string) {
    if (this.readList.includes(version)) return;
    this.readList = [...this.readList, version].slice(-20);
    try {
      this.storage?.setItem(READ_KEY, JSON.stringify(this.readList));
    } catch {
      /* fine: read again next launch */
    }
    this.snapshot();
  }

  /** Mark as unread, from the Inbox row. */
  markUnread(version: string) {
    if (!this.readList.includes(version)) return;
    this.readList = this.readList.filter((v) => v !== version);
    this.save(READ_KEY, this.readList);
    this.snapshot();
  }

  /** Deleted from the Inbox (or cleared): this version's item stays away; `false` puts it back (Undo). */
  hide(version: string, on = true) {
    const has = this.hiddenList.includes(version);
    if (on === has) return;
    this.hiddenList = on
      ? [...this.hiddenList, version].slice(-20)
      : this.hiddenList.filter((v) => v !== version);
    this.save(HIDDEN_KEY, this.hiddenList);
    this.snapshot();
  }

  private save(key: string, list: string[]) {
    try {
      this.storage?.setItem(key, JSON.stringify(list));
    } catch {
      /* fine: it lasts until the next launch */
    }
  }

  /** Another window of the app marked it read. */
  reload() {
    this.readList = this.load();
    this.hiddenList = this.load(HIDDEN_KEY);
    this.snapshot();
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const updateStore = new UpdateStore();

export function useUpdate() {
  return useSyncExternalStore(updateStore.subscribe, updateStore.get, updateStore.get);
}

/**
 * Check on launch and every four hours, never two at once. A check that finds a newer version answers once it is
 * downloaded and verified; a failed check or download shows nothing and is tried at the next one.
 */
export function startUpdates(
  bridge: Pick<DesktopBridge, 'checkUpdate'>,
  store: Pick<UpdateStore, 'setReady'> = updateStore,
  every = CHECK_EVERY_MS,
): () => void {
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const ready = await bridge.checkUpdate();
      if (ready) store.setReady(ready);
    } catch {
      /* nothing shows; the next check tries again */
    } finally {
      busy = false;
    }
  };
  void check();
  const t = setInterval(() => void check(), every);
  return () => clearInterval(t);
}

/** Restart to update: the app relaunches on the new version; when it cannot, a toast says what to do. */
export async function restartToUpdate(bridge: Pick<DesktopBridge, 'installUpdate'>, name: string) {
  try {
    await bridge.installUpdate();
  } catch (err) {
    showToast(`Couldn’t restart. Quit and open ${name} again to finish.`);
    throw err;
  }
}

/**
 * The Inbox's count across every space (the top bar's pip, the phone's and the dock badge): requests to answer and
 * unread updates, plus the Mac app's new version once. Without the server's total the spaces' counts are added up.
 */
export function inboxTotal(
  me: { inbox?: InboxCounts; spaces: Array<{ inbox?: InboxCounts }> },
  update = false,
): number {
  return inboxBadge(me.inbox ?? sumCounts(me.spaces.map((s) => s.inbox))) + (update ? 1 : 0);
}

/** The Updates item for a version that is ready. */
export function appEntry(
  ready: UpdateReady,
  unread: boolean,
  now: Date,
  name = 'Tudu',
  arrived: string = now.toISOString(),
): InboxEntry {
  return {
    id: appItemId(ready.version),
    kind: 'app',
    who: name === 'Tudu' ? undefined : { name, initials: 'T' },
    when: whenWords(ready.date ?? arrived, now),
    unread,
    text: readyText(ready.version),
    quote: notesHtml(ready.notes) || undefined,
    task: { title: '' },
  };
}

export const appItemId = (version: string) => `app-${version}`;

/** What's new: the ready version's release on GitHub, for the app's own track; none for Tudu Test and dev builds. */
export function notesHref(
  info: Pick<AppInfo, 'track'> | null,
  ready: Pick<UpdateReady, 'version'> | null,
): string | null {
  return info && ready ? releaseUrl(info.track, ready.version) : null;
}
export const isAppItem = (id: string | null | undefined) => !!id && id.startsWith('app-');

/**
 * Where the app's updater stands, for Settings › This Mac and the menu bar's ⋯: asked once, then followed through
 * `update:status`. `supported` is null until the app answers and false from an app too old to say.
 */
export function useUpdateStatus(bridge: Pick<DesktopBridge, 'updateStatus' | 'on'> | null): {
  supported: boolean | null;
  status: UpdateStatus | null;
} {
  const [state, setState] = useState<{ supported: boolean | null; status: UpdateStatus | null }>({
    supported: bridge ? null : false,
    status: null,
  });
  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.updateStatus().then(
      (status) => live && setState((s) => (s.status ? s : { supported: !!status, status })),
      () => live && setState({ supported: false, status: null }),
    );
    const stop = bridge.on('update:status', (status) => {
      if (live && status && typeof status === 'object')
        setState({ supported: true, status: status as UpdateStatus });
    });
    return () => {
      live = false;
      stop();
    };
  }, [bridge]);
  return state;
}

/** Check now's failure, as the row says it. */
export const CHECK_FAILED = 'Couldn’t check for updates. Check your connection and try again.';
/** The download failed. */
export const downloadFailed = (name: string, version: string) =>
  `Couldn’t download ${name} ${version}. Check your connection and try again.`;
/** The download didn't pass its safety check (signed with another key): retrying can't fix it. */
export const signatureFailed = (name: string, version: string) =>
  `${name} ${version} didn’t pass its safety check, so it wasn’t installed. Download it from the Tudu website instead.`;

/** The last check's failure is one retrying can't fix: Get it from the website, in place of Try again. */
export function needsWebsite(status: UpdateStatus | null): boolean {
  return !!status && !status.ready && status.lastResult === 'error' && status.errorKind === 'signature';
}

/** Where Get it from the website goes: the release the failed version belongs to, else the latest release. */
export function releasePage(track: AppInfo['track'] | undefined, version: string | null | undefined): string {
  return (track && releaseUrl(track, version ?? '')) || `${RELEASES_URL}/latest`;
}

/**
 * This Mac › Updates from the updater's state. A failure shows only after Check now (an automatic check's failure
 * leaves the row as it was: the next check tries again), except a refused safety check, which shows whoever checked.
 */
export function updatesRow(
  status: UpdateStatus | null,
  app: { name: string; version: string },
  now: Date,
): Omit<SettingsUpdates, 'onCheck' | 'onRestart' | 'restartError'> {
  const base = { name: app.name, current: app.version };
  if (!status) return { ...base, state: 'loading' };
  if (status.downloading) {
    const { version, received, total } = status.downloading;
    return { ...base, state: 'downloading', version, progress: total ? Math.min(1, received / total) : 0 };
  }
  if (status.checking) return { ...base, state: 'checking' };
  if (status.ready) return { ...base, state: 'ready', version: status.ready.version };
  if (needsWebsite(status))
    return { ...base, state: 'error', error: signatureFailed(app.name, status.errorVersion ?? '') };
  if (status.lastResult === 'error' && status.lastManual)
    return {
      ...base,
      state: 'error',
      error:
        status.errorKind === 'download' && status.errorVersion
          ? downloadFailed(app.name, status.errorVersion)
          : CHECK_FAILED,
    };
  if (!status.lastCheck || status.lastResult === null) return { ...base, state: 'never' };
  return { ...base, state: 'idle', checked: checkedWords(status.lastCheck, now) };
}
