import { describe, expect, it } from 'vitest';
import { carriedLabel, dayTurn } from './carried';
import { gatherToday, menuBarEmptyLines, ofWords, todayLeft } from './menubar';
import type { SpaceSummary } from './spaces';

const space = (id: string, kind: 'personal' | 'team', name: string): SpaceSummary => ({
  id,
  kind,
  name,
  color: null,
  role: 'member',
  slug: id,
  prefix: id.toUpperCase(),
  members: kind === 'personal' ? 1 : 4,
  inbox: { toAnswer: 0, unread: 0 },
});
const task = (title: string, ownerId: string | null, done = false) => ({ title, ownerId, done });

describe('C20-U01 today across your spaces', () => {
  it('C20-U01 Personal first, then the switcher order; empty spaces dropped; only your own tasks', () => {
    const nw = space('nw', 'team', 'Northwind');
    const me = space('me', 'personal', 'Personal');
    const hb = space('hb', 'team', 'Harbour');
    const groups = gatherToday(
      [nw, me, hb],
      {
        nw: [task('Review the deck', 'u1', true), task('Meera’s demo', 'u2'), task('Ship the build', 'u1')],
        me: [task('Pay the bill', null), task('Call the bank', 'u1', true)],
        hb: [task('Someone else’s', 'u2')],
      },
      'u1',
    );
    expect(
      groups.map((g) => [g.space.name, g.tasks.map((t) => t.title), ofWords(g.done, g.tasks.length)]),
    ).toEqual([
      ['Personal', ['Pay the bill', 'Call the bank'], '1 of 2'],
      ['Northwind', ['Review the deck', 'Ship the build'], '1 of 2'],
    ]);
    // A space not read yet is not shown yet.
    expect(gatherToday([me, nw], { me: [task('One', null)] }, 'u1').map((g) => g.space.id)).toEqual(['me']);
  });

  it('C20-U01 a carried task reads "From …"; the 04:00 turn keeps yesterday until the night is over', () => {
    expect(carriedLabel('2026-10-24', '2026-10-26').label).toBe('Sat');
    // 02:00 on Saturday with the app on Friday: Friday stays (the app asks); at 04:00 it moves on.
    expect(dayTurn('2026-10-23', new Date(2026, 9, 24, 2, 0)).kind).toBe('ask');
    expect(dayTurn('2026-10-23', new Date(2026, 9, 24, 4, 0))).toEqual({ kind: 'switch', to: '2026-10-24' });
  });

  it('C20-U01 the empty lines appear only when true', () => {
    expect(menuBarEmptyLines(3, 12)).toEqual(['Tomorrow has 3.', 'The Backlog has 12 waiting for a day.']);
    expect(menuBarEmptyLines(0, 12)).toEqual(['The Backlog has 12 waiting for a day.']);
    expect(menuBarEmptyLines(0, 0)).toEqual([]);
  });
});

describe('MC-U01 the number beside the tick', () => {
  it('MC-U01 counts the open tasks the sheet lists, out of all of them; only yours ever reach it', () => {
    const me = space('me', 'personal', 'Personal');
    const nw = space('nw', 'team', 'Northwind');
    const groups = gatherToday(
      [me, nw],
      {
        me: [task('Pay the bill', null), task('Renew the domain', 'u1', true)],
        nw: [
          task('Review the PR', 'u1'),
          task('Their task', 'u2'),
          task('Book flights', 'u1', true),
          task('Sync', 'u1'),
        ],
      },
      'u1',
    );
    expect(todayLeft(groups)).toEqual({ left: 3, total: 5 });
    const allDone = gatherToday([me], { me: [task('Pay the bill', null, true)] }, 'u1');
    expect(todayLeft(allDone)).toEqual({ left: 0, total: 1 });
    expect(todayLeft([])).toEqual({ left: 0, total: 0 });
  });
});
