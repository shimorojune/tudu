import { describe, expect, it } from 'vitest';
import { endOfGroup, groupByProject, NO_PROJECT, placeInGroup } from './groups';

const P = (id: string, position: number, spaceId = 's1') => ({
  id,
  spaceId,
  name: id.toUpperCase(),
  color: '#000',
  position,
});
const T = (id: string, projectId: string | null) => ({ id, projectId });

describe('C02-U47 groupByProject', () => {
  const projects = [P('plat', 2), P('north', 1), P('home', 3)];

  it('follows the project order, keeps the day order inside a group and puts No project last', () => {
    const tasks = [T('a', 'plat'), T('b', null), T('c', 'north'), T('d', 'plat'), T('e', 'north')];
    const g = groupByProject(tasks, projects);
    expect(g.map((x) => x.key)).toEqual(['north', 'plat', NO_PROJECT]);
    expect(g.map((x) => x.tasks.map((t) => t.id))).toEqual([['c', 'e'], ['a', 'd'], ['b']]);
    expect(g[0]).toMatchObject({ name: 'NORTH', color: '#000', spaceId: 's1' });
    expect(g[2]).toMatchObject({ name: 'No project' });
    expect(g[2]!.color).toBeUndefined();
  });

  it('leaves out projects with no task here, and has no No project group without one', () => {
    const g = groupByProject([T('a', 'home')], projects);
    expect(g.map((x) => x.key)).toEqual(['home']);
    expect(groupByProject([], projects)).toEqual([]);
  });

  it('puts a task whose project is gone under No project', () => {
    const g = groupByProject([T('a', 'gone'), T('b', 'plat')], projects);
    expect(g.map((x) => [x.key, x.tasks.map((t) => t.id)])).toEqual([
      ['plat', ['b']],
      [NO_PROJECT, ['a']],
    ]);
  });

  it('All spaces: spaces in the order given, then each space’s own project order', () => {
    const all = [P('x', 1, 's2'), P('y', 2, 's2'), P('z', 1, 's1'), P('q', 1, 's3')];
    const tasks = [T('1', 'q'), T('2', 'y'), T('3', 'z'), T('4', 'x')];
    expect(groupByProject(tasks, all, ['s2', 's1']).map((g) => g.key)).toEqual(['x', 'y', 'z', 'q']);
  });
});

describe('C02-U48 placeInGroup', () => {
  // The day: a1 b1 a2 n1 a3 b2 (a = one project, b = another, n = none)
  const order = ['a1', 'b1', 'a2', 'n1', 'a3', 'b2'];
  const a = ['a1', 'a2', 'a3'];
  const apply = (id: string, at: number) => {
    const rest = order.filter((x) => x !== id);
    rest.splice(at, 0, id);
    return rest;
  };

  it('first place in the group lands just before the group’s first other task', () => {
    const at = placeInGroup(order, a, 'a3', 0);
    expect(apply('a3', at)).toEqual(['a3', 'a1', 'b1', 'a2', 'n1', 'b2']);
  });

  it('a middle place lands just before the group-mate that follows', () => {
    const at = placeInGroup(order, a, 'a1', 1);
    expect(apply('a1', at)).toEqual(['b1', 'a2', 'n1', 'a1', 'a3', 'b2']);
  });

  it('last place lands right after the group’s last other task', () => {
    const at = placeInGroup(order, a, 'a1', 2);
    expect(apply('a1', at)).toEqual(['b1', 'a2', 'n1', 'a3', 'a1', 'b2']);
  });

  it('no other project’s tasks change their order', () => {
    for (const [id, to] of [
      ['a1', 2],
      ['a3', 0],
      ['a2', 0],
      ['a2', 2],
    ] as const) {
      const next = apply(id, placeInGroup(order, a, id, to));
      expect(next.filter((x) => !x.startsWith('a'))).toEqual(['b1', 'n1', 'b2']);
      const mates = a.filter((x) => x !== id);
      mates.splice(to, 0, id);
      expect(next.filter((x) => x.startsWith('a'))).toEqual(mates);
    }
  });

  it('a task alone in its group stays where it is', () => {
    expect(placeInGroup(order, ['n1'], 'n1', 0)).toBe(3);
  });

  it('endOfGroup is right after the group’s last task, or the end of the list', () => {
    expect(endOfGroup(order, a)).toBe(5);
    expect(endOfGroup(order, ['b1', 'b2'])).toBe(6);
    expect(endOfGroup(order, [])).toBe(6);
  });
});
