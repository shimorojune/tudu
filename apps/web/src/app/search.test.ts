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
  mergeOld,
  resetSearchMemory,
  SEARCH_MEMORY,
} from './search';
import { spaceOfHit, toSearchItem } from './SearchHost';

afterEach(() => {
  resetSearchMemory();
  resetDayViewForTests();
});

describe('C07-U08 what Search remembers and where a pick goes', () => {
  it('keeps the searches that led somewhere per browser, across spaces, five, newest first, the same words once', () => {
    addSearch('release notes');
    addSearch(' meera ');
    addSearch('Release Notes');
    addSearch('pay');
    expect(getSearches()).toEqual(['pay', 'Release Notes', 'meera']);
    expect(JSON.parse(localStorage.getItem('tudu.search.history.all')!)).toEqual([
      'pay',
      'Release Notes',
      'meera',
    ]);
    for (let i = 0; i < 7; i++) addSearch(`word ${i}`);
    expect(getSearches()).toHaveLength(SEARCH_MEMORY);
    expect(getSearches()[0]).toBe('word 6');
    addSearch('   ');
    expect(getSearches()[0]).toBe('word 6');
    clearSearches();
    expect(getSearches()).toEqual([]);
  });

  it('keeps the tasks you opened lately, in any space, five, newest first', () => {
    addRecentTask('a');
    addRecentTask('b');
    addRecentTask('a');
    expect(getRecentTasks()).toEqual(['a', 'b']);
    for (let i = 0; i < 6; i++) addRecentTask(`t${i}`);
    expect(getRecentTasks()).toEqual(['t5', 't4', 't3', 't2', 't1']);
    expect(JSON.parse(localStorage.getItem('tudu.search.recent.all')!)).toEqual([
      't5',
      't4',
      't3',
      't2',
      't1',
    ]);
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
    expect(navigate).toHaveBeenLastCalledWith('/me');
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
    expect(navigate).toHaveBeenLastCalledWith('/me/backlog');
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
    expect(phoneTab({ view: 'today', onToday: true, searchOpen: true })).toBe('search');
    expect(phoneTab({ view: 'backlog', onToday: false, searchOpen: false })).toBe('more');
    expect(phoneTab({ view: 'more', onToday: false, searchOpen: false })).toBe('more');
    expect(phoneTab({ view: 'people', onToday: false, searchOpen: false })).toBe('more');
    expect(phoneTab({ view: 'today', onToday: true, searchOpen: false })).toBe('today');
    expect(phoneTab({ view: 'week', onToday: false, searchOpen: false })).toBe('week');
  });
});

describe('C13-U09 close matches in the app', () => {
  it('a hit from another space carries that space for its row; one from this space none; a pick in another space goes to its address', () => {
    const spaces = [
      { id: 's1', name: 'Personal', color: null, slug: 'me' },
      { id: 's2', name: 'Northwind', color: '#3d5a80', slug: 'northwind' },
    ] as never;
    const hit = {
      id: 't',
      ref: 'NW-3',
      title: 'Fix the gutter',
      day: null,
      done: false,
      projectId: null,
      jira: null,
      snippet: null,
      spaceId: 's2',
    };
    expect(spaceOfHit(hit, spaces, 's1')).toEqual({ name: 'Northwind', color: '#3d5a80' });
    expect(spaceOfHit(hit, spaces, 's2')).toBeNull();
    expect(spaceOfHit({ ...hit, spaceId: undefined }, spaces, 's1')).toBeNull();
    expect(toSearchItem(hit, '2026-10-18', [], { name: 'Northwind', color: '#3d5a80' }).space).toEqual({
      name: 'Northwind',
      color: '#3d5a80',
    });
    expect(toSearchItem(hit, '2026-10-18', []).space).toBeNull();
    const navigate = vi.fn();
    expect(goToTask({ id: 't', day: null, done: false }, '2026-10-18', navigate, 'northwind')).toEqual({
      page: 'backlog',
      view: 'open',
    });
    expect(navigate).toHaveBeenCalledWith('/northwind/backlog');
  });
});

describe('C21-U16 Search across every space', () => {
  const spaces = [
    { id: 's1', name: 'Personal', color: null, slug: 'me' },
    { id: 's2', name: 'Northwind', color: '#3d5a80', slug: 'northwind' },
  ] as never;
  const hit = {
    id: 't',
    ref: 'ME-3',
    title: 'Fix the gutter',
    day: null,
    done: false,
    projectId: null,
    jira: null,
    snippet: null,
    spaceId: 's1',
  };

  it('C21-U16 a hit outside the open space is labelled; in All spaces (no open space) every hit is', () => {
    expect(spaceOfHit(hit, spaces, 's1')).toBeNull();
    expect(spaceOfHit({ ...hit, spaceId: 's2' }, spaces, 's1')).toEqual({
      name: 'Northwind',
      color: '#3d5a80',
    });
    expect(spaceOfHit(hit, spaces, '')).toEqual({ name: 'Personal', color: null });
    expect(spaceOfHit({ ...hit, spaceId: 's2' }, spaces, '')).toEqual({
      name: 'Northwind',
      color: '#3d5a80',
    });
  });

  it('C21-U16 the old per-space recent and history lists merge into one, newest first, without repeats', () => {
    localStorage.setItem(
      'tudu.search.history',
      JSON.stringify({ s1: ['pay', 'Gutter', 'lease'], s2: ['gutter', 'release notes'] }),
    );
    localStorage.setItem(
      'tudu.search.recent',
      JSON.stringify({ s1: ['a', 'b', 'c', 'd'], s2: ['x', 'a', 'y'] }),
    );
    resetSearchMemory(true);
    expect(getSearches()).toEqual(['pay', 'gutter', 'release notes', 'lease']);
    expect(getRecentTasks()).toEqual(['a', 'x', 'b', 'c', 'y']);
    // Once: the old keys are gone, the one list is kept.
    expect(localStorage.getItem('tudu.search.history')).toBeNull();
    expect(localStorage.getItem('tudu.search.recent')).toBeNull();
    expect(JSON.parse(localStorage.getItem('tudu.search.recent.all')!)).toEqual(['a', 'x', 'b', 'c', 'y']);
    expect(mergeOld({}, (a, b) => a === b)).toEqual([]);
  });
});
