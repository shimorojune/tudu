import { useRouterState } from '@tanstack/react-router';
import { ApiError } from '@tudu/client';
import {
  feedbackDetails,
  feedbackDetailsLine,
  type FeedbackDetails,
  type FeedbackKind,
  type FeedbackReport,
  type SpaceSummary,
} from '@tudu/core';
import { FeedbackDialog, showToast, type FeedbackPhase } from '@tudu/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { desktop, type AppInfo } from './desktop';
import { api } from './session';
import { viewOf } from './space';
import type { Viewport } from './viewport';

/** The version this build is: the release's, set by Vite from package.json. */
export const APP_VERSION: string = (import.meta.env.VITE_TUDU_VERSION as string | undefined) ?? '0.0.0';

/** "Sent" shows this long before the dialog goes. */
export const SENT_MS = 650;
const THANKS_MS = 4000;

// ---------------------------------------------------------------------------------------------------------------
// The draft: kept while the dialog is closed, so closing with words in it loses nothing (as Quick Add does).

export interface FeedbackDraft {
  kind: FeedbackKind;
  text: string;
  shot: File | null;
}

const EMPTY: FeedbackDraft = { kind: 'bug', text: '', shot: null };
let open = false;
let draft: FeedbackDraft = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openFeedback(): void {
  open = true;
  emit();
}
export function closeFeedback(): void {
  open = false;
  emit();
}
export function setFeedbackDraft(next: Partial<FeedbackDraft>): void {
  draft = { ...draft, ...next };
  emit();
}
export function clearFeedbackDraft(): void {
  draft = EMPTY;
  emit();
}
export function useFeedback(): { open: boolean; draft: FeedbackDraft } {
  const o = useSyncExternalStore(subscribe, () => open);
  const d = useSyncExternalStore(subscribe, () => draft);
  return { open: o, draft: d };
}

// ---------------------------------------------------------------------------------------------------------------
// "Include app details": on by default, and this device remembers the last choice.

const DETAILS_KEY = 'tudu.feedback.details';

