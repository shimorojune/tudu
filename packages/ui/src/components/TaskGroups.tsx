import { NO_PROJECT } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { useTurn } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { useMine } from '../lib/scramble';
import { AddTask } from './AddTask';
import { FoldAway } from './FoldAway';
import { TaskList, type TaskItem, type TaskListProps, type TaskMove } from './TaskList';

export interface GroupHeaderProps {
  name: string;
  /** The project's colour; without one the dot is a hollow ring (No project). */
  color?: string;
  /** Tasks not crossed off yet. At 0 the count gives way to a tick. */
  left: number;
  folded?: boolean;
  onFold?: (folded: boolean) => void;
  /** With it, a "+" at the right end (on hover; always on phones) to write a task into this group. */
  onAdd?: () => void;
  /** Phones: a 44px line and the "+" always shown. */
  compact?: boolean;
}

/**
 * The slim line over a project's tasks in the "By project" view: a caret, the project's dot, its name and how many
 * are left (a success tick when none are). The whole title is one button that folds the group to this line and opens
 * it again. The caret, dot and tick are tied to the name's baseline, so they sit level whatever the font's metrics.
 */
export function GroupHeader({ name: said, color, left, folded, onFold, onAdd, compact }: GroupHeaderProps) {
  const name = useMine()(said);
  const turned = useTurn(String(left));
  return (
    <div className={cx('tp-root tp-gh', compact && 'tp-compact')}>
      <button
        type="button"
        className="tp-gh-main"
        aria-expanded={folded ? 'false' : 'true'}
        aria-label={`${name}, ${left ? `${left} left` : 'all crossed off'}`}
        title={folded ? `Open ${name}` : `Fold ${name}`}
        onClick={() => onFold?.(!folded)}
      >
        <span className="tp-gh-car" aria-hidden="true">
          <Icon name="caret" size={14} />
        </span>
        <i
          className={cx('tp-gh-dot', !color && 'tp-gh-none')}
          style={color ? { background: color } : undefined}
          aria-hidden="true"
        />
        <span className="tp-gh-name">{name}</span>
        {left ? (
          <span key={turned} className={cx('tp-gh-n', turned > 0 && 'tp-gh-turn')}>
            {left}
          </span>
        ) : (
          <span key="tick" className={cx('tp-gh-tick', turned > 0 && 'tp-gh-turn')} aria-hidden="true">
            <Icon name="check" size={13} stroke={2.4} />
          </span>
        )}
      </button>
      {onAdd ? (
        <button
          type="button"
          className="tp-gh-add"
          aria-label={`Add a task to ${name}`}
          title={`Add a task to ${name}`}
          onClick={onAdd}
        >
          <Icon name="plus" size={13} stroke={2.4} />
        </button>
      ) : null}
    </div>
  );
}

export interface TaskGroupItem {
  /** The project's id, or NO_PROJECT for the tasks without one. */
  key: string;
  name: string;
  color?: string;
  tasks: TaskItem[];
}

export interface TaskGroupsProps extends Omit<
  TaskListProps,
  | 'tasks'
  | 'label'
  | 'onAdd'
  | 'onReorder'
  | 'filter'
  | 'filterSpace'
  | 'group'
  | 'onReceive'
  | 'locked'
  | 'brief'
> {
  /** The page's tasks by project, in the order to show them (No project last). */
  groups: TaskGroupItem[];
  /** Keys of the folded groups. */
  folded?: string[];
  onFold?: (group: string, folded: boolean) => void;
  /**
   * A task written into a group: on its own line (the header's "+"), slotted in above `before`, or, for NO_PROJECT,
   * on the page's last line. Return the new row's key so it opens its gap with the new-task wash.
   */
  onAdd?: (text: string, group: string, before?: string) => string | void;
  /** A row moved inside its group (drag, or Alt with an arrow key): `from` and `to` are places in that group. */
  onReorder?: (group: string, moved: TaskMove) => void;
  /** The words on a project's own writing line. "Add to Platform…" by default. */
  groupAddLabel?: (name: string) => string;
}

const EXIT_MS = 400;
const bare = (g: TaskGroupItem): TaskGroupItem => ({ key: g.key, name: g.name, color: g.color, tasks: [] });

/**
 * A page's tasks under their projects ("By project"): a GroupHeader and a TaskList per group. Fold a group from its
 * header; rows reorder inside their group only (a task changes project in its panel, and day with its calendar
 * button). One writing line closes the page and writes to No project; a header's "+" opens a line of the project's
 * own with the cursor in it. There are never two lines together: No project's "+" puts the cursor in the page's
 * line, and that line makes way while the last project's own line is open. A group that loses its last task folds
 * away; one that gains its first fades in.
 */
