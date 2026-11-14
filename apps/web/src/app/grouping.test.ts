import { NO_PROJECT } from '@tudu/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_SCOPE,
  getGrouping,
  pruneFolds,
  resetGrouping,
  setFolded,
  setGrouped,
  useAllGrouping,
  useGrouping,
} from './grouping';

describe('C02-U56 the grouping memory', () => {
  beforeEach(() => resetGrouping());

  it('a space never seen is off with nothing folded', () => {
    expect(getGrouping('s1')).toEqual({ on: false, folded: [] });
    expect(localStorage.getItem('tudu.group')).toBeNull();
  });

  it('keeps on/off and folds per space, and across a reload', () => {
    setGrouped('s1', true);
    setFolded('s1', 'p1', true);
    setFolded('s1', NO_PROJECT, true);
    setFolded('s2', 'p9', true);
    expect(getGrouping('s1')).toEqual({ on: true, folded: ['p1', NO_PROJECT] });
    expect(getGrouping('s2')).toEqual({ on: false, folded: ['p9'] });
    resetGrouping(true);
    expect(getGrouping('s1')).toEqual({ on: true, folded: ['p1', NO_PROJECT] });
    setFolded('s1', 'p1', false);
    setGrouped('s1', false);
    setFolded('s1', NO_PROJECT, false);
    expect(JSON.parse(localStorage.getItem('tudu.group')!)).toEqual({ s2: { on: false, folded: ['p9'] } });
  });

  it('drops the fold of a project that is gone, and keeps No project’s', () => {
    setFolded('s1', 'p1', true);
    setFolded('s1', 'p2', true);
    setFolded('s1', NO_PROJECT, true);
    pruneFolds('s1', ['p2', 'p3']);
    expect(getGrouping('s1').folded).toEqual(['p2', NO_PROJECT]);
  });

  it('the hook follows changes; a read that is not ours is ignored', () => {
    const { result } = renderHook(() => useGrouping('s1'));
    expect(result.current.on).toBe(false);
    act(() => setGrouped('s1', true));
    expect(result.current.on).toBe(true);
    localStorage.setItem('tudu.group', '["nonsense"]');
    resetGrouping(true);
    expect(getGrouping('s1')).toEqual({ on: false, folded: [] });
  });

  it('All spaces: its own choice, every space’s project folds, its own No project fold', () => {
    setGrouped('s1', true);
    setFolded('s1', 'p1', true);
    setFolded('s1', NO_PROJECT, true);
    setFolded('s2', 'p9', true);
    const { result } = renderHook(() => useAllGrouping(['s1', 's2']));
    expect(result.current).toEqual({ on: false, folded: ['p1', 'p9'] });
    act(() => {
      setGrouped(ALL_SCOPE, true);
      setFolded(ALL_SCOPE, NO_PROJECT, true);
    });
    expect(result.current).toEqual({ on: true, folded: [NO_PROJECT, 'p1', 'p9'] });
  });

  it('forgets the Backlog’s old project filter', () => {
    localStorage.setItem('tudu.backlog.filter', '{"s1":"p1"}');
    resetGrouping(true);
    expect(localStorage.getItem('tudu.backlog.filter')).toBeNull();
  });
});
