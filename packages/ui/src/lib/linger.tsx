import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';

/** How long a closed pop takes to ease out before it goes. */
export const POP_LEAVE_MS = 130;
/** A pop never runs off the side of the window: it slides back in, this far from the edge. */
export const POP_EDGE_PX = 12;

/**
 * How far a pop whose box runs from `left` to `right` must slide to sit 12px inside a window `width` wide: left
 * when it runs past the right edge, right when it starts before the left one. The left edge wins, so a pop wider
 * than the window still starts inside it.
 */
export function edgeShift(left: number, right: number, width: number): number {
  let shift = 0;
  if (right > width - POP_EDGE_PX) shift = width - POP_EDGE_PX - right;
  if (left + shift < POP_EDGE_PX) shift = POP_EDGE_PX - left;
  return Math.round(shift);
}

/**
 * A pop that eases out instead of vanishing: once closed it keeps its last content for a beat, then unmounts. It
 * opens in place and stays inside the window (#117): when it opens (and again when `fitKey` changes, the # menu's
 * token) it is measured, and slid back in with its margins if it runs off a side. It doesn't chase anything while
 * it stays open.
 */
export function Linger({
  open,
  className,
  fitKey,
  children,
}: {
  open: boolean;
  className?: string;
  /** Measure against the window's edges again when this changes while the pop is open. */
  fitKey?: string | number | null;
  children: ReactNode;
}) {
  // While open, the latest children are kept in state so they can stay on screen for the beat after it closes.
  const [kept, setKept] = useState<{ open: boolean; node: ReactNode; gone: boolean }>({
    open,
    node: children,
    gone: !open,
  });
  if (open && (kept.node !== children || !kept.open || kept.gone))
    setKept({ open: true, node: children, gone: false });
  if (!open && kept.open) setKept({ open: false, node: kept.node, gone: false });
  useEffect(() => {
    if (kept.open || kept.gone) return;
    const t = setTimeout(() => setKept((k) => (k.open ? k : { ...k, gone: true })), POP_LEAVE_MS);
    return () => clearTimeout(t);
  }, [kept]);

  const ref = useRef<HTMLDivElement>(null);
  const was = useRef(false);
  const shown = kept.open && !kept.gone;
  useLayoutEffect(() => {
    const el = ref.current;
    const fresh = shown && !was.current;
    was.current = shown;
    if (!el || !shown) return;
    el.style.marginLeft = '';
    el.style.marginRight = '';
    // While the pop-in runs the box is scaled down, so it is measured at rest: the animation comes off and goes
    // back on before the next paint, which starts it again from its first frame (where it still is, or nearly). A
    // pop at rest is left alone, so it never pops in twice.
    const moving = fresh || (typeof el.getAnimations === 'function' && el.getAnimations().length > 0);
    if (moving) el.style.animation = 'none';
    const r = el.getBoundingClientRect();
    // A single box inside may start further right than the pop itself (the # menu sits at the caret by its margin).
    const only = el.children.length === 1 ? el.firstElementChild : null;
    const inset = only ? parseFloat(getComputedStyle(only).marginLeft) || 0 : 0;
    if (moving) el.style.animation = '';
    if (r.width === 0) return;
    const shift = edgeShift(r.left + Math.max(0, inset), r.right, window.innerWidth);
    if (!shift) return;
    // Both margins: the left one slides a pop held by its left edge, the right one a pop held by its right.
    el.style.marginLeft = `${shift}px`;
    el.style.marginRight = `${-shift}px`;
  }, [shown, fitKey]);

  if (kept.gone) return null;
  return (
    <div ref={ref} className={cx(className, !kept.open && 'tp-pop-leaving')}>
      {kept.node}
    </div>
  );
}
