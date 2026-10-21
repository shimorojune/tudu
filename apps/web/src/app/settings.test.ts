import type { SpaceSummary } from '@tudu/core';
import { describe, expect, it, vi } from 'vitest';
import { moreItems } from '../routes/more/MorePage';
import { phoneTab } from './AppShell';
import { onSpaceGone, sectionFor, settingsHref } from './settings';
import { spaceBySlug, viewOf, withSlug } from './space';

const PERSONAL: SpaceSummary = {
  id: 'p',
  kind: 'personal',
  name: 'Personal',
  color: null,
  role: 'admin',
  slug: 'me',
  prefix: 'ME',
  members: 1,
  inbox: { toAnswer: 0, unread: 0 },
};
const NW: SpaceSummary = {
  id: 'n',
  kind: 'team',
  name: 'Northwind Labs',
  color: '#3d5a80',
  role: 'admin',
  slug: 'northwind-labs',
  prefix: 'NW',
  members: 3,
  inbox: { toAnswer: 0, unread: 0 },
  oldSlugs: ['northwind'],
};

vi.mock('@tudu/ui', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

describe('C09-U09 settings in the web app', () => {
  it('the section from the address: known ones only; Personal has no Members', () => {
    expect(sectionFor('members', NW)).toBe('members');
    expect(sectionFor('members', PERSONAL)).toBe('space');
    expect(sectionFor('appearance', PERSONAL)).toBe('appearance');
    expect(sectionFor('nope', NW)).toBeNull();
    expect(sectionFor(undefined, NW)).toBeNull();
  });

  it('where Settings lives: ?settings= over the page on the desk, a page of its own on phones; Back closes', () => {
    const at = { pathname: '/northwind-labs/week', searchStr: '?task=NW-3' };
    expect(settingsHref(at, NW.slug, 'members', false)).toBe(
      '/northwind-labs/week?task=NW-3&settings=members',
    );
    expect(settingsHref({ ...at, searchStr: '?settings=members' }, NW.slug, null, false)).toBe(
      '/northwind-labs/week',
    );
    expect(settingsHref(at, NW.slug, 'members', true)).toBe('/northwind-labs/settings/members');
    expect(settingsHref(at, NW.slug, null, true)).toBe('/northwind-labs/settings');
    expect(viewOf('/northwind-labs/settings/members')).toBe('settings');
    expect(phoneTab({ view: 'settings', onToday: false, searchOpen: false })).toBe('more');
  });

  it('an old slug finds the renamed space; the path keeps its view', () => {
    expect(spaceBySlug([PERSONAL, NW], 'northwind')?.id).toBe('n');
    expect(spaceBySlug([PERSONAL, NW], 'northwind-labs')?.id).toBe('n');
    expect(withSlug('/northwind/week', 'northwind-labs')).toBe('/northwind-labs/week');
    expect(withSlug('/northwind', 'northwind-labs')).toBe('/northwind-labs');
  });

  it('space.gone sends you to Personal when you are in it, and only says so otherwise', async () => {
    const { showToast } = await import('@tudu/ui');
    const go = vi.fn();
    onSpaceGone({ spaceId: 'n', name: 'Northwind', how: 'deleted', by: 'Rohit' }, NW, go);
    expect(showToast).toHaveBeenLastCalledWith('Northwind was deleted by Rohit.');
    expect(go).toHaveBeenCalledWith('/me');
    go.mockClear();
    onSpaceGone({ spaceId: 'n', name: 'Northwind', how: 'removed', by: 'Rohit' }, PERSONAL, go);
    expect(showToast).toHaveBeenLastCalledWith('You were removed from Northwind by Rohit.');
    expect(go).not.toHaveBeenCalled();
  });

  it('More lists Settings last, in every space', () => {
    expect(moreItems(PERSONAL).at(-1)).toMatchObject({ value: 'settings', label: 'Settings' });
    expect(moreItems(NW).map((i) => i.value)).toEqual(['backlog', 'people', 'inbox', 'apps', 'settings']);
  });
});
