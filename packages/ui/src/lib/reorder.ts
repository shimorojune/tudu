import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { prefersReducedMotion } from './hooks';
import { dropFlash, easeSettle, foldGap, settleFrom } from './motion';

/**
 * Reordering by drag, as the Tudu Paper design system does it. Drag the grip that fades into the left margin on
 * hover, or the row itself: mouse and pen start after a 4px move (so a click still opens or ticks), touch after a
 * 320ms press (so a quick swipe still scrolls). The lifted row follows the pointer on a card slip, tilted a little;
 * the others glide apart to open its gap; on release it settles into place with a soft wash. The click that ends a
 * drag is swallowed, so dropping never opens or ticks anything.
 *
 * Lists that share a `group` (the two days side by side) accept each other's rows: over another list the row
 * travels as a lifted copy on a layer above the page, that list washes faintly with a thin ink line where it will
 * land, and letting go hands the row over: the copy straightens and glides into the gap that opens for it, the list
 * it left folds its gap shut, and the row washes once where it landed.
 */

export const DRAG_START_PX = 4;
export const TOUCH_HOLD_MS = 320;
/** A finger that moves this far before the hold ends is scrolling or swiping, not dragging. */
export const TOUCH_SLOP_PX = 8;

interface GroupEntry {
  el: HTMLElement;
  insert: (from: HTMLElement, at: number) => void;
}

const GROUPS: Record<string, GroupEntry[]> = {};

/** How long the lifted copy takes to glide into its new list (dur-fold). */
export const FLIGHT_MS = 300;
/** A hand-over whose row never shows up in the other list (the move was refused, the list went away) ends here. */
export const FLIGHT_CAP_MS = 600;
/** How long the ink line and the list's wash take to fade after a drop. */
export const DROP_FADE_MS = 120;

/** A row on its way from one list to another: the lifted copy outlives the drag until it lands. */
interface Flight {
  key: string;
  ghost: HTMLElement;
  /** The copy's translate when it was let go. */
  x: number;
  y: number;
  /** The gap it leaves, until the list it left has rendered without the row. */
  from: { c: HTMLElement; h: number; afterKey: string | null } | null;
  /** The row it lands on, hidden under the copy until then. */
  row: HTMLElement | null;
  raf: number;
  timer: ReturnType<typeof setTimeout>;
  stopFold: (() => void) | null;
}

let flight: Flight | null = null;

/** True while a dropped row is gliding into another list. */
export function isFlying(): boolean {
  return !!flight;
}

/** Finish a hand-over at once: the copy goes, the row shows, the gap is shut. Safe to call any time. */
export function stopFlight(): void {
  const f = flight;
  if (!f) return;
  flight = null;
  cancelAnimationFrame(f.raf);
  clearTimeout(f.timer);
  f.ghost.remove();
  if (f.row) f.row.style.visibility = '';
  f.stopFold?.();
}

function startFlight(
  key: string,
  ghost: HTMLElement,
  x: number,
  y: number,
  from: NonNullable<Flight['from']>,
): void {
  stopFlight();
  ghost.classList.add('tp-flying');
  flight = {
    key,
    ghost,
    x,
    y,
    from,
    row: null,
    raf: 0,
    stopFold: null,
    timer: setTimeout(stopFlight, FLIGHT_CAP_MS),
  };
}

/**
 * The list a row was dropped on has rendered it as `el`: glide the lifted copy onto it. The row stays hidden under
 * the copy until it lands, then shows with the wash. The row's box is read every frame, so the glide stays true
 * while its gap opens or its list scrolls it into view.
 */
export function landFlight(el: HTMLElement): void {
  const f = flight;
  if (!f || f.row || f.key !== el.getAttribute('data-key')) return;
  f.row = el;
  el.style.visibility = 'hidden';
  const g = f.ghost;
  // measured straight, then tilted again until the first frame
  g.style.transform = `translate(${f.x}px, ${f.y}px)`;
  const r0 = g.getBoundingClientRect();
  g.style.transform = `translate(${f.x}px, ${f.y}px) rotate(-0.6deg)`;
  let t0 = 0;
  const frame = (now: number) => {
    if (flight !== f) return;
    if (!el.isConnected) {
      stopFlight();
      return;
    }
    if (!t0) t0 = now;
    const q = Math.min(1, (now - t0) / FLIGHT_MS);
    if (q >= 1) {
      stopFlight();
      dropFlash(el);
      return;
    }
    const e = easeSettle(q);
    const r = el.getBoundingClientRect();
    const x = f.x + (r.left - r0.left) * e;
    const y = f.y + (r.top - r0.top) * e;
    g.style.transform = `translate(${x}px, ${y}px) rotate(${-0.6 * (1 - e)}deg)`;
    f.raf = requestAnimationFrame(frame);
  };
  f.raf = requestAnimationFrame(frame);
  clearTimeout(f.timer);
  f.timer = setTimeout(stopFlight, FLIGHT_MS + FLIGHT_CAP_MS);
}

