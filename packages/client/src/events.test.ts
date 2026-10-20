import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEvents } from './events';

/** A fake EventSource the test drives by hand. */
class FakeSource {
  static instances: FakeSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((m: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  message(id: string, payload: unknown) {
    this.onmessage?.({ lastEventId: id, data: JSON.stringify(payload) } as MessageEvent<string>);
  }
  fail() {
    this.onerror?.();
  }
}

describe('C01-U08 the live stream subscriber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSource.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it('C01-U08 reconnects with backoff and resumes from the last event id', () => {
    const events: Array<{ id: string; type: string }> = [];
    const statuses: string[] = [];
    const handle = connectEvents({
      url: 'http://localhost:3456/api/events',
      onEvent: (e) => events.push({ id: e.id, type: e.type }),
      onStatus: (s) => statuses.push(s),
      EventSource: FakeSource as unknown as typeof EventSource,
      minDelay: 1000,
      maxDelay: 8000,
    });
    const first = FakeSource.instances[0]!;
    expect(first.url).toBe('http://localhost:3456/api/events');
    first.open();
    first.message('7', { type: 'task.changed', data: { id: 'a' } });
    expect(events).toEqual([{ id: '7', type: 'task.changed' }]);
    expect(handle.lastId()).toBe('7');

    // the connection drops: reconnect after 1s, then 2s, then 4s, capped at 8s
    first.fail();
    expect(first.closed).toBe(true);
    expect(FakeSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSource.instances).toHaveLength(2);
    expect(new URL(FakeSource.instances[1]!.url).searchParams.get('lastEventId')).toBe('7');

    FakeSource.instances[1]!.fail();
    vi.advanceTimersByTime(2000);
    expect(FakeSource.instances).toHaveLength(3);
    FakeSource.instances[2]!.fail();
    vi.advanceTimersByTime(4000);
    expect(FakeSource.instances).toHaveLength(4);
    FakeSource.instances[3]!.fail();
    vi.advanceTimersByTime(8000);
    expect(FakeSource.instances).toHaveLength(5);
    FakeSource.instances[4]!.fail();
    vi.advanceTimersByTime(8000);
    expect(FakeSource.instances).toHaveLength(6);

    // a successful open resets the backoff to the minimum
    FakeSource.instances[5]!.open();
    FakeSource.instances[5]!.fail();
    vi.advanceTimersByTime(1000);
    expect(FakeSource.instances).toHaveLength(7);

    handle.close();
    expect(FakeSource.instances[6]!.closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(FakeSource.instances).toHaveLength(7);
    expect(statuses[0]).toBe('connecting');
    expect(statuses).toContain('open');
    expect(statuses.at(-1)).toBe('closed');
  });
});
