import type { MeResponse } from '@tudu/client';
import { DEFAULT_HOURS, type WorkHours } from '@tudu/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn<(path: string, body: unknown) => Promise<unknown>>();
let online = true;
vi.mock('./session', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { api: { post: (p: string, b: unknown) => post(p, b) }, queryClient: new QueryClient() };
});
vi.mock('./tasks', () => ({ useOnline: () => online }));

const { useWorkHours } = await import('./workHours');
const { queryClient } = await import('./session');

const ME = { user: { id: 'u' }, spaces: [], workHours: DEFAULT_HOURS } as unknown as MeResponse;
const shortFriday: WorkHours = {
  same: false,
  days: [...DEFAULT_HOURS.days.slice(0, 4), { day: 5, start: '09:00', end: '14:00' }],
};

beforeEach(() => {
  post.mockReset();
  online = true;
  queryClient.setQueryData(['me'], ME);
});

describe('WH-U16 saving your hours', () => {
  it('WH-U16 one post per change, and the me cache has it at once', async () => {
    post.mockResolvedValue({ workHours: shortFriday });
    const { result } = renderHook(() => useWorkHours(ME));
    act(() => result.current.onChange!(shortFriday));
    expect(queryClient.getQueryData<MeResponse>(['me'])!.workHours).toEqual(shortFriday);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/me/hours', shortFriday);
    await waitFor(() => expect(result.current.saveError).toBe(false));
  });

  it('WH-U16 a failed save keeps the change, says so, and goes again once back online', async () => {
    post.mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(() => useWorkHours(ME));
    online = false;
    act(() => result.current.onChange!(shortFriday));
    await waitFor(() => expect(result.current.saveError).toBe(true));
    expect(queryClient.getQueryData<MeResponse>(['me'])!.workHours).toEqual(shortFriday);
    post.mockResolvedValue({ workHours: shortFriday });
    online = true;
    rerender();
    await waitFor(() => expect(result.current.saveError).toBe(false));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith('/api/me/hours', shortFriday);
  });
});
