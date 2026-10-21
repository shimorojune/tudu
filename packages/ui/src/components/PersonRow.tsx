import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { PersonDot, type PersonDotPerson } from './PersonDot';
import { TaskLine, type SharedTask } from './TaskLine';

export interface PersonRowProps {
  person: PersonDotPerson & { name: string; email?: string; you?: boolean; left?: boolean };
  tasks: SharedTask[];
  /** The quiet line: the email, or "You". */
  sub?: string;
  /** The head is a button: it opens their page. */
  onOpen?: () => void;
  onOpenTask?: (task: SharedTask) => void;
  /** How many lines show before "N more" (which also opens their page); 4 by default. */
  max?: number;
  emptyLabel?: string;
  className?: string;
}

/**
 * One member of a space on the People page's By person view: their mark, name, a quiet line, how their day is going
 * ("1 of 3 done") and a chevron; under it their shared tasks as lines.
 */
export function PersonRow({
  person: w,
  tasks,
  sub,
  onOpen,
  onOpenTask,
  max = 4,
  emptyLabel = 'Nothing shared',
  className,
}: PersonRowProps) {
  const done = tasks.filter((t) => t.done).length;
  const shown = tasks.slice(0, max);
  const rest = tasks.length - shown.length;
  return (
    <section className={cx('tp-root tp-prow', className)} aria-label={w.name}>
      <button type="button" className="tp-prow-head" onClick={onOpen}>
        <PersonDot person={w} size={34} />
        <span className="tp-prow-n">
          <span className="tp-prow-name">
            {w.name}
            {w.you ? <span className="tp-prow-you">You</span> : null}
            {w.left ? <span className="tp-prow-you">Left</span> : null}
          </span>
          <span className="tp-prow-sub">{sub ?? w.email}</span>
        </span>
        <span className="tp-prow-c">{tasks.length ? `${done} of ${tasks.length} done` : emptyLabel}</span>
        <span className="tp-prow-go" aria-hidden="true">
          <Icon name="right" size={14} />
        </span>
      </button>
      {shown.length ? (
        <div className="tp-prow-list">
          {shown.map((t) => (
            <TaskLine key={t.key} task={t} onOpen={onOpenTask} />
          ))}
          {rest > 0 ? (
            <button type="button" className="tp-prow-more" onClick={onOpen}>
              {rest} more
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
