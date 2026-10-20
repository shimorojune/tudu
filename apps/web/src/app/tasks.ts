import { IndexedDbOutboxStore, MemoryOutboxStore, TaskStore, type OutboxStore } from '@tudu/client';
import { showToast } from '@tudu/ui';
import { useSyncExternalStore } from 'react';
import { api, queryClient } from './session';

/** One id per open tab (kept across a reload of that tab), so a tab can tell its own changes on the live stream. */
function tabId(): string {
  try {
    const have = sessionStorage.getItem('tudu.client');
    if (have) return have;
    const id = crypto.randomUUID();
    sessionStorage.setItem('tudu.client', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function outboxStore(): OutboxStore {
  return typeof indexedDB === 'undefined' ? new MemoryOutboxStore() : new IndexedDbOutboxStore();
}

// Whether the server can be reached: the browser's own idea, and whether our last request got through.
let reachable = true;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const taskStore = new TaskStore({
  api,
  queryClient,
  store: outboxStore(),
  clientId: tabId(),
  onRejected: (message) => showToast(message),
  onReachable: (on) => {
    reachable = on;
    notify();
  },
});
void taskStore.resume();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notify();
    void taskStore.outbox.flush();
    taskStore.refreshAll();
  });
  window.addEventListener('offline', notify);
  // For end-to-end tests: wait until every change has reached the server.
  (window as unknown as { __tudu: unknown }).__tudu = { idle: () => taskStore.idle() };
}

function online(): boolean {
  return (typeof navigator === 'undefined' || navigator.onLine) && reachable;
}

/** False while the browser is offline or the server cannot be reached. Changes keep working from the outbox. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    online,
    () => true,
  );
}
