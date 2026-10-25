import type { SpaceSummary } from '@tudu/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { filterOf, targetOf } from './allSpaces';
import {
  allPath,
  forgetSpace,
  homePath,
  inAllPath,
  pagePath,
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

describe('C21-U15 All spaces in the address', () => {
  beforeEach(() => forgetSpace());

  it('C21-U15 /all keeps its filter by slug; an unknown slug is no filter; Personal is where a task goes otherwise', () => {
    expect(allPath()).toBe('/all');
    expect(allPath('week', 'northwind')).toBe('/all/week?space=northwind');
    expect(allPath('people')).toBe('/all');
    expect(filterOf(SPACES, 'northwind')?.id).toBe('n');
    expect(filterOf(SPACES, 'me')?.id).toBe('p');
    expect(filterOf(SPACES, 'gone')).toBeNull();
    expect(filterOf(SPACES, undefined)).toBeNull();
    expect(targetOf(SPACES, null).id).toBe('p');
    expect(targetOf(SPACES, SPACES[1]!).id).toBe('n');
    expect(viewOf('/all/backlog')).toBe('backlog');
    expect(inAllPath('/all/week')).toBe(true);
    expect(inAllPath('/allotment')).toBe(false);
  });

  it('C21-U15 switching to and from All spaces keeps the view it has; anything else opens its Today', () => {
    expect(switchPath('/northwind/week', 'all')).toBe('/all/week');
    expect(switchPath('/northwind/people', 'all')).toBe('/all');
    expect(switchPath('/all/backlog', 'northwind')).toBe('/northwind/backlog');
    expect(pagePath('me', true, 'settings')).toBe('/me/settings');
    expect(pagePath('me', true, 'backlog')).toBe('/all/backlog');
  });

  it('C21-U15 homePath opens All spaces when it was last, while you are in two spaces; with one it is Personal', () => {
    rememberSpace('all');
    expect(homePath(SPACES)).toBe('/all');
    expect(homePath([SPACES[0]!])).toBe('/me');
    // With one space All spaces is forgotten.
    expect(lastSpace(SPACES)).toBeNull();
  });
});
