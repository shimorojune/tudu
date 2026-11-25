import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { settleFrom } from '../lib/motion';
import { itemByKey, useReorder } from '../lib/reorder';
import { useMine } from '../lib/scramble';
import { ScrambledPill } from './ScrambledPill';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { NoteIcon } from './NoteParts';
import { Banner } from './Banner';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { DayProgress } from './DayProgress';
import { IconButton } from './IconButton';
import { Logo } from './Logo';
import { Menu } from './Menu';
import type { TaskCarried, TaskDue, TaskProject } from './TaskRow';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';

/** One task in the sheet: the same byline words as its row on Today. */
export interface MenuBarRowItem {
  key: string;
  title: string;
  done?: boolean;
  carried?: TaskCarried;
  due?: TaskDue;
  project?: TaskProject;
  jira?: string;
}

export interface MenuBarGroupItem {
  key: string;
  name: string;
  space: SpaceTileSpace;
  rows: MenuBarRowItem[];
}

export interface MenuBarSheetProps {
  /** `day`: today's tasks; `empty`: nothing today; `signed-out`: Sign in first. */
  state: 'day' | 'empty' | 'signed-out';
  /** "Today · Week 43", "Friday", "23 October". */
  heading?: { eyebrow: string; day: string; date: string };
  groups?: MenuBarGroupItem[];
  /** The empty state's lines after "Nothing planned for today.", each only when true. */
  emptyLines?: string[];
  offline?: boolean;
  /** "Tudu", "Tudu Staging": Open and Quit name the app. */
  appName?: string;
  /** New task's keys from anywhere (⇧⌘N), beside it; none while they are off or another app has them. */
  shortcut?: string;
  onToggle?: (row: MenuBarRowItem, done: boolean) => void;
  onOpen?: (row: MenuBarRowItem) => void;
  /**
   * A row dragged (or moved with ⌥↑ / ⌥↓) to place `to` among its own space's rows (#122). Rows move only inside
   * their group: each space keeps its own day. Without it nothing drags and no grip shows.
   */
  onReorder?: (groupKey: string, key: string, to: number) => void;
  /** A move the server turned down: a red line under the heading, "It’s back where it was. Try again." */
  moveError?: boolean;
  onNew?: () => void;
  /** New note (chunk 22): the note window on a blank note, over whatever app you are in. */
  onNewNote?: () => void;
  /** New note's keys, the same way; an app too old to register them gives none. */
  noteShortcut?: string;
  onOpenApp?: () => void;
  onFeedback?: () => void;
  onQuit?: () => void;
  /**
   * The ⋯'s first item, in an app that can say where its updates stand: Check for updates…, or Restart to update
   * (with the version as its hint) once one is downloaded. Not while signed out: Settings needs you signed in.
   */
  update?: { ready?: string; onCheck?: () => void; onRestart?: () => void };
  /**
   * What is new in the Inbox: a line under the heading while the count is above 0, opening the Inbox. It grows in
   * and out with the count, so the rows below slide instead of jumping.
   */
  inbox?: { count: number; onOpen?: () => void };
  className?: string;
}

/** "2 new in your Inbox": always in the sheet, collapsed (and out of the reading order) while nothing is new. */
function InboxLine({ inbox }: { inbox?: MenuBarSheetProps['inbox'] }) {
  const count = inbox?.count ?? 0;
  const shown = count > 0;
  return (
    <div className={cx('tp-mb-ibx', shown && 'tp-on')} aria-hidden={!shown} inert={!shown}>
      <div>
        <button
          type="button"
          className="tp-mb-ibx-b"
          aria-label={shown ? `${count} new in your Inbox, open the Inbox` : undefined}
          tabIndex={shown ? undefined : -1}
          onClick={inbox?.onOpen}
        >
          <span className="tp-mb-ibx-dot" aria-hidden="true" />
          <Icon name="inbox" size={15} />
          <span className="tp-mb-ibx-t">{shown ? `${count} new in your Inbox` : ''}</span>
          <Icon name="right" size={14} />
        </button>
      </div>
    </div>
  );
}

/** The byline as Today writes it: "From Sat", the due date (red when overdue), the project's dot, the Jira key. */
function Byline({ row }: { row: MenuBarRowItem }) {
  const mine = useMine();
  const bits = [];
  if (row.carried)
    bits.push(
      <span key="c" className={cx(row.carried.slipping && 'tp-od')}>
        From {row.carried.label}
      </span>,
    );
  if (row.due)
    bits.push(
      <span key="d" className={cx(row.due.overdue && 'tp-od')}>
        {row.due.overdue ? 'Overdue' : `Due ${row.due.label}`}
      </span>,
    );
  if (row.project)
    bits.push(
      <span key="p">
        <i style={{ background: row.project.color }} aria-hidden="true" />
        {mine(row.project.name)}
      </span>,
    );
  if (row.jira) bits.push(<span key="j">{row.jira}</span>);
  return bits.length ? <span className="tp-mb-by">{bits}</span> : null;
}

