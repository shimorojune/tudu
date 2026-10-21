import { afterEach, describe, expect, it } from 'vitest';
import { MORE_ITEMS } from '../more/MorePage';
import { getBacklogFilter, resetBacklogFilters, setBacklogFilter } from './filter';

afterEach(resetBacklogFilters);

describe('C06-U09 the Backlog page remembers its filter', () => {
  it('keeps the project per space in the browser, and forgets it with null', () => {
    setBacklogFilter('s1', 'p1');
    setBacklogFilter('s2', 'p9');
    expect(getBacklogFilter('s1')).toBe('p1');
    expect(getBacklogFilter('s2')).toBe('p9');
    expect(JSON.parse(localStorage.getItem('tudu.backlog.filter')!)).toEqual({ s1: 'p1', s2: 'p9' });
    setBacklogFilter('s1', null);
    expect(getBacklogFilter('s1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('tudu.backlog.filter')!)).toEqual({ s2: 'p9' });
  });

  it('starts with nothing for a space it never saw', () => {
    expect(getBacklogFilter('new')).toBeNull();
  });

  it('More lists the Backlog', () => {
    expect(MORE_ITEMS.map((i) => [i.label, i.path])).toEqual([['Backlog', '/backlog']]);
  });
});
