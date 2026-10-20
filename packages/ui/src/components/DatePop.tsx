import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { prefersReducedMotion } from '../lib/hooks';

export interface DatePopProps {
  /** The pill (or button) that opened it. The pop sits beside it. */
  anchor: HTMLElement;
  onClose: () => void;
  /** A quiet line over the calendar: "Carried over from Saturday". Also the dialog's name. */
  heading?: string;
  /** `end` hangs down and to the left of the anchor (the Backlog's plan button), so it never runs off the edge. */
  align?: 'start' | 'end';
  children?: ReactNode;
  className?: string;
}

/** How long the pop takes to ease out before it goes. */
export const DATEPOP_LEAVE_MS = 130;

/**
 * A small dated picker that floats over the page next to the pill that opened it, so a scrolling list never clips
 * it. It flips above the pill when there is no room below, and eases out on Esc, a click away or a scroll. Focus
 * moves into it when it opens and back to the pill when it closes.
 */
export function DatePop({ anchor, onClose, heading, align = 'start', children, className }: DatePopProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const gone = useRef(false);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const ht = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(align === 'end' ? r.right - w + 6 : r.left - 6, vw - w - 8));
    const below = r.bottom + 6;
    const up = vh - below < ht + 8 && r.top - 6 - ht > 8;

    setPos({ left, top: up ? r.top - 6 - ht : Math.max(8, Math.min(below, vh - ht - 8)), up });
  }, [anchor, align]);

  useEffect(() => {
    if (!pos || !ref.current) return;
    const first = ref.current.querySelector<HTMLElement>(
      '[aria-pressed="true"], [aria-selected="true"], [tabindex="0"], button',
    );
    first?.focus({ preventScroll: true });
  }, [pos]);

  useEffect(() => {
    const ease = () => {
      if (gone.current) return;
      gone.current = true;
      if (prefersReducedMotion()) {
        close.current();
        return;
      }
      setLeaving(true);
      setTimeout(() => close.current(), DATEPOP_LEAVE_MS);
    };
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !anchor.contains(t)) ease();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      ease();
      anchor.focus({ preventScroll: true });
    };
    const scroll = (e: Event) => {
      const t = e.target;
      if (ref.current && !(t instanceof Node && ref.current.contains(t))) ease();
    };
    const resize = () => close.current();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [anchor]);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return createPortal(
    <div
      ref={ref}
      className={cx(
        'tp-root tp-datepop',
        pos?.up && 'tp-up',
        align === 'end' && 'tp-end',
        leaving && 'tp-pop-leaving',
        className,
      )}
      role="dialog"
      aria-label={heading}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
      onClick={stop}
      onPointerDown={stop}
    >
      {heading ? <div className="tp-datepop-h">{heading}</div> : null}
      {children}
    </div>,
    document.body,
  );
}
