import { describe, expect, it } from 'vitest';
import { gatherAll, hasAllSpaces, placesFor, type GatherTask } from './allSpaces';
import { RESERVED_SLUGS, spaceSlug, type SpaceSummary } from './spaces';

const space = (id: string, kind: 'personal' | 'team', name: string): SpaceSummary => ({
  id,
  kind,
  name,
  color: null,
  role: 'member',
  slug: kind === 'personal' ? 'me' : id,
  prefix: id.toUpperCase(),
  members: kind === 'personal' ? 1 : 4,
  inbox: { toAnswer: 0, unread: 0 },
});
const DAY = '2026-10-18';
let n = 0;
const task = (
  id: string,
  spaceId: string,
  position: number,
  extra: Partial<GatherTask> = {},
): GatherTask & { title: string } => ({
  id,
  title: id,
  spaceId,
  day: DAY,
  ownerId: 'u1',
  position,
  createdAt: `2026-10-18T09:00:${String(n++).padStart(2, '0')}.000Z`,
  done: false,
  ...extra,
});

const me = space('me', 'personal', 'Personal');
const nw = space('nw', 'team', 'Northwind');
const pf = space('pf', 'team', 'Pilot Farm');
const ids = (l: { tasks: Array<{ id: string }> }) => l.tasks.map((t) => t.id);

describe('All spaces (chunk 21)', () => {
  it('C21-U01 three spaces in one list: an unarranged day reads Personal first, then the switcher, then each space’s order', () => {
    const lists = {
      nw: [task('nw-2', 'nw', 2048), task('nw-1', 'nw', 1024)],
      me: [task('me-1', 'me', 1024)],
      pf: [task('pf-1', 'pf', 512)],
    };
    expect(ids(gatherAll([nw, me, pf], lists, [], 'u1', DAY))).toEqual(['me-1', 'nw-1', 'nw-2', 'pf-1']);
    expect(hasAllSpaces([me])).toBe(false);
    expect(hasAllSpaces([me, nw])).toBe(true);
  });

  it('C21-U02 an arranged day: places win, a task with no place goes to the end oldest first, a stale place is none', () => {
    const a = task('a', 'nw', 1024);
    const b = task('b', 'me', 1024);
    const late1 = task('late1', 'pf', 1);
    const late2 = task('late2', 'me', 2048);
    const moved = task('moved', 'nw', 3000);
    const lists = { me: [b, late2], nw: [a, moved], pf: [late1] };
    const places = [
      { taskId: 'b', day: DAY, position: 100 },
      { taskId: 'a', day: DAY, position: 200 },
      // given on another day: the task has moved since, so it has no place here
      { taskId: 'moved', day: '2026-10-17', position: 50 },
    ];
    expect(ids(gatherAll([me, nw, pf], lists, places, 'u1', DAY))).toEqual([
      'b',
      'a',
      'late1',
      'late2',
      'moved',
    ]);
  });

  it('C21-U03 isolation: a cached space you are not in is dropped, a colleague’s task is dropped, your “only me” stays', () => {
    const lists = {
      me: [task('mine', 'me', 1)],
      nw: [
        task('hers', 'nw', 1, { ownerId: 'u2' }),
        task('ownerless', 'nw', 2, { ownerId: null }),
        task('private', 'nw', 3),
      ],
      // Pilot Farm is still cached but you are no longer in it
      pf: [task('left', 'pf', 1)],
      // a row filed under the wrong space never shows
      zz: [task('stray', 'nw', 9)],
    };
    expect(ids(gatherAll([me, nw], lists, [], 'u1', DAY))).toEqual(['mine', 'ownerless', 'private']);
  });

  it('C21-U04 the filter narrows to one space, and the counts follow what is shown', () => {
    const lists = {
      me: [task('m1', 'me', 1, { done: true }), task('m2', 'me', 2)],
      nw: [task('n1', 'nw', 1, { done: true }), task('n2', 'nw', 2), task('n3', 'nw', 3, { done: true })],
    };
    const all = gatherAll([me, nw], lists, [], 'u1', DAY);
    expect([all.done, all.total]).toEqual([3, 5]);
    const only = gatherAll([me, nw], lists, [], 'u1', DAY, 'nw');
    expect(ids(only)).toEqual(['n1', 'n2', 'n3']);
    expect([only.done, only.total]).toEqual([2, 3]);
    // the Backlog is its own list: day null
    const backlog = gatherAll(
      [me],
      { me: [task('b1', 'me', 1, { day: null }), task('t1', 'me', 2)] },
      [],
      'u1',
      null,
    );
    expect(ids(backlog)).toEqual(['b1']);
  });

  it('C21-U05 "all" is reserved: a space called All gets all-2', () => {
    expect(RESERVED_SLUGS.has('all')).toBe(true);
    expect(spaceSlug('All')).toBe('all-2');
    expect(spaceSlug('All', ['all-2'])).toBe('all-3');
  });

  it('C21-U17 placing: between placed neighbours only the moved task is written; otherwise the day is numbered afresh', () => {
    const order = [
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
      { id: 'c', position: 3072 },
    ];
    expect(placesFor(order, 'c', 0)).toEqual([{ id: 'c', position: 0 }]);
    expect(placesFor(order, 'a', 1)).toEqual([{ id: 'a', position: 2560 }]);
    // an unarranged day (no places yet): every task gets one, in the new order
    const loose = [
      { id: 'a', position: null },
      { id: 'b', position: null },
      { id: 'c', position: null },
    ];
    expect(placesFor(loose, 'c', 0)).toEqual([
      { id: 'c', position: 1024 },
      { id: 'a', position: 2048 },
      { id: 'b', position: 3072 },
    ]);
    // too close to split: renumbered
    const tight = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1 + 1e-7 },
      { id: 'c', position: 5 },
    ];
    expect(placesFor(tight, 'c', 1).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
});

import { test as ciFilterTest, expect as ciFilterExpect } from 'vitest';
ciFilterTest('CI filter test: fails on purpose', () => ciFilterExpect(1).toBe(2));
