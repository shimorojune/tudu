import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { phoneTab } from './AppShell';
import { resetDayViewForTests, useBacklogViewAsk, useLocate, useShownDay } from './dayView';
import {
  addRecentTask,
  addSearch,
  clearSearches,
  getRecentTasks,
  getSearches,
  goToTask,
  resetSearchMemory,
  SEARCH_MEMORY,
} from './search';

afterEach(() => {
  resetSearchMemory();
  resetDayViewForTests();
});

describe('C07-U08 what Search remembers and where a pick goes', () => {
  it('keeps the searches that led somewhere per browser and space, five, newest first, the same words once', () => {
    addSearch('s1', 'release notes');
    addSearch('s1', ' meera ');
    addSearch('s1', 'Release Notes');
    addSearch('s2', 'pay');
    expect(getSearches('s1')).toEqual(['Release Notes', 'meera']);
    expect(getSearches('s2')).toEqual(['pay']);
    expect(JSON.parse(localStorage.getItem('tudu.search.history')!)).toEqual({ s1: ['Release Notes', 'meera'], s2: ['pay'] });
    for (let i = 0; i < 7; i++) addSearch('s1', `word ${i}`);
    expect(getSearches('s1')).toHaveLength(SEARCH_MEMORY);
    expect(getSearches('s1')[0]).toBe('word 6');
    addSearch('s1', '   ');
    expect(getSearches('s1')[0]).toBe('word 6');
    clearSearches('s1');
    expect(getSearches('s1')).toEqual([]);
    expect(getSearches('s2')).toEqual(['pay']);
    expect(getSearches('never')).toEqual([]);
  });

  it('keeps the tasks you opened lately per space, five, newest first', () => {
    addRecentTask('s1', 'a');
    addRecentTask('s1', 'b');
    addRecentTask('s1', 'a');
    expect(getRecentTasks('s1')).toEqual(['a', 'b']);
    for (let i = 0; i < 6; i++) addRecentTask('s1', `t${i}`);
    expect(getRecentTasks('s1')).toEqual(['t5', 't4', 't3', 't2', 't1']);
    expect(JSON.parse(localStorage.getItem('tudu.search.recent')!).s1).toEqual(['t5', 't4', 't3', 't2', 't1']);
    expect(getRecentTasks('s2')).toEqual([]);
  });

  it('a task on a day goes to Today showing that day, with the row to locate; one with no day goes to the Backlog on its view', () => {
    const navigate = vi.fn();
    const shown = renderHook(() => useShownDay());
    const locate = renderHook(() => useLocate());
    const ask = renderHook(() => useBacklogViewAsk());
    let went: unknown;
    act(() => {
      went = goToTask({ id: 'x', day: '2026-10-10', done: false }, '2026-10-18', navigate);
    });
    expect(went).toEqual({ page: 'today', day: '2026-10-10' });
    expect(navigate).toHaveBeenLastCalledWith('/');
    expect(shown.result.current).toBe('2026-10-10');
    expect(locate.result.current).toMatchObject({ id: 'x', day: '2026-10-10' });
    // today itself: shown goes back to null (today follows the working day)
    act(() => {
      goToTask({ id: 'y', day: '2026-10-18', done: true }, '2026-10-18', navigate);
    });
    expect(shown.result.current).toBeNull();
    expect(locate.result.current).toMatchObject({ id: 'y', day: '2026-10-18', nonce: 2 });
    expect(ask.result.current).toBeNull();
    act(() => {
      went = goToTask({ id: 'z', day: null, done: true }, '2026-10-18', navigate);
    });
    expect(went).toEqual({ page: 'backlog', view: 'done' });
    expect(navigate).toHaveBeenLastCalledWith('/backlog');
    expect(ask.result.current).toMatchObject({ view: 'done' });
    expect(locate.result.current).toMatchObject({ id: 'z', day: null });
    act(() => {
      goToTask({ id: 'w', day: null, done: false }, '2026-10-18', navigate);
    });
    expect(ask.result.current).toMatchObject({ view: 'open', nonce: 2 });
  });
});

describe('C07-U09 which tab is lit on phones', () => {
  it('Search while its sheet is up, More for the Backlog and the More page, else the page', () => {
    expect(phoneTab({ active: 'today', path: '/', onToday: true, searchOpen: true })).toBe('search');
    expect(phoneTab({ active: 'backlog', path: '/backlog', onToday: false, searchOpen: false })).toBe('more');
    expect(phoneTab({ active: 'today', path: '/more', onToday: false, searchOpen: false })).toBe('more');
    expect(phoneTab({ active: 'day:2026-10-20', path: '/', onToday: true, searchOpen: false })).toBe('today');
    expect(phoneTab({ active: 'week', path: '/week', onToday: false, searchOpen: false })).toBe('week');
  });
});
