/**
 * The outbox: every change the person makes is applied locally at once and queued here, then replayed to the
 * server in order. Each mutation carries a client id and its own id, so a retry never doubles a change.
 * The task mutations themselves live in tasks.ts.
 */
export interface Mutation<T = unknown> {
  id: string;
  type: string;
  payload: T;
  /** The client's clock when it was made; the server uses it for last-write-wins per field. */
  at: string;
  /** Orders mutations made in the same millisecond. */
  seq?: number;
}

/** Oldest first: by the clock, then by the order they were made in. */
export function byClock(a: Mutation, b: Mutation): number {
  return a.at.localeCompare(b.at) || (a.seq ?? 0) - (b.seq ?? 0);
}

/** At most this many mutations in one request. */
export const BATCH_SIZE = 100;

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

/** How long one outbox transaction may take before it counts as failed. */
export const TX_LIMIT_MS = 3000;

/**
 * Keeps the queue in IndexedDB so it survives a reload or a closed laptop. WebKit can leave a readwrite transaction
 * open for good (no complete, no error, no abort), and every later one waits behind it: a transaction that takes
 * longer than `limitMs` is given up on, and the next call opens a fresh connection.
 */
export class IndexedDbOutboxStore implements OutboxStore {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(
    private readonly name = DB_NAME,
    private readonly limitMs = TX_LIMIT_MS,
  ) {}
  private open(): Promise<IDBDatabase> {
    if (!this.dbp) {
      const p = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE))
            req.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      // A failed open is tried again next time.
      p.catch(() => {
        if (this.dbp === p) this.dbp = null;
      });
      this.dbp = p;
    }
    return this.dbp;
  }
  /** Drop the connection `from` came from, so the next call opens a new one. */
  private reset(from: Promise<IDBDatabase>): void {
    if (this.dbp !== from) return;
    this.dbp = null;
    void from.then(
      (db) => {
        try {
          db.close();
        } catch {
          // already closing
        }
      },
      () => {},
    );
  }
  /** One request in its own transaction, settled when the transaction is through, so a write is on disk. */
  private tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const conn = this.open();
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const end = (ok: boolean, value?: T, err?: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ok) resolve(value as T);
        else reject(err);
      };
      const timer = setTimeout(() => {
        this.reset(conn);
        end(false, undefined, new Error('The outbox write never finished.'));
      }, this.limitMs);
      conn.then(
        (db) => {
          if (done) return;
          let t: IDBTransaction;
          let req: IDBRequest<T>;
          try {
            t = db.transaction(STORE, mode);
            req = fn(t.objectStore(STORE));
          } catch (err) {
            // The connection is closing (or closed): the next call opens another.
            this.reset(conn);
            end(false, undefined, err);
            return;
          }
          let result: T;
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => end(false, undefined, req.error);
          t.oncomplete = () => end(true, result);
          t.onerror = () => end(false, undefined, t.error);
          t.onabort = () => end(false, undefined, t.error ?? new Error('The outbox write was abandoned.'));
        },
        (err) => end(false, undefined, err),
      );
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

/**
 * The queue runner: one batch at a time, in order, retrying after a pause when the server is unreachable. It sends
 * from its own queue in memory; the store only keeps that queue across a reload, so a disk write that is slow or
 * never finishes holds nothing up.
 */
export class Outbox {
  private running = false;
  private pending = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly queue = new Map<string, Mutation>();
  constructor(private readonly o: OutboxOptions) {}

  /** Queue a change and send it. Resolves once it is on disk too; sending never waits for that. */
  add(m: Mutation): Promise<void> {
    this.queue.set(m.id, m);
    const stored = this.o.store.put(m);
    void this.flush();
    return stored;
  }

  /** Changes an earlier page left on disk: they go with the rest (the server applies each id once). */
  load(left: Mutation[]): void {
    for (const m of left) if (!this.queue.has(m.id)) this.queue.set(m.id, m);
  }

  /** Forget everything queued (signing out). */
  forget(): void {
    this.queue.clear();
  }

  /** True when nothing is waiting. Tests wait on this before asserting. */
  async idle(): Promise<boolean> {
    return !this.running && this.queue.size === 0;
  }

  async flush(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    try {
      for (;;) {
        const batch = [...this.queue.values()].sort(byClock).slice(0, BATCH_SIZE);
        if (!batch.length) break;
        const { done } = await this.o.send(batch);
        for (const id of done) {
          this.queue.delete(id);
          // Off the disk too, without waiting: a remove that never finishes only means a resend after a reload.
          this.o.store.remove(id).catch(() => {});
        }
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
