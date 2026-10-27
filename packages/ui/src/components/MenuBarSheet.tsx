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
  /** The summon, beside New task. */
  shortcut?: string;
  onToggle?: (row: MenuBarRowItem, done: boolean) => void;
  onOpen?: (row: MenuBarRowItem) => void;
  onNew?: () => void;
  /** New note (chunk 22): the note window on a blank note, over whatever app you are in. */
  onNewNote?: () => void;
  /** The note window's shortcut, beside New note; an app too old to register it gives none. */
  noteShortcut?: string;
  onOpenApp?: () => void;
  onFeedback?: () => void;
  onQuit?: () => void;
  /**
   * The ⋯'s first item, in an app that can say where its updates stand: Check for updates…, or Restart to update
   * (with the version as its hint) once one is downloaded. Not while signed out: Settings needs you signed in.
   */
  update?: { ready?: string; onCheck?: () => void; onRestart?: () => void };
  className?: string;
}

/** The byline as Today writes it: "From Sat", the due date (red when overdue), the project's dot, the Jira key. */
function Byline({ row }: { row: MenuBarRowItem }) {
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
        {row.project.name}
      </span>,
    );
  if (row.jira) bits.push(<span key="j">{row.jira}</span>);
  return bits.length ? <span className="tp-mb-by">{bits}</span> : null;
}

/** One task: the real checkbox (the ink tick and its sparkle), and the title that opens it on the desk. */
export function MenuBarRow({
  row,
  onToggle,
  onOpen,
}: {
  row: MenuBarRowItem;
  onToggle?: (row: MenuBarRowItem, done: boolean) => void;
  onOpen?: (row: MenuBarRowItem) => void;
}) {
  return (
    <div className={cx('tp-mb-r', row.done && 'tp-done')} role="listitem">
      <Checkbox size="sm" label={row.title} checked={!!row.done} onChange={(v) => onToggle?.(row, v)} />
      <button
        type="button"
        className="tp-mb-m"
        aria-label={`Open ${row.title} in Tudu`}
        onClick={() => onOpen?.(row)}
      >
        <span className="tp-mb-t">{row.title}</span>
        <Byline row={row} />
      </button>
    </div>
  );
}

const KEY_NAMES: Record<string, string> = { '⌘': 'Meta', '⇧': 'Shift', '⌥': 'Alt', '⌃': 'Control' };

/** `⌘⇧N` as aria-keyshortcuts writes it: `Meta+Shift+N`. */
function keyShortcuts(shortcut: string): string {
  return [...shortcut].map((k) => KEY_NAMES[k] ?? k.toUpperCase()).join('+');
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
  shortcut = '⌘⇧N',
  noteShortcut,
  onToggle,
  onOpen,
  onNew,
  onNewNote,
  onOpenApp,
  onFeedback,
  onQuit,
  update,
  className,
}: MenuBarSheetProps) {
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
            <div className="tp-mb-eb">{heading.eyebrow}</div>
            <div className="tp-mb-day">
              <h2>{heading.day}</h2>
              <span>{heading.date}</span>
            </div>
          </div>
          {state === 'day' ? <DayProgress done={done} total={total} compact size={30} /> : null}
        </div>
      ) : null}
      {offline ? (
        <Banner tone="warning" title="You’re offline.">
          Ticks save here and go when you’re back.
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
                  <span className="tp-mb-gn">{g.name}</span>
                  {`${g.rows.filter((r) => r.done).length} of ${g.rows.length}`}
                </div>
              ) : null}
              <div role="list" aria-label={`Today in ${g.name}`}>
                {g.rows.map((r) => (
                  <MenuBarRow key={r.key} row={r} onToggle={onToggle} onOpen={onOpen} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="tp-mb-f">
        {state === 'day' ? (
          <IconButton
            label="New task"
            className="tp-mb-ib"
            tipLabel={`New task  ${shortcut}`}
            tipSide="top"
            aria-keyshortcuts={keyShortcuts(shortcut)}
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
