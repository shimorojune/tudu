import { describe, expect, it, vi } from 'vitest';
import { MemoryOutboxStore, Outbox, type Mutation } from './outbox';

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