/** Join a drop group: rows dragged over `el` from another list in the group land here through `insert`. */
export function useDropGroup(
  group: string | null | undefined,
  ref: RefObject<HTMLElement | null>,
  insert: (key: string, at: number) => void,
): void {
  const latest = useRef(insert);
  useLayoutEffect(() => {
    latest.current = insert;
  });
  useEffect(() => {
    const el = ref.current;
    if (!group || !el) return;
    const g = (GROUPS[group] ??= []);
    const entry: GroupEntry = {
      el,
      insert: (row, at) => latest.current(row.getAttribute('data-key') ?? '', at),
    };
    g.push(entry);
    return () => {
      const i = g.indexOf(entry);
      if (i >= 0) g.splice(i, 1);
    };
  }, [group, ref]);
}

export interface ReorderOptions {
  /** Lists with the same group trade rows. */
  group?: string | null;
}

interface DragState {
  c: HTMLElement;
  item: HTMLElement;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  active: boolean;
  touch: boolean;
  grip: boolean;
  list: HTMLElement[];
  rects: DOMRect[];
  from: number;
  to: number;
  h: number;
  ghost?: HTMLElement;
  gx: number;
  gy: number;
  target: GroupEntry | null;
  dropAt: number;
  timer?: ReturnType<typeof setTimeout>;
  move: (e: PointerEvent) => void;
  up: () => void;
  cancel: () => void;
}

/** The row of a list with this key. */
export function itemByKey(c: HTMLElement, key: string): HTMLElement | null {
  return items(c).find((n) => n.getAttribute('data-key') === key) ?? null;
}

function items(c: HTMLElement): HTMLElement[] {
  return Array.from(c.children).filter((n): n is HTMLElement => n.hasAttribute('data-reorder'));
}

/** Swallow the one click that follows a drag (if it comes within 60ms), so dropping never opens or ticks. */
function swallowNextClick(): void {
  const off = () => window.removeEventListener('click', stop, true);
  const stop = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
    off();
  };
  window.addEventListener('click', stop, true);
  setTimeout(off, 60);
}

/** While a drag is on, a finger moving must not scroll the page under it. */
let dragging = false;
let touchGuard = 0;
function blockTouchScroll(e: TouchEvent) {
  if (dragging && e.cancelable) e.preventDefault();
}

/**
 * Returns the list's onPointerDown. `onMove(from, to)` reorders within the list; `onHandOff(key, target, at)`
 * gives a row to another list in the group.
 */
