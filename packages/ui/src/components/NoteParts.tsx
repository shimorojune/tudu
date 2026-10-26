import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cx } from '../lib/cx';
import { POP_LEAVE_MS } from '../lib/linger';
import { Icon } from '../lib/icons';
import { Skeleton } from './Skeleton';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';
import { Tooltip } from './Tooltip';

/*
 * The Notebook's small pieces (chunk 22): its icons, the quiet save state, a note's row, the chip of a linked task,
 * the picker and the popover that leaves with motion. A note is personal: only its owner sees it, wherever it is
 * linked. Everything here uses the system's own pieces and tokens.
 */

const svg = (size: number, kids: ReactNode, stroke = 2) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {kids}
  </svg>
);
const paths = (list: string[]) => list.map((d, i) => <path key={i} d={d} />);

/** Lucide's NotebookPen for a note, and the folder, put back, pin and fill-the-screen marks. */
const NOTE_ICONS = {
  note: paths([
    'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4',
    'M2 6h4',
    'M2 10h4',
    'M2 14h4',
    'M2 18h4',
    'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
  ]),
  folder: paths([
    'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  ]),
  putBack: paths(['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11']),
  folderPlus: paths([
    'M12 10v6',
    'M9 13h6',
    'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  ]),
  pin: paths([
    'M12 17v5',
    'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
  ]),
  expand: paths(['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7']),
  shrink: paths(['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7']),
  chev: paths(['m9 18 6-6-6-6']),
};

export type NoteIconName = keyof typeof NOTE_ICONS;

export function NoteIcon({
  name,
  size = 16,
  stroke,
}: {
  name: NoteIconName;
  size?: number;
  stroke?: number;
}) {
  return svg(size, NOTE_ICONS[name], stroke);
}

/** True when the computer asks for less motion: a move becomes a fade, a leave is at once. */
export function reducedMotion(): boolean {
  try {
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.motion === 'less'
    );
  } catch {
    return false;
  }
}

// ---- the save state ----------------------------------------------------------------------------------------------

export type NoteSaveState = 'saved' | 'saving' | 'offline' | 'conflict' | 'error';

/** How long the tick stays after a save lands. */
export const SAVE_TICK_MS = 1400;
/** A save that takes longer than this shows the small ring. */
export const SAVE_RING_AFTER_MS = 500;

const PROBLEM: Partial<Record<NoteSaveState, { words: string; tip: string }>> = {
  offline: { words: 'Not saved yet', tip: 'Kept on this device. It saves when you’re back online.' },
  conflict: { words: 'Changed elsewhere', tip: 'This note changed in another window' },
  error: { words: 'Didn’t save', tip: 'Kept on this device. Trying again.' },
};

/**
 * Quiet unless it matters. Typing shows nothing; a save that takes a moment shows a small turning ring; a finished
 * save draws a tick that fades away. Only a problem stays, in amber words, until it's sorted. `slow` comes from the
 * store when it knows; otherwise the ring waits half a second itself.
 */
export function SaveState({ state = 'saved', slow }: { state?: NoteSaveState; slow?: boolean }) {
  const [seen, setSeen] = useState(state);
  const [flash, setFlash] = useState(false);
  const [late, setLate] = useState(false);
  if (seen !== state) {
    setSeen(state);
    setLate(false);
    setFlash(state === 'saved' && seen === 'saving');
  }
  useEffect(() => {
    if (state !== 'saving') return;
    const t = setTimeout(() => setLate(true), SAVE_RING_AFTER_MS);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), SAVE_TICK_MS);
    return () => clearTimeout(t);
  }, [flash]);
  const problem = PROBLEM[state];
  if (problem)
    return (
      <Tooltip label={problem.tip} side="bottom">
        <span
          className={cx('tp-root tp-nb-save', `tp-nb-save-${state}`)}
          tabIndex={0}
          role="status"
          aria-live="polite"
          aria-description={problem.tip}
        >
          <i className="tp-nb-save-dot" aria-hidden="true" />
          <span key={state} className="tp-nb-save-l">
            {problem.words}
          </span>
        </span>
      </Tooltip>
    );
  const ring = state === 'saving' && (slow ?? late);
  return (
    <span className="tp-root tp-nb-save tp-nb-save-quiet" role="status" aria-live="polite">
      {ring ? <i key="ring" className="tp-nb-save-ring" aria-label="Saving" /> : null}
      {flash ? (
        <svg
          key="tick"
          className="tp-nb-save-tick"
          width={14}
          height={14}
          viewBox="0 0 14 14"
          aria-label="Saved"
        >
          <path d="M3 7.4l2.6 2.6L11 4.4" />
        </svg>
      ) : null}
    </span>
  );
}

// ---- a note in a list ----------------------------------------------------------------------------------------------

/** A note as a list shows it. */
export interface NoteItem {
  id: string;
  title: string;
  /** The first line of its words, for an untitled note (shown in grey). */
  first?: string;
  /** "Northwind / Planning", or "Not in a folder". */
  where?: string | null;
  /** "4m", "Yesterday", "12 Oct". */
  edited?: string | null;
  /** How many tasks it is linked to. */
  links?: number;
}

export const noteLabel = (n: { title: string; first?: string }) =>
  n.title.trim() || n.first?.trim() || 'Untitled';

export interface NoteRowProps {
  note: NoteItem;
  depth?: number;
  active?: boolean;
  /** The line under the title; `false` for none. */
  sub?: string | false;
  /** Show the link count and the time; the tree shows neither. */
  links?: boolean;
  time?: boolean;
  role?: string;
  id?: string;
  className?: string;
  onPick?: () => void;
  onHover?: () => void;
}

/** One note in a list: its mark, its title (or its first line), how many tasks it's linked to, when it last changed. */
export function NoteRow(p: NoteRowProps) {
  const n = p.note;
  const sub = p.sub === false ? null : (p.sub ?? n.where ?? null);
  return (
    <button
      type="button"
      role={p.role}
      id={p.id}
      aria-selected={p.role ? (p.active ? 'true' : 'false') : undefined}
      aria-current={!p.role && p.active ? 'true' : undefined}
      tabIndex={p.role ? -1 : undefined}
      className={cx('tp-root tp-nb-row', p.active && 'tp-on', p.className)}
      style={p.depth ? ({ '--nb-depth': p.depth } as React.CSSProperties) : undefined}
      onClick={p.onPick}
      onMouseMove={p.onHover}
    >
      <span className="tp-nb-row-ic">
        <NoteIcon name="note" size={14} />
      </span>
      <span className="tp-nb-row-m">
        <span className={cx('tp-nb-row-t', !n.title.trim() && 'tp-nb-untitled')}>{noteLabel(n)}</span>
        {sub ? <span className="tp-nb-row-s">{sub}</span> : null}
      </span>
      {p.links !== false && n.links ? (
        <span
          className="tp-nb-row-ln"
          aria-label={`Linked to ${n.links} ${n.links === 1 ? 'task' : 'tasks'}`}
        >
          <Icon name="link" size={12} />
          {n.links}
        </span>
      ) : null}
      {p.time !== false && n.edited ? <span className="tp-nb-row-time">{n.edited}</span> : null}
    </button>
  );
}

// ---- a linked task -----------------------------------------------------------------------------------------------

/** A task a note is linked to: its space, its ID and its title. */
export interface NoteTaskItem {
  /** The task's id. */
  key: string;
  /** "NW-38". */
  id: string;
  title: string;
  space?: SpaceTileSpace;
}

/** A linked task, as a chip: its space's tile, its ID and its title. The × unlinks; the task itself is untouched. */
export function NoteTaskChip({
  task,
  onOpen,
  onUnlink,
}: {
  task: NoteTaskItem;
  onOpen?: () => void;
  onUnlink?: () => void;
}) {
  return (
    <span className="tp-root tp-nb-tchip">
      <button type="button" className="tp-nb-tchip-b" title={task.title} onClick={onOpen}>
        {task.space ? <SpaceTile space={task.space} size={14} /> : null}
        <span className="tp-nb-tchip-id">{task.id}</span>
        <span className="tp-nb-tchip-t">{task.title}</span>
      </button>
      {onUnlink ? (
        <button type="button" className="tp-nb-tchip-x" aria-label={`Unlink ${task.id}`} onClick={onUnlink}>
          <Icon name="x" size={11} />
        </button>
      ) : null}
    </span>
  );
}

/**
 * When items in a row come or go, the others glide to their new places and the row eases to its new height instead
 * of jumping. Children opt in with data-flip.
 */
export function useFlip(ref: RefObject<HTMLElement | null>): void {
  const last = useRef<{ pos: Record<string, { x: number; y: number }>; h: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const now: Record<string, { x: number; y: number }> = {};
    const kids = box.querySelectorAll<HTMLElement>('[data-flip]');
    const h = box.offsetHeight;
    kids.forEach((k) => (now[k.dataset.flip!] = { x: k.offsetLeft, y: k.offsetTop }));
    const was = last.current;
    last.current = { pos: now, h };
    if (!was || reducedMotion() || typeof box.animate !== 'function') return;
    const easing = 'cubic-bezier(.25,.8,.25,1)';
    kids.forEach((k) => {
      const a = was.pos[k.dataset.flip!];
      const b = now[k.dataset.flip!]!;
      if (a && (a.x !== b.x || a.y !== b.y))
        k.animate([{ transform: `translate(${a.x - b.x}px,${a.y - b.y}px)` }, { transform: 'none' }], {
          duration: 240,
          easing,
        });
    });
    if (was.h !== h) box.animate([{ height: `${was.h}px` }, { height: `${h}px` }], { duration: 240, easing });
  });
}

