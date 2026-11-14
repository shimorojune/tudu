import { addDays, type IsoDate } from '@tudu/core';

/** What a pick in the row menu (or the touch sheet) asks the list to do. */
export type RowMenuAct =
  | { k: 'open' }
  | { k: 'toggle' }
  | { k: 'move'; to: IsoDate | null }
  | { k: 'pickDay' }
  | { k: 'due'; to: IsoDate | null }
  | { k: 'pickDue' }
  | { k: 'project'; id: string | null }
  | { k: 'copyLink' }
  | { k: 'copyId' }
  | { k: 'delete' };

export interface RowMenuItem {
  key: string;
  label: string;
  /** Quiet words at the end of the line: the current day, due words, project, the task ID. */
  hint?: string;
  act?: RowMenuAct;
  sub?: RowMenuEntry[];
  /** Where the task is now: ticked, and picking it again does nothing. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** A project's colour. */
  dot?: string;
}

export type RowMenuEntry = RowMenuItem | 'sep';

export interface RowMenuProject {
  id: string;
  name: string;
  color: string;
}

export interface RowMenuTask {
  id?: string | null;
  done?: boolean;
  due?: { label: string; iso?: IsoDate };
  project?: { name: string; color?: string };
  /** Someone else's task: open and copy only. */
  readOnly?: boolean;
}

export interface RowMenuContext {
  today: IsoDate;
  /** The list's day; `null` is the Backlog. */
  day: IsoDate | null;
  /** The space's projects; `undefined` while they load. Leave `can.project` off to drop the item. */
  projects?: RowMenuProject[];
  can: {
    open?: boolean;
    toggle?: boolean;
    move?: boolean;
    due?: boolean;
    project?: boolean;
    link?: boolean;
    delete?: boolean;
  };
}

function dayHint(day: IsoDate | null, today: IsoDate): string {
  if (day === null) return 'Backlog';
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  return '';
}

/**
 * The row menu's items for one task, in order, with separators between the groups. The menu and the touch sheet both
 * read this, so they can never offer different actions.
 */
export function rowMenuModel(t: RowMenuTask, c: RowMenuContext): RowMenuEntry[] {
  const { today, day, can } = c;
  const tmr = addDays(today, 1);
  const ro = !!t.readOnly;
  const groups: RowMenuEntry[][] = [];

  const first: RowMenuEntry[] = [];
  if (can.open) first.push({ key: 'open', label: 'Open', act: { k: 'open' } });
  if (can.toggle && !ro)
    first.push({ key: 'toggle', label: t.done ? 'Mark as not done' : 'Mark as done', act: { k: 'toggle' } });
  groups.push(first);

  const change: RowMenuEntry[] = [];
  if (can.move && !ro) {
    change.push({
      key: 'move',
      label: 'Move to',
      hint: dayHint(day, today),
      sub: [
        { key: 'm-today', label: 'Today', checked: day === today, act: { k: 'move', to: today } },
        { key: 'm-tmr', label: 'Tomorrow', checked: day === tmr, act: { k: 'move', to: tmr } },
        { key: 'm-pick', label: 'Pick a day…', act: { k: 'pickDay' } },
        'sep',
        { key: 'm-bl', label: 'Backlog', checked: day === null, act: { k: 'move', to: null } },
      ],
    });
  }
  if (can.due && !ro) {
    const d = t.due?.iso;
    const sub: RowMenuEntry[] = [
      { key: 'd-today', label: 'Today', checked: d === today, act: { k: 'due', to: today } },
      { key: 'd-tmr', label: 'Tomorrow', checked: d === tmr, act: { k: 'due', to: tmr } },
      { key: 'd-pick', label: 'Pick a date…', act: { k: 'pickDue' } },
    ];
    if (t.due) sub.push('sep', { key: 'd-clear', label: 'Remove due date', act: { k: 'due', to: null } });
    change.push({ key: 'due', label: 'Due date', hint: t.due?.label ?? '', sub });
  }
  if (can.project && !ro) {
    const cur = t.project?.name ?? null;
    let sub: RowMenuEntry[];
    if (!c.projects) sub = [{ key: 'p-wait', label: 'Loading…', disabled: true }];
    else if (!c.projects.length) sub = [{ key: 'p-empty', label: 'No projects yet', disabled: true }];
    else
      sub = [
        ...c.projects.map<RowMenuItem>((p) => ({
          key: `p-${p.id}`,
          label: p.name,
          dot: p.color,
          checked: cur === p.name,
          act: { k: 'project', id: p.id },
        })),
        'sep',
        { key: 'p-none', label: 'No project', checked: !cur, act: { k: 'project', id: null } },
      ];
    change.push({ key: 'project', label: 'Project', hint: cur ?? '', sub });
  }
  groups.push(change);

  const copy: RowMenuEntry[] = [];
  if (can.link) copy.push({ key: 'link', label: 'Copy link', act: { k: 'copyLink' } });
  if (t.id) copy.push({ key: 'id', label: 'Copy task ID', hint: t.id, act: { k: 'copyId' } });
  groups.push(copy);

  if (can.delete && !ro)
    groups.push([{ key: 'del', label: 'Delete task', danger: true, act: { k: 'delete' } }]);

  return groups.filter((g) => g.length).flatMap((g, i) => (i ? (['sep', ...g] as RowMenuEntry[]) : g));
}

/** The item with this key, at the top level or in a submenu. */
export function findRowMenuItem(entries: RowMenuEntry[], key: string): RowMenuItem | undefined {
  for (const e of entries) {
    if (e === 'sep') continue;
    if (e.key === key) return e;
    const hit = e.sub && findRowMenuItem(e.sub, key);
    if (hit) return hit;
  }
  return undefined;
}
