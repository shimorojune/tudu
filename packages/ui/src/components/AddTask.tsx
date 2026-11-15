import { useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { useProjectHash, type HashProject } from '../lib/projectHash';
import { useMine } from '../lib/scramble';

/** What a writing line needs for `#` to pick a project: the projects of the space the task goes to. */
export interface AddTaskHash {
  projects?: readonly HashProject[];
  /** "Projects in Northwind". */
  spaceName?: string;
  /** The projects have not come in yet. */
  loading?: boolean;
  /** "New project Garden": makes it and returns its id. */
  onNew?: (name: string, color: string) => string | void;
}

export interface AddTaskProps {
  /** The quiet serif invitation: "Write the next thing…". */
  label: string;
  /** The words, and (with `hash`) the project the task gets: its id, or null for none. */
  onAdd?: (text: string, projectId?: string | null) => void;
  /** Phones. */
  compact?: boolean;
  /** Change it to open the line for writing (New task, the empty state's Add a task). */
  openKey?: string | number | null;
  /** Start open (the writing line between two rows). */
  autoOpen?: boolean;
  onClose?: () => void;
  className?: string;
  /** `#` in the words picks a project. Leave it out and `#` is just text. */
  hash?: AddTaskHash;
  /** The project the line starts with (a project group's own line); it comes back after each task. */
  project?: HashProject | null;
}

const PILL_OUT_MS = 150;

/** The project a task written on this line gets, at the line's end. × drops it. */
export function ProjectPill({ project, onRemove }: { project: HashProject; onRemove: () => void }) {
  const mine = useMine();
  const [going, setGoing] = useState(false);
  return (
    <span className={cx('tp-hm-pill', going && 'tp-out')} title={`Project: ${mine(project.name)}`}>
      <i className="tp-dot" style={{ background: project.color }} />
      <span className="tp-hm-pill-n">{mine(project.name)}</span>
      <button
        type="button"
        aria-label={`No project (${mine(project.name)})`}
        // The cursor stays in the line.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (going) return;
          setGoing(true);
          setTimeout(onRemove, PILL_OUT_MS);
        }}
      >
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}

/**
 * The last line of the day: an empty box and a quiet serif invitation, like the next blank line on a sheet of paper.
 * Click to write; Enter adds and keeps the line open for the next one, Esc stops, blank text adds nothing. While the
 * line is empty the field uses the placeholder's serif, so the red caret sits right at its first letter; the first
 * keystroke switches to Geist. With `hash`, `#` picks the task's project (see useProjectHash): it shows as a pill at
 * the end of the line, and × or ⌫ at the very start of the line drops it.
 */
export function AddTask({
  label,
  onAdd,
  compact,
  openKey,
  autoOpen,
  onClose,
  className,
  hash,
  project = null,
}: AddTaskProps) {
  const [editing, setEditing] = useState(!!autoOpen);
  const [seen, setSeen] = useState(openKey);
  const [text, setText] = useState('');
  const [proj, setProj] = useState<HashProject | null>(hash ? project : null);
  const [start, setStart] = useState(project);
  const field = useRef<HTMLInputElement | null>(null);
  if (openKey !== seen) {
    setSeen(openKey);
    if (openKey !== undefined && openKey !== null) setEditing(true);
  }
  if (project?.id !== start?.id) {
    setStart(project);
    setProj(hash ? project : null);
  }
  const h = useProjectHash({
    projects: hash ? (hash.projects ?? []) : undefined,
    spaceName: hash?.spaceName,
    loading: hash?.loading,
    input: field,
    setText,
    onPick: (p) => setProj(p),
    onNew: hash?.onNew,
    off: !editing,
  });

  function give(v: string) {
    if (v) onAdd?.(v, ...(hash ? [proj?.id ?? null] : []));
    setText('');
    setProj(hash ? project : null);
  }
  function stop() {
    setEditing(false);
    setProj(hash ? project : null);
    onClose?.();
  }
  return (
    <div
      className={cx(
        'tp-root tp-addtask',
        compact && 'tp-compact',
        editing && 'tp-adding',
        editing && proj && 'tp-hm-has',
        className,
      )}
    >
      <span className="tp-addtask-box" aria-hidden="true" />
      {editing ? (
        <input
          ref={field}
          autoFocus
          className="tp-addtask-input"
          placeholder={label}
          aria-label="New task"
          enterKeyHint="enter"
          value={text}
          {...h.field}
          onChange={(e) => {
            setText(e.currentTarget.value);
            h.look(e);
          }}
          onKeyDown={(e) => {
            if (h.onKeyDown(e)) return;
            const el = e.currentTarget;
            if (e.key === 'Backspace' && proj && el.selectionStart === 0 && el.selectionEnd === 0) {
              e.preventDefault();
              setProj(null);
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              give(el.value.trim());
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              stop();
            }
          }}
          onBlur={(e) => {
            give(e.currentTarget.value.trim());
            stop();
          }}
        />
      ) : (
        <button type="button" className="tp-addtask-btn" onClick={() => setEditing(true)}>
          {label}
        </button>
      )}
      {editing && proj ? (
        <ProjectPill
          key={proj.id}
          project={proj}
          onRemove={() => {
            setProj(null);
            field.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {editing ? h.menu : null}
    </div>
  );
}