// ---- popovers ------------------------------------------------------------------------------------------------------

/** A picker inside a popover says when it has turned upward, so the popover keeps that side while it leaves. */
const PopUp = createContext<((up: boolean) => void) | null>(null);

/**
 * A popover that leaves with motion (130ms) instead of vanishing. It keeps the side it opened on (a picker may have
 * turned it upward) while it leaves.
 */
export function NotePop({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [up, setUp] = useState(false);
  if (open && (!shown || leaving)) {
    if (!shown) setUp(false);
    setShown(true);
    setLeaving(false);
  }
  if (!open && shown && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(
      () => {
        setShown(false);
        setLeaving(false);
      },
      reducedMotion() ? 0 : POP_LEAVE_MS,
    );
    return () => clearTimeout(t);
  }, [leaving]);
  if (!shown) return null;
  return (
    <PopUp.Provider value={setUp}>
      <div
        className={cx('tp-nb-pop', className, up && 'tp-nb-pop-up', leaving && 'tp-nb-pop-leaving')}
        aria-hidden={leaving ? 'true' : undefined}
      >
        {children}
      </div>
    </PopUp.Provider>
  );
}

/**
 * Close the popovers inside `root` on a click off them (anywhere, even inside the note) or Esc. `open` says whether
 * any is open; `close` closes them all.
 */
