import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { prefersReducedMotion } from '../lib/hooks';
import { closeRow } from '../lib/motion';

/** How long filled words take to fade when the first task lands. */
export const FILL_FADE_MS = 240;

export interface FoldAwayProps {
  /** Whether the content belongs on the page now. */
  show: boolean;
  children?: ReactNode;
  /**
   * The words fill the rest of the sheet's body (an `EmptyState fill`). They can't fold by height there, so when
   * `show` turns off they stay where they are over the list and fade (240ms) instead.
   */
  fill?: boolean;
  className?: string;
}

/**
 * Words that make way for a list, like "Nothing waiting." over an empty Backlog. When `show` turns off (the first
 * task lands) the words stay a moment and fold away (height and fade, 240ms) as the row's gap opens, so nothing
 * jumps. When it turns on (the last task left) they come back only after that gap has shut: a 160ms fade, 240ms
 * late. First paint never moves; reduced and less motion swap at once.
 */
export function FoldAway({ show, children, fill, className }: FoldAwayProps) {
  const [was, setWas] = useState(show);
  const [phase, setPhase] = useState<'still' | 'out' | 'in'>('still');
  const ref = useRef<HTMLDivElement | null>(null);
  if (show !== was) {
    setWas(show);
    setPhase(show ? 'in' : 'out');
  }
  useLayoutEffect(() => {
    if (phase !== 'out') return;
    let live = true;
    const done = () => {
      if (live) setPhase('still');
    };
    if (fill) {
      const t = setTimeout(done, prefersReducedMotion() ? 0 : FILL_FADE_MS);
      return () => {
        live = false;
        clearTimeout(t);
      };
    }
    closeRow(ref.current, done);
    return () => {
      live = false;
    };
  }, [phase, fill]);
  if (!show && phase !== 'out') return null;
  return (
    <div
      key={phase === 'out' ? 'out' : 'shown'}
      ref={ref}
      className={cx(
        'tp-root tp-fold',
        fill && 'tp-fold-fill',
        phase === 'in' && show && 'tp-fold-in',
        fill && phase === 'out' && 'tp-fold-fade',
        className,
      )}
      aria-hidden={phase === 'out' ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