export function useReorder(
  containerRef: RefObject<HTMLElement | null>,
  onMove: (from: number, to: number, key: string) => void,
  options: ReorderOptions = {},
): (e: ReactPointerEvent<HTMLElement>) => void {
  const st = useRef<DragState | null>(null);
  const flip = useRef<{ key: string; top: number } | null>(null);
  const opts = useRef(options);
  const move = useRef(onMove);
  useLayoutEffect(() => {
    opts.current = options;
    move.current = onMove;
  });

  // After a reorder the row renders in its new slot; glide it there from where it was dropped. And when a row
  // of this list was dropped on another one, fold the gap it left as soon as this list renders without it.
  useLayoutEffect(() => {
    const c = containerRef.current;
    const gone = flight?.from;
    if (flight && gone && c && gone.c === c && !itemByKey(c, flight.key)) {
      flight.from = null;
      const next = gone.afterKey ? itemByKey(c, gone.afterKey) : null;
      flight.stopFold = foldGap(next ?? c, next ? 'marginTop' : 'paddingBottom', gone.h);
    }
    const f = flip.current;
    if (!f || !c) return;
    flip.current = null;
    const el = itemByKey(c, f.key);
    if (el) settleFrom(el, f.top);
  });

  useEffect(() => {
    if (!touchGuard++) window.addEventListener('touchmove', blockTouchScroll, { passive: false });
    return () => {
      if (!--touchGuard) window.removeEventListener('touchmove', blockTouchScroll);
      st.current?.cancel();
    };
  }, []);

  function clearTarget(s: DragState) {
    if (s.target) {
      s.target.el.classList.remove('tp-drop-on', 'tp-drop-off');
      s.target.el.querySelector(':scope > .tp-drop-line')?.remove();
    }
    s.target = null;
  }

  /** After a drop the list's wash and the ink line fade instead of vanishing. */
  function fadeTarget(s: DragState) {
    const el = s.target?.el;
    s.target = null;
    if (!el) return;
    el.classList.add('tp-drop-off');
    setTimeout(() => {
      // a new drag over this list in the meantime took the fade back
      if (!el.classList.contains('tp-drop-off')) return;
      el.classList.remove('tp-drop-on', 'tp-drop-off');
      el.querySelector(':scope > .tp-drop-line')?.remove();
    }, DROP_FADE_MS);
  }

  function findTarget(s: DragState, x: number, y: number): GroupEntry | null {
    const g = opts.current.group ? GROUPS[opts.current.group] : null;
    if (!g) return null;
    let hit: GroupEntry | null = null;
    for (const e of g) {
      if (e.el === s.c || !e.el.isConnected) continue;
      const r = e.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 64) hit = e;
    }
    return hit;
  }

  function placeLine(s: DragState, y: number) {
    const el = s.target!.el;
    const rows = items(el);
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    const base = el.getBoundingClientRect().top;
    const top = rows.length
      ? (idx < rows.length
          ? rows[idx]!.getBoundingClientRect().top
          : rows[rows.length - 1]!.getBoundingClientRect().bottom) - base
      : 0;
    let ln = el.querySelector<HTMLElement>(':scope > .tp-drop-line');
    if (!ln) {
      ln = document.createElement('div');
      ln.className = 'tp-drop-line';
      ln.setAttribute('aria-hidden', 'true');
      el.appendChild(ln);
    }
    ln.style.transform = `translateY(${top - 1}px)`;
    s.dropAt = idx;
  }

  function cleanup(s: DragState) {
    clearTarget(s);
    clearTimeout(s.timer);
    window.removeEventListener('pointermove', s.move);
    window.removeEventListener('pointerup', s.up);
    window.removeEventListener('pointercancel', s.cancel);
    document.documentElement.classList.remove('tp-is-dragging');
    dragging = false;
    s.ghost?.remove();
    s.item.classList.remove('tp-drag-src');
    st.current = null;
  }

  function begin(s: DragState) {
    if (s.active) return;
    // a row still gliding from the last drop lands at once, so this drag measures a settled page
    stopFlight();
    s.active = true;
    dragging = true;
    s.list = items(s.c);
    s.rects = s.list.map((n) => n.getBoundingClientRect());
    s.from = s.list.indexOf(s.item);
    s.to = s.from;
    s.h = s.rects[s.from]!.height;
    s.list.forEach((n, i) => {
      if (i !== s.from) n.classList.add('tp-shift');
    });
    s.item.classList.add('tp-dragging');
    // Lists that trade rows can sit in boxes that clip: there the row travels as a lifted copy above the page,
    // and its own slot stays behind as the gap it will leave.
    if (opts.current.group) {
      const r0 = s.rects[s.from]!;
      const g = s.item.cloneNode(true) as HTMLElement;
      g.classList.add('tp-drag-ghost');
      g.classList.remove('tp-dropped', 'tp-new', 'tp-sel', 'tp-locate');
      g.removeAttribute('data-reorder');
      g.setAttribute('aria-hidden', 'true');
      g.style.width = `${r0.width}px`;
      g.style.left = `${r0.left}px`;
      g.style.top = `${r0.top}px`;
      document.body.appendChild(g);
      const r1 = g.getBoundingClientRect();
      s.gx = r0.left - r1.left;
      s.gy = r0.top - r1.top;
      g.style.transform = `translate(${s.gx}px, ${s.gy}px) rotate(-0.6deg)`;
      s.ghost = g;
      s.item.classList.add('tp-drag-src');
    }
    document.documentElement.classList.add('tp-is-dragging');
    if (s.touch && navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch {
        /* not on this device */
      }
    }
  }

  return function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    const c = containerRef.current;
    if (!c || st.current) return;
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>('[data-reorder]');
    if (!item || item.parentNode !== c) return;
    const onGrip = !!target.closest('.tp-grip');
    if (!onGrip && target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    if (onGrip) e.preventDefault();
    const s: DragState = {
      c,
      item,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      active: false,
      touch: e.pointerType === 'touch',
      grip: onGrip,
      list: [],
      rects: [],
      from: -1,
      to: -1,
      h: 0,
      gx: 0,
      gy: 0,
      target: null,
      dropAt: 0,
      move: (ev) => {
        const dy = ev.clientY - s.startY;
        const dx = ev.clientX - s.startX;
        if (!s.active) {
          if (s.touch && !s.grip) {
            if (Math.abs(dy) > TOUCH_SLOP_PX || Math.abs(dx) > TOUCH_SLOP_PX) s.cancel();
            return;
          }
          // Rows reorder up and down, so a list on its own starts on a vertical move; lists that trade rows
          // sit side by side, so there a move in any direction starts the drag.
          const moved = opts.current.group ? Math.hypot(dx, dy) : Math.abs(dy);
          if (moved < DRAG_START_PX) return;
          begin(s);
        }
        ev.preventDefault();
        s.dy = dy;
        s.dx = opts.current.group ? dx : 0;
        if (s.ghost) s.ghost.style.transform = `translate(${s.dx + s.gx}px, ${dy + s.gy}px) rotate(-0.6deg)`;
        else s.item.style.transform = `translate(${s.dx}px, ${dy}px) rotate(-0.6deg)`;
        const tgt = opts.current.group ? findTarget(s, ev.clientX, ev.clientY) : null;
        if (tgt) {
          if (s.target !== tgt) {
            clearTarget(s);
            s.target = tgt;
            tgt.el.classList.remove('tp-drop-off');
            tgt.el.classList.add('tp-drop-on');
            s.list.forEach((n, j) => {
              if (j !== s.from) n.style.transform = '';
            });
          }
          placeLine(s, ev.clientY);
          return;
        }
        if (s.target) clearTarget(s);
        const mid = s.rects[s.from]!.top + s.h / 2 + dy;
        let to = s.from;
        for (let i = s.from + 1; i < s.list.length; i++)
          if (mid > s.rects[i]!.top + s.rects[i]!.height / 2) to = i;
        for (let i = s.from - 1; i >= 0; i--) if (mid < s.rects[i]!.top + s.rects[i]!.height / 2) to = i;
        s.to = to;
        s.list.forEach((n, j) => {
          if (j === s.from) return;
          n.style.transform =
            j > s.from && j <= to
              ? `translateY(${-s.h}px)`
              : j < s.from && j >= to
                ? `translateY(${s.h}px)`
                : '';
        });
      },
      cancel: () => {
        if (s.active)
          s.list.forEach((n) => {
            n.style.transform = '';
            n.classList.remove('tp-shift', 'tp-dragging');
          });
        cleanup(s);
      },
      up: () => {
        if (!s.active) {
          cleanup(s);
          return;
        }
        const resetRows = () => {
          s.list.forEach((n) => {
            n.classList.remove('tp-shift', 'tp-dragging');
            n.style.transition = 'none';
            n.style.transform = '';
          });
          void s.c.offsetWidth;
          s.list.forEach((n) => {
            n.style.transition = '';
          });
        };
        if (s.target) {
          const tgt = s.target;
          const at = s.dropAt;
          resetRows();
          swallowNextClick();
          const ghost = s.ghost;
          if (ghost && !prefersReducedMotion()) {
            // The copy outlives the drag: it glides onto the row once the other list has rendered it.
            let after = s.item.nextElementSibling;
            while (after && !after.hasAttribute('data-reorder')) after = after.nextElementSibling;
            s.ghost = undefined;
            fadeTarget(s);
            startFlight(s.item.getAttribute('data-key') ?? '', ghost, s.dx + s.gx, s.dy + s.gy, {
              c: s.c,
              h: s.h,
              afterKey: after?.getAttribute('data-key') ?? null,
            });
          }
          cleanup(s);
          tgt.insert(s.item, at);
          return;
        }
        const top = s.rects[s.from]!.top + s.dy;
        resetRows();
        swallowNextClick();
        const key = s.item.getAttribute('data-key') ?? '';
        const { from, to } = s;
        cleanup(s);
        if (from !== to) {
          flip.current = { key, top };
          move.current(from, to, key);
        } else settleFrom(s.item, top);
      },
    };
    if (s.touch && !s.grip) s.timer = setTimeout(() => begin(s), TOUCH_HOLD_MS);
    st.current = s;
    window.addEventListener('pointermove', s.move, { passive: false });
    window.addEventListener('pointerup', s.up);
    window.addEventListener('pointercancel', s.cancel);
  };
}

/** Move one item in a list. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const n = list.slice();
  const [it] = n.splice(from, 1);
  n.splice(to, 0, it!);
  return n;
}
