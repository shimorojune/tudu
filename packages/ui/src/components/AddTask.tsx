import { useState } from 'react';
import { cx } from '../lib/cx';

export interface AddTaskProps {
  /** The quiet serif invitation: "Write the next thing…". */
  label: string;
  onAdd?: (text: string) => void;
  /** Phones. */
  compact?: boolean;
  /** Change it to open the line for writing (New task, the empty state's Add a task). */
  openKey?: string | number | null;
  /** Start open (the writing line between two rows). */
  autoOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

/**
 * The last line of the day: an empty box and a quiet serif invitation, like the next blank line on a sheet of paper.
 * Click to write; Enter adds and keeps the line open for the next one, Esc stops, blank text adds nothing. While the
 * line is empty the field uses the placeholder's serif, so the red caret sits right at its first letter; the first
 * keystroke switches to Geist.
 */
export function AddTask({ label, onAdd, compact, openKey, autoOpen, onClose, className }: AddTaskProps) {
  const [editing, setEditing] = useState(!!autoOpen);
  const [seen, setSeen] = useState(openKey);
  if (openKey !== seen) {
    setSeen(openKey);
    if (openKey !== undefined && openKey !== null) setEditing(true);
  }
  function stop() {
    setEditing(false);
    onClose?.();
  }
  return (
    <div className={cx('tp-root tp-addtask', compact && 'tp-compact', editing && 'tp-adding', className)}>
      <span className="tp-addtask-box" aria-hidden="true" />
      {editing ? (
        <input
          autoFocus
          className="tp-addtask-input"
          placeholder={label}
          aria-label="New task"
          enterKeyHint="enter"
          onKeyDown={(e) => {
            const v = e.currentTarget.value.trim();
            if (e.key === 'Enter') {
              e.preventDefault();
              if (v) onAdd?.(v);
              e.currentTarget.value = '';
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              stop();
            }
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v) onAdd?.(v);
            stop();
          }}
        />
      ) : (
        <button type="button" className="tp-addtask-btn" onClick={() => setEditing(true)}>
          {label}
        </button>
      )}
    </div>
  );
}
