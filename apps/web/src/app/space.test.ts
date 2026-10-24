import type { SpaceSummary } from '@tudu/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetSpace,
  homePath,
  inboxPath,
  lastSpace,
  oldInboxPath,
  rememberSpace,
  spaceBySlug,
  spacePath,
  switchPath,
  viewOf,
} from './space';

const SPACES: SpaceSummary[] = [
  {
    id: 'p',
    kind: 'personal',
    name: 'Personal',
    color: null,
    role: 'admin',
    slug: 'me',
    prefix: 'ME',
    members: 1,
    inbox: { toAnswer: 0, unread: 0 },
  },
  {
    id: 'n',
    kind: 'team',
    name: 'Northwind',
    color: '#3d5a80',
    role: 'admin',
    slug: 'northwind',
    prefix: 'NW',
    members: 3,
    inbox: { toAnswer: 0, unread: 0 },
  },
];

beforeEach(() => {
  localStorage.clear();
  forgetSpace();
});

describe('C08-U11 the space in the address', () => {
  it('C08-U11 finds a space by its slug: me is Personal, a team by its slug, nothing for a stranger', () => {
    expect(spaceBySlug(SPACES, 'me')?.id).toBe('p');
    expect(spaceBySlug(SPACES, 'northwind')?.id).toBe('n');
    expect(spaceBySlug(SPACES, 'acme')).toBeUndefined();
    expect(spaceBySlug(SPACES, 'p')).toBeUndefined();
  });

  it('C08-U11 builds and reads paths, and switching keeps the view', () => {
    expect(spacePath('me')).toBe('/me');
    expect(spacePath('northwind', 'week')).toBe('/northwind/week');
    expect(viewOf('/me')).toBe('today');
    expect(viewOf('/northwind/')).toBe('today');
    expect(viewOf('/northwind/backlog')).toBe('backlog');
    expect(viewOf('/northwind/people/abc')).toBe('people');
    expect(viewOf('/northwind/nothing')).toBe('today');
    expect(switchPath('/me/week', 'northwind')).toBe('/northwind/week');
    expect(switchPath('/northwind/people/abc', 'me')).toBe('/me/people');
    expect(switchPath('/northwind', 'me')).toBe('/me');
  });

  it('C08-U11 remembers the last space per browser, drops one you are no longer in, and / goes there', () => {
    expect(lastSpace(SPACES)).toBeNull();
    expect(homePath(SPACES)).toBe('/me');
    rememberSpace('northwind');
    expect(lastSpace(SPACES)).toBe('northwind');
    expect(homePath(SPACES)).toBe('/northwind');
    rememberSpace('gone');
    expect(lastSpace(SPACES)).toBeNull();
    expect(localStorage.getItem('tudu.space')).toBeNull();
    expect(homePath(SPACES)).toBe('/me');
  });
});

describe('C08-U20 the one Inbox has its own address', () => {
  it('C08-U20 old per-space addresses land on /inbox narrowed to that space, keeping the item and view', () => {
    const [me, nw] = SPACES as [SpaceSummary, SpaceSummary];
    // Personal's Inbox never worked: its old address is the whole Inbox.
    expect(oldInboxPath(me)).toBe('/inbox');
    expect(oldInboxPath(nw)).toBe('/inbox?space=northwind');
    expect(oldInboxPath(nw, 'abc')).toBe('/inbox/abc?space=northwind');
    expect(oldInboxPath(nw, null, 'sent')).toBe('/inbox?space=northwind&view=sent');
  });

  it('C08-U20 /inbox is its own place: every space links there, and switching from it opens Today', () => {
    expect(spacePath('northwind', 'inbox')).toBe('/inbox');
    expect(spacePath('me', 'inbox')).toBe('/inbox');
    expect(viewOf('/inbox')).toBe('inbox');
    expect(viewOf('/inbox/abc')).toBe('inbox');
    expect(inboxPath()).toBe('/inbox');
    expect(inboxPath({ view: 'inbox' })).toBe('/inbox');
    expect(inboxPath({ view: 'sent' })).toBe('/inbox?view=sent');
    expect(switchPath('/inbox', 'northwind')).toBe('/northwind');
    expect(switchPath('/inbox/abc', 'me')).toBe('/me');
  });
});
