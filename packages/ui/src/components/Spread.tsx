import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../lib/cx';

interface SpreadState {
  shown: boolean;
  mounted: boolean;
  moving: boolean;
}

const SpreadCtx = createContext<SpreadState | null>(null);

export interface SpreadProps {
  /** Two days. */
  open?: boolean;
  /** The two pages. */
  children?: ReactNode;
  /** 1320px by default. */
  maxWidth?: number;
  style?: CSSProperties;
  className?: string;
}

/** How long the move takes, with a little room for the last frame. */
export const SPREAD_MS = 340;

/**
 * One day, or two side by side, on the desk. Turning `open` on, the second page slides out from behind the first
 * and pushes it aside: the first narrows from the one-day width to half the row while the second widens from
 * nothing, in one move (dur-spread, ease-settle). The second page's content mounts when two days open and unmounts
 * after it has slid away. At rest nothing is clipped, so tasks drag freely from one page to the other.
 * Reduced motion: the pages switch without moving and the second fades in.
 */
export function Spread({ open = false, children, maxWidth, style, className }: SpreadProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const [moving, setMoving] = useState(false);
  // Each switch is one move. Mount the second page at zero width first; the effect then moves both pages together.
  const [move, setMove] = useState(0);
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    setMove((n) => n + 1);
    setMoving(true);
    if (open) setMounted(true);
    else setShown(false);
  }
  useEffect(() => {
    if (!move) return;
    let r1 = 0;
    let r2 = 0;
    if (open) r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))));
    // The end of the move settles everything, even where frames never ran (a tab in the background).
    const t = setTimeout(() => {
      if (open) setShown(true);
      else setMounted(false);
      setMoving(false);
    }, SPREAD_MS);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(t);
    };
  }, [move, open]);
  const merged: CSSProperties = { ...(maxWidth ? { maxWidth } : null), ...style };
  return (
    <SpreadCtx.Provider value={{ shown, mounted, moving }}>
      <div className={cx('tp-root tp-spread', shown && 'tp-spread-two', className)} style={merged}>
        {children}
      </div>
    </SpreadCtx.Provider>
  );
}

export interface SpreadPageProps {
  children?: ReactNode;
  /** The page that comes and goes. */
  second?: boolean;
  className?: string;
}

/** One page of a Spread, holding a Sheet. */
export function SpreadPage({ children, second, className }: SpreadPageProps) {
  const c = useContext(SpreadCtx) ?? { shown: false, mounted: false, moving: false };
  return (
    <div
      className={cx(
        'tp-spread-page',
        second ? 'tp-spread-second' : 'tp-spread-first',
        c.shown && 'tp-on',
        c.moving && 'tp-moving',
        className,
      )}
      aria-hidden={second && !c.mounted ? 'true' : undefined}
    >
      {second ? c.mounted ? <div className="tp-spread-inner">{children}</div> : null : children}
    </div>
  );
}
