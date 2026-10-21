import type { SpaceSummary } from '@tudu/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetSpace,
  homePath,
  lastSpace,
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
