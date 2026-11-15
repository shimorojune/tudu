import { cx } from '../lib/cx';

export interface AddTaskProps {
  /** The quiet serif invitation: "Write the next thing…". */
  label: string;
  /** Opens Quick Add set to this list (its day or the Backlog, its space). */
  onOpen?: () => void;
  /** Phones. */
  compact?: boolean;
  className?: string;
}

/**
 * The last line of a list: an empty box and a quiet serif invitation, like the next blank line on a sheet of paper.
 * It never turns into a field: a click (or Enter / Space) opens Quick Add for this list, the one way to write a task.
 */
export function AddTask({ label, onOpen, compact, className }: AddTaskProps) {
  return (
    <div className={cx('tp-root tp-addtask', compact && 'tp-compact', className)}>
      <span className="tp-addtask-box" aria-hidden="true" />
      <button type="button" className="tp-addtask-btn" aria-haspopup="dialog" onClick={() => onOpen?.()}>
        {label}
      </button>
    </div>
  );
}
