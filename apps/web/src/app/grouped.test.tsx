import { NO_PROJECT, type Project, type Task } from '@tudu/core';
import type { TaskItem } from '@tudu/ui';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectGroups } from './grouped';
import { ALL_SCOPE, getGrouping, resetGrouping, setGrouped } from './grouping';

const P = (id: string, position: number, spaceId = 's1') =>
  ({ id, spaceId, name: id.toUpperCase(), color: '#000', position }) as Project;
const T = (id: string, projectId: string | null, spaceId = 's1') => ({ id, projectId, spaceId }) as Task;
const rows = (tasks: Task[]) => tasks.map((t) => ({ key: t.id, title: t.id }) as TaskItem);

const projects = [P('plat', 2), P('north', 1)];
const tasks = [T('a', 'plat'), T('b', null), T('c', 'north'), T('d', 'plat')];

function Tools(p: { tasks: Task[] }) {
  const g = useProjectGroups({
    spaceId: 's1',
    tasks: p.tasks,
    items: rows(p.tasks),
    projects,
    className: 'lead',
  });
  return (
    <div data-testid="tools">
      {g.control}
      <span>To do</span>
    </div>
  );
}

describe('the page’s groups', () => {
  beforeEach(() => resetGrouping());

  it('C06-U11 the tools row leads with My order | By project, the space’s choice; no switch under two groups', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Tools tasks={tasks} />);
    const sw = screen.getByRole('group', { name: 'Order' });
    expect(screen.getByTestId('tools').firstElementChild).toBe(sw);
    expect(sw.className).toContain('lead');
    expect([...sw.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['My order', 'By project']);
    await user.click(screen.getByRole('button', { name: 'By project' }));
    expect(getGrouping('s1').on).toBe(true);
    // one group only: the switch goes, the choice is kept
    rerender(<Tools tasks={[T('a', 'plat')]} />);
    expect(screen.queryByRole('group', { name: 'Order' })).toBeNull();
    expect(getGrouping('s1').on).toBe(true);
  });

  it('groups row for row; on only with the choice and two groups; a move and a new task map to the page’s order', () => {
    const { result, rerender } = renderHook(
      (p: { tasks: Task[] }) =>
        useProjectGroups({ spaceId: 's1', tasks: p.tasks, items: rows(p.tasks), projects }),
      { initialProps: { tasks } },
    );
    expect(result.current).toMatchObject({ wanted: false, on: false, view: 'mine' });
    act(() => setGrouped('s1', true));
    expect(result.current).toMatchObject({ wanted: true, on: true, view: 'by' });
    expect(result.current.groups.map((g) => [g.key, g.tasks.map((t) => t.key)])).toEqual([
      ['north', ['c']],
      ['plat', ['a', 'd']],
      [NO_PROJECT, ['b']],
    ]);
    const order = tasks.map((t) => t.id);
    // d goes first in Platform: before a, nothing else moves
    expect(result.current.place(order, 'plat', 'd', 0)).toBe(0);
    // a new Platform task goes right after d
    expect(result.current.end(order, 'plat')).toBe(4);
    expect(result.current.target('plat')).toEqual({ projectId: 'plat', spaceId: 's1' });
    expect(result.current.target(NO_PROJECT)).toEqual({});
    act(() => result.current.fold('north', true));
    expect(result.current.folded).toEqual(['north']);
    rerender({ tasks: [T('a', 'plat')] });
    expect(result.current).toMatchObject({ wanted: true, on: false, view: 'mine' });
  });

  it('C21-U24 All spaces: groups in switcher order; a written task goes to the group’s space and project; folds are the project’s space’s', () => {
    const all = [P('x', 1, 's2'), P('z', 1, 's1'), P('y', 2, 's2')];
    const list = [T('1', 'z', 's1'), T('2', 'y', 's2'), T('3', null, 's1'), T('4', 'x', 's2')];
    const { result } = renderHook(() =>
      useProjectGroups({
        spaceId: 's1',
        tasks: list,
        items: rows(list),
        projects: all,
        spaces: ['s2', 's1'],
      }),
    );
    expect(result.current.groups.map((g) => g.key)).toEqual(['x', 'y', 'z', NO_PROJECT]);
    expect(result.current.on).toBe(false);
    act(() => setGrouped(ALL_SCOPE, true));
    expect(result.current.on).toBe(true);
    expect(getGrouping('s1').on).toBe(false);
    expect(result.current.target('y')).toEqual({ projectId: 'y', spaceId: 's2' });
    // a row's project pill: every other group folds, each in its own space's memory
    act(() => result.current.only('y'));
    expect([...result.current.folded].sort()).toEqual([NO_PROJECT, 'x', 'z'].sort());
    expect(getGrouping('s2').folded).toEqual(['x']);
    expect(getGrouping('s1').folded).toEqual(['z']);
    expect(getGrouping(ALL_SCOPE).folded).toEqual([NO_PROJECT]);
  });
});