export function TaskGroups({
  groups,
  folded = [],
  onFold,
  onAdd,
  onReorder,
  groupAddLabel = (name) => `Add to ${name}…`,
  addLabel,
  addKey,
  onAddClose,
  resetKey,
  flashKey,
  compact,
  ...list
}: TaskGroupsProps) {
  const mine = useMine();
  // The project whose own writing line is open, and a counter that opens the page's line.
  const [line, setLine] = useState<string | null>(null);
  const [endBump, setEndBump] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [wrote, setWrote] = useState<string | undefined>(undefined);
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setLine(null);
  }

  // Groups that just lost their last task stay a moment as a bare header and fold away; new ones fade in.
  const sig = groups.map((g) => g.key).join('|');
  const [seen, setSeen] = useState({ sig, items: groups.map(bare) });
  const [gone, setGone] = useState<{ item: TaskGroupItem; after: string | null }[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);
  if (seen.sig !== sig) {
    const now = new Set(groups.map((g) => g.key));
    const before = new Set(seen.items.map((g) => g.key));
    const left = seen.items
      .map((item, i) => ({ item, after: seen.items[i - 1]?.key ?? null }))
      .filter((g) => !now.has(g.item.key));
    setSeen({ sig, items: groups.map(bare) });
    // A new day (resetKey) starts fresh: nothing folds away or fades in.
    const turned = resetKey !== seenReset;
    setGone(turned ? [] : [...gone.filter((g) => !now.has(g.item.key)), ...left]);
    setFresh(turned ? [] : groups.filter((g) => !before.has(g.key)).map((g) => g.key));
    if (line && !now.has(line)) setLine(null);
  }
  useEffect(() => {
    if (!gone.length) return;
    const t = setTimeout(() => setGone([]), EXIT_MS);
    return () => clearTimeout(t);
  }, [gone]);

  // A line opened on a folded group: the cursor goes in once the group has opened (a folded body is inert, so the
  // field's own autofocus is lost).
  const root = useRef<HTMLDivElement | null>(null);
  const lineShut = !!line && folded.includes(line);
  useEffect(() => {
    if (!line || lineShut) return;
    // The body may still read as hidden for a frame or two after the fold flips; keep trying until the field takes it.
    let frame = 0;
    let tries = 0;
    const take = () => {
      const field = root.current?.querySelector<HTMLElement>(
        `section[data-group="${CSS.escape(line)}"] .tp-addtask-input`,
      );
      if (field && document.activeElement !== field) field.focus({ preventScroll: true });
      if (document.activeElement !== field && tries++ < 12) frame = requestAnimationFrame(take);
    };
    take();
    return () => cancelAnimationFrame(frame);
  }, [line, lineShut]);

  // Showing a task that sits in a folded group opens the group first.
  const locate = list.locateKey;
  const located = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!locate || located.current === locate) return;
    const id = locate.split(':')[0]!;
    const g = groups.find((x) => x.tasks.some((t) => t.key === id || t.id === id));
    if (!g) return;
    located.current = locate;
    if (folded.includes(g.key)) onFold?.(g.key, false);
  }, [locate, groups, folded, onFold]);

  const last = groups[groups.length - 1];
  const lineIsLast = !!line && !!last && last.key === line && line !== NO_PROJECT;
  const all: { item: TaskGroupItem; out: boolean }[] = groups.map((item) => ({ item, out: false }));
  for (const g of gone) {
    const at = g.after ? all.findIndex((x) => x.item.key === g.after) + 1 : 0;
    all.splice(at, 0, { item: g.item, out: true });
  }

  function openLine(key: string) {
    if (key === NO_PROJECT) {
      setLine(null);
      setEndOpen(true);
      setEndBump((n) => n + 1);
      return;
    }
    if (folded.includes(key)) onFold?.(key, false);
    setLine(key);
  }

  return (
    <div ref={root} className={cx('tp-root tp-groups', compact && 'tp-compact')}>
      {all.map(({ item: g, out }) => {
        const shut = folded.includes(g.key);
        const left = g.tasks.filter((t) => !t.done).length;
        const body = (
          <section
            className={cx('tp-g', shut && 'tp-g-folded', fresh.includes(g.key) && 'tp-g-new')}
            aria-label={mine(g.name)}
            data-group={g.key}
          >
            <GroupHeader
              name={g.name}
              color={g.color}
              left={out ? 0 : left}
              folded={shut}
              compact={compact}
              onFold={out ? undefined : (v) => onFold?.(g.key, v)}
              onAdd={onAdd && !out ? () => openLine(g.key) : undefined}
            />
            <div className={cx('tp-g-body', shut && 'tp-g-shut')} inert={shut || out}>
              <div>
                <TaskList
                  {...list}
                  tasks={g.tasks}
                  label={`${mine(g.name)} tasks`}
                  compact={compact}
                  resetKey={`${resetKey ?? ''}|${g.key}`}
                  flashKey={wrote ?? flashKey}
                  addLabel={line === g.key && onAdd ? groupAddLabel(mine(g.name)) : undefined}
                  addKey={line === g.key ? g.key : undefined}
                  onAddClose={() => setLine((l) => (l === g.key ? null : l))}
                  onAdd={onAdd ? (text, before) => onAdd(text, g.key, before) : undefined}
                  onReorder={(_, moved) => onReorder?.(g.key, moved)}
                />
              </div>
            </div>
          </section>
        );
        return (
          <FoldAway key={g.key} show={!out}>
            {body}
          </FoldAway>
        );
      })}
      {addLabel && onAdd ? (
        <FoldAway show={!lineIsLast}>
          <AddTask
            label={addLabel}
            compact={compact}
            openKey={endBump ? `${addKey ?? ''}|${endBump}` : addKey}
            autoOpen={endOpen || (addKey !== undefined && addKey !== null)}
            onAdd={(text) => {
              const key = onAdd(text, NO_PROJECT);
              if (key) setWrote(key);
            }}
            onClose={() => {
              setEndOpen(false);
              onAddClose?.();
            }}
          />
        </FoldAway>
      ) : null}
    </div>
  );
}
