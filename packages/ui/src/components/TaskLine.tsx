import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { PersonDot, type PersonDotPerson } from './PersonDot';

export interface SharedTask {
  key: string;
  title: string;
  done?: boolean;
  due?: { label: string; overdue?: boolean } | null;
  project?: { name: string; color: string } | null;
  /** "From you" when you sent it. */
  from?: string | null;
}

export interface TaskLinePerson extends PersonDotPerson {
  name: string;
}

export interface TaskLineProps {
  task: SharedTask;
  /** Their mark and first name end the byline (the space's shared list). */
  who?: TaskLinePerson;
  /** The whole line is a button: it opens the task panel, to read and comment. */
  onOpen?: (task: SharedTask) => void;
  /** The located-row flash. */
  glow?: boolean;
  className?: string;
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Someone else's task, read-only: a box that shows done or not (you cannot cross off other people's tasks), the
 * title, and a quiet byline (due · project · who · From you). Done tasks strike through in muted ink.
 */
export function TaskLine({ task: t, who, onOpen, glow, className }: TaskLineProps) {
  const by = [];
  if (t.due)
    by.push(
      <span key="d" className={t.due.overdue ? 'tp-od' : undefined}>
        {t.due.label}
      </span>,
    );
  if (t.project)
    by.push(
      <span key="p">
        <i className="tp-sh-dot" style={{ background: t.project.color }} />
        {t.project.name}
      </span>,
    );
  if (who)
    by.push(
      <span key="w" className="tp-tl-who">
        <PersonDot person={who} size={16} />
        {first(who.name)}
      </span>,
    );
  if (t.from)
    by.push(
      <span key="f" className="tp-tl-from">
        <Icon name="send" size={11} />
        From {t.from}
      </span>,
    );
  return (
    <button
      type="button"
      className={cx('tp-root tp-tl', t.done && 'tp-done', glow && 'tp-glow', className)}
      aria-label={`${t.done ? 'Done: ' : ''}${t.title}`}
      onClick={() => onOpen?.(t)}
    >
      <span className={cx('tp-tl-box', t.done && 'tp-on')} aria-hidden="true">
        {t.done ? (
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.4 9.8 17.2 19.2 6.8" />
          </svg>
        ) : null}
      </span>
      <span className="tp-tl-main">
        <span className="tp-tl-t">{t.title}</span>
        {by.length ? <span className="tp-tl-by">{by}</span> : null}
      </span>
    </button>
  );
}
