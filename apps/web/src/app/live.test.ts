import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Opts = { after?: string | null; onEvent: (e: { type: string; data?: unknown }) => void };
const streams: Opts[] = [];
vi.mock('@tudu/client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  connectEvents: (o: Opts) => {
    streams.push(o);
    return { close: () => {}, lastId: () => null };
  },
}));

const { useLiveEvents } = await import('./live');
const { meQuery, queryClient } = await import('./session');

afterEach(() => {
  streams.length = 0;
  queryClient.clear();
  vi.restoreAllMocks();
});

describe('C11-U44 the live stream starts where the page read who you are', () => {
  it('C11-U44 it asks for what came after /api/me’s events; a hello reads nothing again', () => {
    queryClient.setQueryData(meQuery.queryKey, { user: { id: 'u' }, spaces: [], events: 41 } as never);
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderHook(() => useLiveEvents(true));
    expect(streams[0]!.after).toBe('41');
    streams[0]!.onEvent({ type: 'hello', data: {} });
    expect(spy).not.toHaveBeenCalled();
  });

  it('C11-U44 a server that does not say (an older one) starts the stream now, as before', () => {
    queryClient.setQueryData(meQuery.queryKey, { user: { id: 'u' }, spaces: [] } as never);
    renderHook(() => useLiveEvents(true));
    expect(streams[0]!.after).toBeNull();
  });

  it('C11-U44 signed out: no stream', () => {
    renderHook(() => useLiveEvents(false));
    expect(streams).toHaveLength(0);
  });
});
