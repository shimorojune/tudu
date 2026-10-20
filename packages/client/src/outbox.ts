/**
 * The outbox: every change the person makes is applied locally at once and queued here, then replayed to the
 * server in order. Each mutation carries a client id and its own id, so a retry never doubles a change.
 * Chunk 01 ships the queue and its storage; the mutations themselves arrive with the Today chunk.
 */
export interface Mutation<T = unknown> {
  id: string;
  type: string;
  payload: T;
  /** The client's clock when it was made; the server uses it for last-write-wins per field. */
  at: string;
}

export interface OutboxStore {
  all(): Promise<Mutation[]>;
  put(m: Mutation): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Keeps the queue in memory only (tests, private windows). */
export class MemoryOutboxStore implements OutboxStore {
  private items = new Map<string, Mutation>();
  async all() {
    return [...this.items.values()];
  }
  async put(m: Mutation) {
    this.items.set(m.id, m);
  }
  async remove(id: string) {
    this.items.delete(id);
  }
}

const DB_NAME = 'tudu';
const STORE = 'outbox';

/** Keeps the queue in IndexedDB so it survives a reload or a closed laptop. */
export class IndexedDbOutboxStore implements OutboxStore {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private readonly name = DB_NAME) {}
  private open(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE))
            req.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbp;
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  all() {
    return this.tx('readonly', (s) => s.getAll() as IDBRequest<Mutation[]>);
  }
  async put(m: Mutation) {
    await this.tx('readwrite', (s) => s.put(m));
  }
  async remove(id: string) {
    await this.tx('readwrite', (s) => s.delete(id));
  }
}

export interface OutboxOptions {
  store: OutboxStore;
  /** Sends a batch; resolves with the ids the server accepted (or rejected for good). */
  send: (batch: Mutation[]) => Promise<{ done: string[] }>;
  onIdle?: () => void;
  onError?: (err: unknown) => void;
}

/** The queue runner: one batch at a time, in order, retrying after a pause when the server is unreachable. */
export class Outbox {
  private running = false;
  private pending = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly o: OutboxOptions) {}

  async add(m: Mutation): Promise<void> {
    await this.o.store.put(m);
    void this.flush();
  }

  /** True when nothing is waiting. Tests wait on this before asserting. */
  async idle(): Promise<boolean> {
    return !this.running && (await this.o.store.all()).length === 0;
  }

  async flush(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    try {
      for (;;) {
        const batch = (await this.o.store.all()).sort((a, b) => a.at.localeCompare(b.at));
        if (!batch.length) break;
        const { done } = await this.o.send(batch);
        for (const id of done) await this.o.store.remove(id);
        if (!done.length) throw new Error('nothing accepted');
      }
      this.o.onIdle?.();
    } catch (err) {
      this.o.onError?.(err);
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => void this.flush(), 5000);
    } finally {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        void this.flush();
      }
    }
  }

  stop(): void {
    if (this.retry) clearTimeout(this.retry);
  }
}
