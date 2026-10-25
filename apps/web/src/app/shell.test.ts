import type { SpaceSummary } from '@tudu/core';
import { describe, expect, it } from 'vitest';
import { moreItems } from '../routes/more/MorePage';
import { phoneTab, sideItems, switchSpaces } from './AppShell';
import { inboxTotal } from './updates';

const space = (id: string, kind: 'personal' | 'team', toAnswer = 0, unread = 0): SpaceSummary => ({
  id,
  kind,
  name: id,
  color: null,
  role: 'member',
  slug: id,
  prefix: id.toUpperCase(),
  members: 1,
  inbox: { toAnswer, unread },
});

describe('C08-U21 the Inbox opens from the top bar, not a space', () => {
  it('C08-U21 neither the sidebar nor More has an Inbox, in Personal or a team space', () => {
    expect(sideItems(false).map((i) => i.value)).toEqual(['today', 'week', 'backlog']);
    expect(sideItems(true).map((i) => i.value)).toEqual(['today', 'week', 'backlog', 'people']);
    expect(moreItems({ kind: 'personal', name: 'Personal' }).some((i) => i.value === 'inbox')).toBe(false);
    expect(moreItems({ kind: 'team', name: 'Northwind' }).some((i) => i.value === 'inbox')).toBe(false);
    // On phones the Inbox lights no tab: it is the header's icon.
    expect(phoneTab({ view: 'inbox', onToday: false, searchOpen: false })).toBe('inbox');
  });

  it('C08-U21 the pip is the total from /api/me plus the Mac update, once', () => {
    const spaces = [space('me', 'personal', 0, 1), space('nw', 'team', 2, 1), space('pf', 'team', 0, 1)];
    // An invite has no space yet, so the total is more than the spaces add up to.
    const me = { spaces, inbox: { toAnswer: 2, unread: 4 } };
    expect(inboxTotal(me)).toBe(6);
    expect(inboxTotal(me, true)).toBe(7);
    expect(inboxTotal({ spaces: [space('me', 'personal')], inbox: { toAnswer: 0, unread: 0 } })).toBe(0);
    // Each space in the switcher keeps its own count; the All spaces row first has none.
    expect(switchSpaces(spaces).map((s) => s.count)).toEqual([undefined, 1, 3, 1]);
  });
});

describe('C21-U14 the shell in All spaces', () => {
  it('C21-U14 the sidebar has Today, Week and Backlog only; More has no People or Apps; the All spaces row has no badge', () => {
    expect(sideItems(true, true).map((i) => i.value)).toEqual(['today', 'week', 'backlog']);
    expect(moreItems({ kind: 'personal', name: 'Personal' }, true, true).map((i) => i.value)).toEqual([
      'backlog',
      'settings',
    ]);
    const spaces = [space('nw', 'team', 2, 1), space('me', 'personal', 0, 1)];
    const rows = switchSpaces(spaces);
    // All spaces first, then Personal (whatever order /api/me sent), then the team spaces.
    expect(rows.map((s) => s.id)).toEqual(['all', 'me', 'nw']);
    expect(rows[0]).toMatchObject({ all: true, name: 'All spaces', sub: 'Everything that’s yours' });
    expect(rows[0]!.count).toBeUndefined();
    // With one space there is nothing to gather: no All spaces row.
    expect(switchSpaces([space('me', 'personal')]).map((s) => s.id)).toEqual(['me']);
  });
});