export function useCloseOnOutside(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  const live = useRef(close);
  useLayoutEffect(() => {
    live.current = close;
  });
  useEffect(() => {
    if (!open) return;
    function down(e: PointerEvent) {
      const t = e.target as Element | null;
      const w = t?.closest?.('.tp-nb-menuw');
      if (!w || !root.current?.contains(w)) live.current();
    }
    function esc(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') live.current();
    }
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', esc);
    };
  }, [open, root]);
}

/** One choice in a picker: a task (with its space) or a note or a folder. */
export interface PickItem {
  key: string;
  /** A task's ID, shown before its title. */
  id?: string;
  title: string;
  sub?: string | null;
  space?: SpaceTileSpace;
  icon?: NoteIconName;
  /** Already linked: it says so. */
  linked?: boolean;
  /** Where it already is (Move): it says Here and can't be picked. */
  here?: boolean;
}

export interface NotePickerProps {
  label: string;
  placeholder: string;
  items: PickItem[];
  /** What the list says before you type, when there is nothing in it. */
  empty: string;
  /** At most this many rows (6). */
  max?: number;
  loading?: boolean;
  noFocus?: boolean;
  foot?: ReactNode;
  className?: string;
  onPick?: (item: PickItem) => void;
  onClose?: () => void;
}

/**
 * A small popover with a search line and a list: links a task to a note, a note to a task, or moves a note to a
 * folder. It keeps inside its pane (narrowing, then sliding left) and opens upward when there's no room below.
 */