function Grip() {
  return (
    <span className="tp-grip" aria-hidden="true" title="Drag to reorder">
      <svg width={8} height={14} viewBox="0 0 8 14" aria-hidden="true">
        {[1.5, 7, 12.5].map((y) => (
          <g key={y}>
            <circle cx={1.5} cy={y} r={1.3} fill="currentColor" />
            <circle cx={6.5} cy={y} r={1.3} fill="currentColor" />
          </g>
        ))}
      </svg>
    </span>
  );
}

/**
 * One task: the real checkbox (the ink tick and its sparkle), and the title that opens it on the desk. `movable`
 * rows carry the grip in the left margin and drag from anywhere but the checkbox (#122).
 */
export function MenuBarRow({
  row,
  movable,
  onToggle,
  onOpen,
}: {
  row: MenuBarRowItem;
  movable?: boolean;
  onToggle?: (row: MenuBarRowItem, done: boolean) => void;
  onOpen?: (row: MenuBarRowItem) => void;
}) {
  const mine = useMine();
  return (
    <div
      className={cx('tp-mb-r', row.done && 'tp-done', movable && 'tp-mb-mv')}
      role="listitem"
      data-key={row.key}
      {...(movable ? { 'data-reorder': '' } : null)}
    >
      {movable ? <Grip /> : null}
      <Checkbox size="sm" label={row.title} checked={!!row.done} onChange={(v) => onToggle?.(row, v)} />
      <button
        type="button"
        className="tp-mb-m"
        aria-label={`Open ${row.title} in Tudu`}
        aria-keyshortcuts={movable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
        onClick={() => onOpen?.(row)}
      >
        <span className="tp-mb-t">{mine(row.title)}</span>
        <Byline row={row} />
      </button>
    </div>
  );
}

/**
 * One space's rows. With `onReorder` and more than one row they reorder as Today's do: drag a row (or its grip), or
 * ⌥↑ / ⌥↓ on a focused title; the row glides into its slot and washes once.
 */
function GroupRows({
  group,
  onToggle,
  onOpen,
  onReorder,
}: {
  group: MenuBarGroupItem;
  onToggle?: MenuBarSheetProps['onToggle'];
  onOpen?: MenuBarSheetProps['onOpen'];
  onReorder?: MenuBarSheetProps['onReorder'];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rows = group.rows;
  const movable = !!onReorder && rows.length > 1;
  const [said, setSaid] = useState('');
  const keyFlip = useRef<{ key: string; top: number; focus: HTMLElement } | null>(null);
  const down = useReorder(
    ref,
    (from, to, key) => {
      if (from !== to) onReorder?.(group.key, key, to);
    },
    { grab: '.tp-mb-m' },
  );
  // A keyboard move glides the row into its new slot and keeps the keyboard on its title.
  useLayoutEffect(() => {
    const f = keyFlip.current;
    if (!f || !ref.current) return;
    keyFlip.current = null;
    const el = itemByKey(ref.current, f.key);
    if (el) settleFrom(el, f.top);
    if (f.focus.isConnected && document.activeElement !== f.focus) f.focus.focus({ preventScroll: true });
  });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!movable || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>('[data-reorder]');
    if (!item || item.parentNode !== ref.current) return;
    const key = item.getAttribute('data-key')!;
    const from = rows.findIndex((r) => r.key === key);
    const to = Math.max(0, Math.min(rows.length - 1, from + (e.key === 'ArrowUp' ? -1 : 1)));
    e.preventDefault();
    if (from < 0 || to === from) return;
    keyFlip.current = { key, top: item.getBoundingClientRect().top, focus: target };
    onReorder?.(group.key, key, to);
    setSaid(`Moved to place ${to + 1} of ${rows.length}`);
  }

  return (
    <>
      <div
        ref={ref}
        role="list"
        aria-label={`Today in ${group.name}`}
        onPointerDown={movable ? down : undefined}
        onKeyDown={onKeyDown}
      >
        {rows.map((r) => (
          <MenuBarRow key={r.key} row={r} movable={movable} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}

const KEY_NAMES: Record<string, string> = { '⌘': 'Meta', '⇧': 'Shift', '⌥': 'Alt', '⌃': 'Control' };

/** `⇧⌘N` as aria-keyshortcuts writes it: `Shift+Meta+N`; a named key stays a word (`⌥Space`: `Alt+Space`). */
function keyShortcuts(shortcut: string): string {
  const mods = [...shortcut].filter((k) => KEY_NAMES[k]);
  const key = [...shortcut].filter((k) => !KEY_NAMES[k]).join('');
  return [...mods.map((k) => KEY_NAMES[k]), key.length === 1 ? key.toUpperCase() : key].join('+');
}

/**
 * Today from the menu bar (K-MenuBar): the day and its ring, every space's tasks (headed when there is more than
 * one), and a foot of icon buttons for New task and New note (each with its shortcut in the tooltip), Open Tudu and ⋯
 * (Send feedback…, Quit). Signed out it asks you to sign in and keeps ⋯ for
 * Quit alone.
 */
export function MenuBarSheet({
  state,
  heading,
  groups = [],
  emptyLines = [],
  offline,
  appName = 'Tudu',
  shortcut,
  noteShortcut,
  onToggle,
  onOpen,
  onReorder,
  moveError,
  onNew,
  onNewNote,
  onOpenApp,
  onFeedback,
  onQuit,
  update,
  inbox,
  className,
}: MenuBarSheetProps) {
  const mine = useMine();
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const done = groups.reduce((n, g) => n + g.rows.filter((r) => r.done).length, 0);
  const headed = groups.length > 1;
  const more = (
    <Menu
      label="More"
      side="top"
      align="end"
      items={[
        update &&
          state !== 'signed-out' &&
          (update.ready
            ? { label: 'Restart to update', hint: update.ready, onSelect: update.onRestart }
            : { label: 'Check for updates…', onSelect: update.onCheck }),
        state !== 'signed-out' && { label: 'Send feedback…', onSelect: onFeedback },
        { label: `Quit ${appName}`, hint: '⌘Q', onSelect: onQuit },
      ]}
    >
      <IconButton label="More" tip={false}>
        <Icon name="more" size={16} />
      </IconButton>
    </Menu>
  );

  if (state === 'signed-out')
    return (
      <div className={cx('tp-root tp-mb', className)} role="dialog" aria-label={appName}>
        <div className="tp-mb-empty">
          <Logo size={30} />
          <h3>Sign in to see your day.</h3>
          <p>Your tasks show here once you are signed in on this Mac.</p>
          <Button variant="primary" size="sm" onClick={onOpenApp}>
            Open {appName}
          </Button>
        </div>
        <div className="tp-mb-f">
          <span className="tp-mb-sp" />
          {more}
        </div>
      </div>
    );

  return (
    <div className={cx('tp-root tp-mb', className)} role="dialog" aria-label="Today">
      {heading ? (
        <div className="tp-mb-h">
          <div>
            {/* The menu bar sheet is a window of its own: it carries the Scrambled pill too, on the eyebrow's line
                (#123), so the day and the date never wrap or move for it. */}
            <div className="tp-mb-eb">
              <span>{heading.eyebrow}</span>
              <ScrambledPill className="tp-mb-scr" />
            </div>
            <div className="tp-mb-day">
              <h2>{heading.day}</h2>
              <span>{heading.date}</span>
            </div>
          </div>
          {state === 'day' ? <DayProgress done={done} total={total} compact size={30} /> : null}
        </div>
      ) : null}
      {heading ? <InboxLine inbox={inbox} /> : null}
      {offline ? (
        <Banner tone="warning" title="You’re offline.">
          Ticks and moves save here and go when you’re back.
        </Banner>
      ) : null}
      {moveError && state === 'day' ? (
        <Banner tone="error" title="It’s back where it was.">
          Try again.
        </Banner>
      ) : null}
      {state === 'empty' ? (
        <div className="tp-mb-empty">
          <h3>Nothing planned for today.</h3>
          {emptyLines.length ? <p>{emptyLines.join(' ')}</p> : null}
          <Button variant="primary" size="sm" icon={<Icon name="plus" size={14} />} onClick={onNew}>
            New task
          </Button>
        </div>
      ) : (
        <div className="tp-mb-b">
          {groups.map((g) => (
            <section key={g.key} className="tp-mb-g" aria-label={g.name}>
              {headed ? (
                <div className="tp-mb-gh">
                  <SpaceTile space={g.space} size={20} />
                  <span className="tp-mb-gn">{mine(g.name)}</span>
                  {`${g.rows.filter((r) => r.done).length} of ${g.rows.length}`}
                </div>
              ) : null}
              <GroupRows group={g} onToggle={onToggle} onOpen={onOpen} onReorder={onReorder} />
            </section>
          ))}
        </div>
      )}
      <div className="tp-mb-f">
        {state === 'day' ? (
          <IconButton
            label="New task"
            className="tp-mb-ib"
            tipLabel={shortcut ? `New task  ${shortcut}` : undefined}
            tipSide="top"
            aria-keyshortcuts={shortcut ? keyShortcuts(shortcut) : undefined}
            onClick={onNew}
          >
            <Icon name="plus" size={16} />
          </IconButton>
        ) : null}
        {onNewNote ? (
          <IconButton
            label="New note"
            className="tp-mb-ib"
            tipLabel={noteShortcut ? `New note  ${noteShortcut}` : undefined}
            tipSide="top"
            aria-keyshortcuts={noteShortcut ? keyShortcuts(noteShortcut) : undefined}
            onClick={onNewNote}
          >
            <NoteIcon name="note" size={16} />
          </IconButton>
        ) : null}
        <span className="tp-mb-sp" />
        <Button variant="quiet" size="sm" aria-label={`Open ${appName}`} onClick={onOpenApp}>
          Open Tudu
        </Button>
        {more}
      </div>
    </div>
  );
}
