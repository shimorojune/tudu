import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { closeRow } from '../lib/motion';

export interface FoldAwayProps {
  /** Whether the content belongs on the page now. */
  show: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Words that make way for a list, like "Nothing waiting." over an empty Backlog. When `show` turns off (the first
 * task lands) the words stay a moment and fold away (height and fade, 240ms) as the row's gap opens, so nothing
 * jumps. When it turns on (the last task left) they come back only after that gap has shut: a 160ms fade, 240ms
 * late. First paint never moves; reduced and less motion swap at once.
 */
export function FoldAway({ show, children, className }: FoldAwayProps) {
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
    closeRow(ref.current, () => {
      if (live) setPhase('still');
    });
    return () => {
      live = false;
    };
  }, [phase]);
  if (!show && phase !== 'out') return null;
  return (
    <div
      key={phase === 'out' ? 'out' : 'shown'}
      ref={ref}
      className={cx('tp-root tp-fold', phase === 'in' && show && 'tp-fold-in', className)}
      aria-hidden={phase === 'out' ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