export function readDetailsChoice(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function writeDetailsChoice(on: boolean): void {
  try {
    localStorage.setItem(DETAILS_KEY, on ? 'on' : 'off');
  } catch {
    /* fine: it lasts for this visit */
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The queue: a report sent offline waits here with its screenshot and goes by itself when the connection is back.
// Its own small store, not the sync outbox: a report is a one-way send with a file, not a change to apply.

export interface QueuedReport {
  report: FeedbackReport;
  shot: { blob: Blob; name: string; type: string } | null;
}

export interface FeedbackStore {
  all(): Promise<QueuedReport[]>;
  put(r: QueuedReport): Promise<void>;
  remove(id: string): Promise<void>;
}

export class MemoryFeedbackStore implements FeedbackStore {
  private items = new Map<string, QueuedReport>();
  async all() {
    return [...this.items.values()];
  }
  async put(r: QueuedReport) {
    this.items.set(r.report.id, r);
  }
  async remove(id: string) {
    this.items.delete(id);
  }
}

/** Keeps waiting reports in IndexedDB (the screenshot as a Blob), so a reload or a closed laptop loses none. */
export class IndexedDbFeedbackStore implements FeedbackStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('tudu-feedback', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('reports', { keyPath: 'report.id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction('reports', mode);
      const req = fn(t.objectStore('reports'));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('The report was not kept.'));
    });
  }
  all() {
    return this.tx('readonly', (s) => s.getAll() as IDBRequest<QueuedReport[]>);
  }
  async put(r: QueuedReport) {
    await this.tx('readwrite', (s) => s.put(r));
  }
  async remove(id: string) {
    await this.tx('readwrite', (s) => s.delete(id));
  }
}

/** The request: the report's JSON and the screenshot, as form data. */
export async function postReport(q: QueuedReport): Promise<void> {
  const form = new FormData();
  form.set('report', JSON.stringify(q.report));
  if (q.shot) form.set('screenshot', new File([q.shot.blob], q.shot.name, { type: q.shot.type }));
  await api.upload('/api/feedback', form);
}

/** A failure that a later try can fix: no connection, or the server down or busy. */
function worthRetrying(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500 || err.status === 429;
}

export class FeedbackQueue {
  private flushing: Promise<void> | null = null;
  constructor(
    private readonly store: FeedbackStore,
    private readonly send: (q: QueuedReport) => Promise<void> = postReport,
  ) {}

  /** Send now when online; otherwise (or when the connection fails on the way) keep it for later. */
  async submit(q: QueuedReport, online = navigator.onLine): Promise<'sent' | 'queued'> {
    if (!online) {
      await this.store.put(q);
      return 'queued';
    }
    try {
      await this.send(q);
      return 'sent';
    } catch (err) {
      if (!worthRetrying(err)) throw err;
      await this.store.put(q);
      return 'queued';
    }
  }

  /** Send what waits, oldest first; stop at the first failure that a later try can fix. */
  flush(): Promise<void> {
    this.flushing ??= (async () => {
      try {
        for (const q of await this.store.all()) {
          try {
            await this.send(q);
          } catch (err) {
            if (worthRetrying(err)) return;
            // The server refused it for good (too long, not an image): keeping it would retry forever.
          }
          await this.store.remove(q.report.id);
        }
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }
}

let queue: FeedbackQueue | null = null;
export function feedbackQueue(): FeedbackQueue {
  queue ??= new FeedbackQueue(
    typeof indexedDB === 'undefined' ? new MemoryFeedbackStore() : new IndexedDbFeedbackStore(),
  );
  return queue;
}
/** Tests: a queue of their own. */
export function setFeedbackQueue(q: FeedbackQueue | null): void {
  queue = q;
}

// ---------------------------------------------------------------------------------------------------------------

/** The details as they go, built from what is listed and nothing else (see feedbackDetails). */
export function currentDetails(
  view: string,
  spaceKind: SpaceSummary['kind'] | null,
  app: AppInfo | null,
): FeedbackDetails {
  return feedbackDetails({
    app: app ? { name: app.name, track: app.track } : undefined,
    version: app?.version ?? APP_VERSION,
    userAgent: navigator.userAgent,
    view,
    spaceKind,
    width: window.innerWidth,
    height: window.innerHeight,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  });
}

/**
 * Send feedback over whatever page you are on: from the avatar menu, the phone's More, or the menu bar's ⋯ (which
 * brings the window forward first). Reports waiting from an offline send go when the connection is back.
 */
export function FeedbackHost({ space, vp }: { space: Pick<SpaceSummary, 'kind'> | null; vp: Viewport }) {
  const { open: isOpen, draft: d } = useFeedback();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [details, setDetails] = useState(readDetailsChoice);
  const [phase, setPhase] = useState<FeedbackPhase>('idle');
  const [app, setApp] = useState<AppInfo | null>(null);

  useEffect(() => {
    const bridge = desktop();
    if (bridge) void bridge.info().then(setApp, () => {});
    const q = feedbackQueue();
    void q.flush();
    const online = () => void q.flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  // Each opening starts ready to send, with the draft as it was left.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setPhase('idle');
  }

  const view = viewOf(pathname);
  const line = feedbackDetailsLine(currentDetails(view, space?.kind ?? null, app));

  const send = async () => {
    setPhase('sending');
    const report: FeedbackReport = {
      id: crypto.randomUUID(),
      kind: d.kind,
      text: d.text.trim(),
      details: details ? currentDetails(view, space?.kind ?? null, app) : null,
    };
    const shot = d.shot ? { blob: d.shot, name: d.shot.name, type: d.shot.type } : null;
    let how: 'sent' | 'queued';
    try {
      how = await feedbackQueue().submit({ report, shot });
    } catch (err) {
      setPhase('idle');
      showToast(err instanceof Error && err.message ? err.message : 'Couldn’t send that. Try again.');
      return;
    }
    if (how === 'queued') {
      clearFeedbackDraft();
      closeFeedback();
      showToast('Saved. It sends when you’re back online.', { duration: THANKS_MS });
      return;
    }
    setPhase('sent');
    setTimeout(() => {
      clearFeedbackDraft();
      closeFeedback();
      showToast('Thanks. That’s with the Tudu team now.', { duration: THANKS_MS });
    }, SENT_MS);
  };

  return (
    <FeedbackDialog
      open={isOpen}
      onClose={closeFeedback}
      kind={d.kind}
      onKind={(kind) => setFeedbackDraft({ kind })}
      text={d.text}
      onText={(text) => setFeedbackDraft({ text })}
      shot={d.shot}
      onShot={(shot) => setFeedbackDraft({ shot })}
      details={details}
      onDetails={(on) => {
        setDetails(on);
        writeDetailsChoice(on);
      }}
      detailsLine={line}
      phase={phase}
      onSend={() => void send()}
      variant={vp === 'phone' ? 'sheet' : 'dialog'}
    />
  );
}
