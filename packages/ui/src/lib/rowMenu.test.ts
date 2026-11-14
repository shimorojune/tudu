import { describe, expect, it } from 'vitest';
import {
  findRowMenuItem,
  rowMenuModel,
  type RowMenuContext,
  type RowMenuEntry,
  type RowMenuItem,
} from './rowMenu';

const TODAY = '2026-11-15';
const ALL: RowMenuContext['can'] = {
  open: true,
  toggle: true,
  move: true,
  due: true,
  project: true,
  link: true,
  delete: true,
};
const PROJECTS = [
  { id: 'p1', name: 'Northwind', color: '#2f5d8a' },
  { id: 'p2', name: 'Platform', color: '#5a7d4f' },
];
const ctx = (over: Partial<RowMenuContext> = {}): RowMenuContext => ({
  today: TODAY,
  day: TODAY,
  projects: PROJECTS,
  can: ALL,
  ...over,
});
const keys = (e: RowMenuEntry[]) => e.map((x) => (x === 'sep' ? '|' : x.key));
const sub = (e: RowMenuEntry[], k: string) =>
  findRowMenuItem(e, k)!.sub!.filter((x) => x !== 'sep') as RowMenuItem[];

describe('rowMenuModel', () => {
  it('RM-U01 an open task on today: items in order, Today ticked, no Remove without a due date', () => {
    const e = rowMenuModel({ id: 'ME-41' }, ctx());
    expect(keys(e)).toEqual(['open', 'toggle', '|', 'move', 'due', 'project', '|', 'link', 'id', '|', 'del']);
    expect(findRowMenuItem(e, 'toggle')!.label).toBe('Mark as done');
    expect(findRowMenuItem(e, 'move')!.hint).toBe('Today');
    const move = sub(e, 'move');
    expect(move.map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'Pick a day…', 'Backlog']);
    expect(move.find((x) => x.key === 'm-today')!.checked).toBe(true);
    expect(move.find((x) => x.key === 'm-tmr')!.act).toEqual({ k: 'move', to: '2026-11-16' });
    expect(sub(e, 'due').map((x) => x.key)).toEqual(['d-today', 'd-tmr', 'd-pick']);
    expect(findRowMenuItem(e, 'id')!.hint).toBe('ME-41');
    expect(findRowMenuItem(e, 'del')!.danger).toBe(true);
  });

  it('RM-U02 done, the Backlog, a due date and a project each show where the task is', () => {
    const e = rowMenuModel(
      { id: 'ME-2', done: true, due: { label: 'Fri', iso: '2026-11-20' }, project: { name: 'Platform' } },
      ctx({ day: null }),
    );
    expect(findRowMenuItem(e, 'toggle')!.label).toBe('Mark as not done');
    expect(findRowMenuItem(e, 'move')!.hint).toBe('Backlog');
    expect(findRowMenuItem(e, 'm-bl')!.checked).toBe(true);
    expect(findRowMenuItem(e, 'm-today')!.checked).toBe(false);
    expect(findRowMenuItem(e, 'due')!.hint).toBe('Fri');
    expect(findRowMenuItem(e, 'd-clear')).toMatchObject({
      label: 'Remove due date',
      act: { k: 'due', to: null },
    });
    expect(findRowMenuItem(e, 'project')!.hint).toBe('Platform');
    expect(findRowMenuItem(e, 'p-p2')!.checked).toBe(true);
    expect(findRowMenuItem(e, 'p-none')!.checked).toBe(false);
  });

  it('RM-U03 no projects, projects loading, someone else’s task, and lists that cannot move', () => {
    expect(sub(rowMenuModel({}, ctx({ projects: [] })), 'project')).toEqual([
      { key: 'p-empty', label: 'No projects yet', disabled: true },
    ]);
    expect(sub(rowMenuModel({}, ctx({ projects: undefined })), 'project')[0]).toMatchObject({
      label: 'Loading…',
      disabled: true,
    });
    expect(keys(rowMenuModel({ id: 'ME-9', readOnly: true }, ctx()))).toEqual(['open', '|', 'link', 'id']);
    // The Backlog's Crossed off view: no calendar, so no Move to or Due date.
    const e = rowMenuModel({ id: 'ME-3', done: true }, ctx({ can: { ...ALL, move: false, due: false } }));
    expect(keys(e)).toEqual(['open', 'toggle', '|', 'project', '|', 'link', 'id', '|', 'del']);
    // A task not numbered yet has no ID to copy.
    expect(keys(rowMenuModel({}, ctx({ can: { open: true, link: false } })))).toEqual(['open']);
  });
});
