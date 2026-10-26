import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRefOnce } from './refOnce';

type Open = { id: string } | null;
type Detail = { id: string; ref: string | null } | undefined;

describe('useRefOnce', () => {
  it('C21-U18 the panel reports a task’s ref once, however often the page re-renders', () => {
    const calls: string[] = [];
    // A new callback on every render, as the pages pass it.
    const fresh = () => vi.fn((ref: string) => void calls.push(ref));
    type Props = { open: Open; detail: Detail; onRef: (ref: string) => void };
    const initialProps: Props = { open: { id: 't1' }, detail: { id: 't1', ref: null }, onRef: fresh() };
    const { rerender } = renderHook(({ open, detail, onRef }: Props) => useRefOnce(open, detail, onRef), {
      initialProps,
    });
    expect(calls).toEqual([]);
    // The server's answer brings the ref; the page keeps re-rendering while its address catches up.
    for (let i = 0; i < 20; i++)
      rerender({ open: { id: 't1' }, detail: { id: 't1', ref: 'ME-3' }, onRef: fresh() });
    expect(calls).toEqual(['ME-3']);
    // Another task: once more.
    for (let i = 0; i < 5; i++)
      rerender({ open: { id: 't2' }, detail: { id: 't2', ref: 'ME-4' }, onRef: fresh() });
    expect(calls).toEqual(['ME-3', 'ME-4']);
    // An older detail still showing while the next one loads: nothing.
    rerender({ open: { id: 't1' }, detail: { id: 't2', ref: 'ME-4' }, onRef: fresh() });
    expect(calls).toEqual(['ME-3', 'ME-4']);
    // Closed, then the first task opened again with its detail cached: once again.
    rerender({ open: null, detail: { id: 't2', ref: 'ME-4' }, onRef: fresh() });
    for (let i = 0; i < 5; i++)
      rerender({ open: { id: 't1' }, detail: { id: 't1', ref: 'ME-3' }, onRef: fresh() });
    expect(calls).toEqual(['ME-3', 'ME-4', 'ME-3']);
  });
});