export function NotePicker(p: NotePickerProps) {
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const turnUp = useContext(PopUp);
  useEffect(() => {
    if (!p.noFocus) input.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus is taken once, on opening
  }, []);
  useLayoutEffect(() => {
    const el = root.current;
    const pop = el?.parentElement;
    if (!el || !pop) return;
    const box = pop.parentElement?.closest('.tp-nb-win, .tp-nb-ed, .tp-drawer, .tp-sheet, .tp-td');
    if (box) {
      const b = box.getBoundingClientRect();
      const gap = 12;
      const room = b.width - 2 * gap;
      if (room > 0 && el.offsetWidth > room) el.style.width = `${Math.max(220, room)}px`;
      const anchor = pop.parentElement!.getBoundingClientRect();
      const over = anchor.left + el.offsetWidth - (b.right - gap);
      if (over > 0) el.style.marginLeft = `${-Math.min(over, anchor.left - (b.left + gap))}px`;
    }
    // Upward when what clips it (a scrolling pane, the window) has no room below but more above.
    let clip: { top: number; bottom: number } = { top: 0, bottom: window.innerHeight };
    for (let n = pop.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') {
        clip = n.getBoundingClientRect();
        break;
      }
    }
    const anchor = pop.parentElement!.getBoundingClientRect();
    const h = el.offsetHeight;
    const below = clip.bottom - anchor.bottom - 6;
    const above = anchor.top - 6 - clip.top;
    if (h > below - 12 && above > below) {
      if (turnUp) turnUp(true);
      else pop.classList.add('tp-nb-pop-up');
      const list = el.querySelector<HTMLElement>('.tp-nb-pick-list');
      if (list && h > above - 12)
        list.style.maxHeight = `${Math.max(120, list.offsetHeight - (h - above + 12))}px`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured once, as it opens
  }, []);
  const ql = q.trim().toLowerCase();
  const list = p.items
    .filter((x) => !ql || `${x.title} ${x.id ?? ''} ${x.sub ?? ''}`.toLowerCase().includes(ql))
    .slice(0, p.max ?? 6);
  const cur = Math.min(act, Math.max(0, list.length - 1));
  const pick = (x: PickItem | undefined) => {
    if (x && !x.here) p.onPick?.(x);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length) setAct((cur + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(list[cur]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      p.onClose?.();
    }
  };
  return (
    <div ref={root} className={cx('tp-root tp-nb-pick', p.className)} role="dialog" aria-label={p.label}>
      <div className="tp-nb-pick-line">
        <Icon name="search" size={15} />
        <input
          ref={input}
          value={q}
          placeholder={p.placeholder}
          aria-label={p.placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setAct(0);
          }}
          onKeyDown={key}
        />
      </div>
      <div className="tp-nb-pick-list" role="listbox" aria-label={p.label}>
        {p.loading ? (
          [180, 140, 200].map((w, i) => (
            <div key={i} className="tp-nb-skrow">
              <Skeleton width={14} height={14} />
              <Skeleton width={w} height={11} />
            </div>
          ))
        ) : !list.length ? (
          <p className="tp-nb-none">
            {q.trim() ? (
              <>
                Nothing matches “<b>{q.trim()}</b>”.
              </>
            ) : (
              p.empty
            )}
          </p>
        ) : (
          list.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="option"
              aria-selected={i === cur ? 'true' : 'false'}
              aria-disabled={x.here ? 'true' : undefined}
              className={cx('tp-nb-pick-it', i === cur && 'tp-on', (x.linked || x.here) && 'tp-nb-linked')}
              onMouseMove={() => i !== cur && setAct(i)}
              onClick={() => pick(x)}
            >
              {x.space ? (
                <SpaceTile space={x.space} size={16} />
              ) : (
                <span className="tp-nb-row-ic">
                  <NoteIcon name={x.icon ?? 'note'} size={14} />
                </span>
              )}
              <span className="tp-nb-row-m">
                <span className="tp-nb-row-t">
                  {x.id ? <span className="tp-nb-tchip-id">{x.id} </span> : null}
                  {x.title}
                </span>
                {x.sub ? <span className="tp-nb-row-s">{x.sub}</span> : null}
              </span>
              {x.linked ? (
                <span className="tp-nb-row-time">Linked</span>
              ) : x.here ? (
                <span className="tp-nb-row-time">Here</span>
              ) : null}
            </button>
          ))
        )}
      </div>
      {p.foot ? <div className="tp-nb-pick-f">{p.foot}</div> : null}
    </div>
  );
}
