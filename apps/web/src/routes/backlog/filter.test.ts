import { afterEach, describe, expect, it } from 'vitest';
import { moreItems } from '../more/MorePage';
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
    expect(moreItems({ kind: 'personal', name: 'Personal' }).map((i) => [i.label, i.value])).toEqual([
      ['Backlog', 'backlog'],
      ['Inbox', 'inbox'],
      ['Apps', 'apps'],
      ['Settings', 'settings'],
    ]);
    // C08-U11 a team space lists People under the Backlog, and the Inbox carries its count
    expect(
      moreItems({ kind: 'team', name: 'Northwind', inbox: { toAnswer: 2, unread: 1 } }).map((i) => [
        i.label,
        i.value,
        i.hint,
      ]),
    ).toEqual([
      ['Backlog', 'backlog', 'Tasks without a day'],
      ['People', 'people', 'Everyone in Northwind'],
      ['Inbox', 'inbox', '2 to answer · 1 new'],
      ['Apps', 'apps', 'None yet'],
      ['Settings', 'settings', 'You, this space, how Tudu looks'],
    ]);
    expect(moreItems({ kind: 'personal', name: 'Personal' })[1]!.hint).toBe('All caught up');
  });
});
