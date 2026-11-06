import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Opts = { onEvent: (e: { type: string; data?: unknown }) => void; onStatus?: (s: string) => void };
const streams: Opts[] = [];
vi.mock('@tudu/client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  connectEvents: (o: Opts) => {
    streams.push(o);
    return { close: () => {}, lastId: () => null };
  },
}));

const { useLiveEvents } = await import('./live');
const { queryClient } = await import('./session');

afterEach(() => {
  streams.length = 0;
  vi.restoreAllMocks();
});

describe('C11-U44 the first hello reads who you are again', () => {
  it('C11-U44 me is read again once, on the first hello only; a hello after a reconnect leaves it to the reconnect', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderHook(() => useLiveEvents(true));
    const s = streams[0]!;
    s.onStatus?.('connecting');
    s.onStatus?.('open');
    expect(spy).not.toHaveBeenCalled();
    s.onEvent({ type: 'hello', data: {} });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['me'] });
    s.onEvent({ type: 'hello', data: {} });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('C11-U44 signed out: no stream, nothing read', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderHook(() => useLiveEvents(false));
    expect(streams).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
