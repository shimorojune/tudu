import { describe, expect, it, vi } from 'vitest';
import { IndexedDbOutboxStore, MemoryOutboxStore, Outbox, type Mutation } from './outbox';

function m(id: string, at: string): Mutation {
  return { id, type: 'task.create', payload: { id }, at };
}

describe('the outbox queue', () => {
  it('sends in order, removes what the server accepted, and keeps the rest for a retry', async () => {
    vi.useFakeTimers();
    const store = new MemoryOutboxStore();
    const sent: string[][] = [];
    let fail = true;
    const outbox = new Outbox({
      store,
      send: async (batch) => {
        sent.push(batch.map((b) => b.id));
        if (fail) throw new Error('offline');
        return { done: batch.map((b) => b.id) };
      },
    });
    await outbox.add(m('b', '2026-10-20T10:00:01Z'));
    await outbox.add(m('a', '2026-10-20T10:00:00Z'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[0]).toEqual(['b']);
    expect(await outbox.idle()).toBe(false);
    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.at(-1)).toEqual(['a', 'b']);
    expect(await outbox.idle()).toBe(true);
    outbox.stop();
    vi.useRealTimers();
  });
});

/** A disk that takes every write and never says it is done, as WebKit's IndexedDB did on the Mac (C11-D09). */
function stuckStore() {
  const writes: string[] = [];
  return {
    writes,
    store: {
      all: () => new Promise<Mutation[]>(() => {}),
      put: (x: Mutation) => {
        writes.push(`put ${x.id}`);
        return new Promise<void>(() => {});
      },
      remove: (id: string) => {
        writes.push(`remove ${id}`);
        return new Promise<void>(() => {});
      },
    },
  };
}

describe('C11-U47 a disk write that never finishes holds nothing up', () => {
  it('C11-U47 three changes in a row are all sent, in order, and the outbox goes idle', async () => {
    const { store, writes } = stuckStore();
    const sent: string[] = [];
    const outbox = new Outbox({
      store,
      send: async (batch) => {
        sent.push(...batch.map((b) => b.id));
        return { done: batch.map((b) => b.id) };
      },
    });
    void outbox.add(m('a', '2026-11-10T10:00:00Z'));
    void outbox.add(m('b', '2026-11-10T10:00:01Z'));
    void outbox.add(m('c', '2026-11-10T10:00:02Z'));
    await vi.waitFor(async () => expect(await outbox.idle()).toBe(true));
    expect(sent).toEqual(['a', 'b', 'c']);
    // Each was still written to disk (for a reload) and taken off it once the server had it.
    expect(writes.filter((w) => w.startsWith('put'))).toEqual(['put a', 'put b', 'put c']);
    expect(writes.filter((w) => w.startsWith('remove')).sort()).toEqual(['remove a', 'remove b', 'remove c']);
    outbox.stop();
  });
});

describe('C11-U48 a remove that never finishes', () => {
  it('C11-U48 does not stop the next batch from being sent', async () => {
    const inner = new MemoryOutboxStore();
    let removes = 0;
    const store = {
      all: () => inner.all(),
      put: (x: Mutation) => inner.put(x),
      // The first remove (after the first batch was accepted) never settles; later ones work.
      remove: (id: string) => (++removes === 1 ? new Promise<void>(() => {}) : inner.remove(id)),
    };
    const batches: string[][] = [];
    const outbox = new Outbox({
      store,
      send: async (batch) => {
        batches.push(batch.map((b) => b.id));
        return { done: batch.map((b) => b.id) };
      },
    });
    void outbox.add(m('first', '2026-11-10T10:00:00Z'));
    await vi.waitFor(async () => expect(await outbox.idle()).toBe(true));
    void outbox.add(m('second', '2026-11-10T10:00:01Z'));
    await vi.waitFor(async () => expect(await outbox.idle()).toBe(true));
    expect(batches).toEqual([['first'], ['second']]);
    outbox.stop();
  });
});

/**
 * Just enough of IndexedDB for the outbox store: each connection's transactions finish (on a later tick) unless
 * the test says that connection is stuck, when they never do: no complete, no error, no abort.
 */
function fakeIndexedDb(stuck: (connection: number) => boolean) {
  const rows = new Map<string, Mutation>();
  let opened = 0;
  const closed: number[] = [];
  const factory = {
    open: () => {
      const n = ++opened;
      const db = {
        objectStoreNames: { contains: () => true },
        close: () => closed.push(n),
        transaction: () => {
          const t: Record<string, unknown> = {};
          const finish = (req: Record<string, unknown>, result: unknown) => {
            if (stuck(n)) return;
            setTimeout(() => {
              req.result = result;
              (req.onsuccess as (() => void) | undefined)?.();
              (t.oncomplete as (() => void) | undefined)?.();
            }, 0);
          };
          t.objectStore = () => ({
            getAll: () => {
              const req: Record<string, unknown> = {};
              finish(req, [...rows.values()]);
              return req;
            },
            put: (x: Mutation) => {
              const req: Record<string, unknown> = {};
              if (!stuck(n)) rows.set(x.id, x);
              finish(req, x.id);
              return req;
            },
            delete: (id: string) => {
              const req: Record<string, unknown> = {};
              if (!stuck(n)) rows.delete(id);
              finish(req, undefined);
              return req;
            },
          });
          return t;
        },
      };
      const req: Record<string, unknown> = {};
      setTimeout(() => {
        req.result = db;
        (req.onsuccess as (() => void) | undefined)?.();
      }, 0);
      return req;
    },
  };
  return { factory, rows, closed, opened: () => opened };
}

describe('C11-U49 the IndexedDB outbox store', () => {
  it('C11-U49 a transaction that never finishes fails after the limit, and the next call opens a new connection', async () => {
    const fake = fakeIndexedDb((n) => n === 1);
    vi.stubGlobal('indexedDB', fake.factory);
    try {
      const store = new IndexedDbOutboxStore('test', 50);
      await expect(store.put(m('a', '2026-11-10T10:00:00Z'))).rejects.toThrow('never finished');
      expect(fake.closed).toEqual([1]);
      await store.put(m('b', '2026-11-10T10:00:01Z'));
      expect(fake.opened()).toBe(2);
      expect((await store.all()).map((x) => x.id)).toEqual(['b']);
      await store.remove('b');
      expect(await store.all()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
