import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { useReorder } from '../lib/reorder';
import { Checkbox } from './Checkbox';
import { showToast } from './Toast';

export interface SubtaskItem {
  key: string;
  title: string;
  done: boolean;
}

export interface SubtaskListProps {
  /** Under a row on the day sheet, or in the task panel: the same list in each place's own clothes. */
  variant: 'row' | 'panel';
  subtasks: SubtaskItem[];
  /** The task's title, to name the group and the controls. */
  parentTitle: string;
  /** Phones: no grip, no hover. */
  compact?: boolean;
  /** Under a row: controls are tabbable only while the fold is open. */
  shown?: boolean;
  /** "Add subtask" starts open (the panel of a task that has none). */
  onAdd?: (title: string) => void;
  onRename?: (sub: SubtaskItem, title: string) => void;
  onToggle?: (sub: SubtaskItem, done: boolean) => void;
  /** After a drag: which row moved from where to where. */
  onReorder?: (sub: SubtaskItem, from: number, to: number) => void;
  /** The row has folded away; take it out. */
  onDelete?: (sub: SubtaskItem, index: number) => void;
  /** Undo on the toast: put it back where it was. */
  onRestore?: (sub: SubtaskItem, index: number) => void;
  className?: string;
}

/** How long a deleted subtask takes to fold away. */
export const SUB_LEAVE_MS = 170;

/** A subtask's words, written in place: a field of exactly the same size, Enter or clicking away saves, Esc puts the old words back. */
function SubTitle({
  title,
  hint,
  tabIndex,
  onSave,
}: {
  title: string;
  hint?: boolean;
  tabIndex?: number;
  onSave?: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
  const cancel = useRef(false);
  if (editing)
    return (
      <input
        className="tp-sub-edit"
        autoFocus
        value={val}
        aria-label="Edit subtask"
        spellCheck
        onFocus={(e) => {
          const n = e.target.value.length;
          e.target.setSelectionRange(n, n);
        }}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancel.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          const t = val.trim();
          setEditing(false);
          if (cancel.current || !t) {
            cancel.current = false;
            setVal(title);
            return;
          }
          if (t !== title) onSave?.(t);
        }}
      />
    );
  return (
    <span
      className="tp-strike tp-sub-text"
      title={hint ? title : undefined}
      role="button"
      tabIndex={tabIndex}
      aria-label={`Edit subtask: ${title}`}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        setVal(title);
        setEditing(true);
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setVal(title);
          setEditing(true);
        }
      }}
    >
      {title}
    </span>
  );
}

/**
 * Subtasks, lined up under their task: a small ink tick, the words written in place, a quiet × at the end, and
 * "Add subtask" as the last line (Enter adds and keeps writing). They reorder by drag, press and hold on phones.
 * Deleting folds the line away and a toast offers Undo.
 */
export function SubtaskList(p: SubtaskListProps) {
  const { variant, subtasks, compact, shown = true } = p;
  const box = useRef<HTMLDivElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [going, setGoing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const live = useRef(subtasks);
  useLayoutEffect(() => {
    live.current = subtasks;
  });
  const down = useReorder(box, (from, to) => {
    const sub = live.current[from];
    if (sub && from !== to) p.onReorder?.(sub, from, to);
  });
  const tab = shown ? 0 : -1;
  const row = variant === 'row';
  const rowClass = row ? 'tp-srow' : 'tp-td-sub';

  function remove(sub: SubtaskItem, index: number) {
    setGoing(sub.key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setGoing(null);
      p.onDelete?.(sub, index);
    }, SUB_LEAVE_MS);
    showToast('Subtask deleted', { action: 'Undo', onAction: () => p.onRestore?.(sub, index) });
  }

  function add(text: string) {
    const t = text.trim();
    if (t) p.onAdd?.(t);
  }

  return (
    <div
      ref={box}
      className={cx(row ? 'tp-subs' : 'tp-td-subs', p.className)}
      role="group"
      aria-label={`Subtasks of ${p.parentTitle}`}
      onPointerDown={down}
    >
      {subtasks.map((s, i) => (
        <div
          key={s.key}
          data-reorder=""
          data-key={s.key}
          className={cx(rowClass, s.done && 'tp-done', going === s.key && 'tp-sub-going')}
        >
          {compact ? null : (
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
          )}
          <Checkbox
            size="sm"
            label={`Cross off: ${s.title}`}
            checked={s.done}
            tabIndex={tab}
            onChange={(v) => p.onToggle?.(s, v)}
          />
          <SubTitle
            key={`t${s.title}`}
            title={s.title}
            hint={row}
            tabIndex={tab}
            onSave={(t) => p.onRename?.(s, t)}
          />
          <button
            type="button"
            className="tp-sub-del"
            aria-label={`Delete subtask: ${s.title}`}
            title="Delete subtask"
            tabIndex={tab}
            onClick={(e) => {
              e.stopPropagation();
              remove(s, i);
            }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      {p.onAdd ? (
        adding ? (
          <div className={cx(rowClass, row ? 'tp-addsub tp-adding' : 'tp-td-adding')}>
            <span className="tp-addbox" aria-hidden="true" />
            <input
              autoFocus
              className="tp-addinput"
              placeholder="Write a subtask…"
              aria-label="New subtask"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  add(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
              onBlur={(e) => {
                add(e.currentTarget.value);
                setAdding(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className={cx(rowClass, row ? 'tp-addsub' : 'tp-td-addsub')}
            tabIndex={tab}
            onClick={(e) => {
              e.stopPropagation();
              setAdding(true);
            }}
          >
            <span className="tp-addbox" aria-hidden="true" />
            <span className={row ? 'tp-addtext' : undefined}>Add subtask</span>
          </button>
        )
      ) : null}
    </div>
  );
}
