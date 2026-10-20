/* eslint-disable react-hooks/refs -- the page turn keeps the outgoing day's content and its direction in refs so it can slide away while the new day renders */
import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';

export interface SheetProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode;
  /** The element to render, `section` by default. */
  as?: 'section' | 'div' | 'article' | 'main';
  /** Names it for screen readers. */
  label?: string;
  /** The day being shown. When it changes, the page turns. */
  turnKey?: string | number;
  turnDir?: 'next' | 'prev';
  /** Keeps short days from shrinking the sheet (560px on the desktop day page). */
  minHeight?: number;
  /** The sheet fills its column; put the scrolling part in a SheetBody. */
  fill?: boolean;
  /** The same page turn without the paper. */
  plain?: boolean;
}

const OUT_MS = 110;

/**
 * The paper: a card surface with radius-xl, shadow-sheet and the paper grain. Give it `turnKey` and the old
 * content slides 10px away and fades (110ms), the new one slides in from the other side (dur-day-turn) and the
 * sheet's height eases to fit instead of jumping.
 */
export function Sheet({
  children,
  as = 'section',
  label,
  turnKey,
  turnDir = 'next',
  minHeight,
  fill,
  plain,
  className,
  style,
  ...rest
}: SheetProps) {
  const turning = turnKey !== undefined && turnKey !== null;
  const ref = useRef<HTMLElement | null>(null);
  const shownKey = useRef(turnKey);
  const snapshot = useRef(children);
  const fromHeight = useRef(0);
  const fromOuter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dir = useRef(turnDir);
  const [phase, setPhase] = useState(0);

  const changed = turning && turnKey !== shownKey.current;
  if (!changed) snapshot.current = children;
  else dir.current = turnDir;

  useEffect(() => {
    if (!changed) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      fromHeight.current = el ? el.getBoundingClientRect().height : 0;
      const outer = el && plain ? el.closest('.tp-sheet-body')?.closest('.tp-sheet') : null;
      fromOuter.current = outer ? outer.getBoundingClientRect().height : 0;
      shownKey.current = turnKey;
      setPhase((n) => n + 1);
    }, OUT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !phase || !fromHeight.current) return;
    const from = fromHeight.current;
    fromHeight.current = 0;
    el.style.height = '';
    const to = el.getBoundingClientRect().height;
    const outer = plain ? (el.closest('.tp-sheet-body')?.closest('.tp-sheet') as HTMLElement | null) : null;
    if (outer) {
      const fo = fromOuter.current;
      fromOuter.current = 0;
      outer.style.height = '';
      const tov = outer.getBoundingClientRect().height;
      if (!fo || Math.abs(fo - tov) < 1) return;
      outer.style.transition = 'none';
      outer.style.height = `${fo}px`;
      void outer.offsetHeight;
      outer.style.transition = 'height var(--dur-day-turn) var(--ease-settle)';
      outer.style.height = `${tov}px`;
      const fin = (e: TransitionEvent) => {
        if (e.target === outer && e.propertyName === 'height') {
          outer.style.height = '';
          outer.style.transition = '';
          outer.removeEventListener('transitionend', fin);
        }
      };
      outer.addEventListener('transitionend', fin);
      return;
    }
    if (Math.abs(from - to) < 1) return;
    el.style.transition = 'none';
    el.style.height = `${from}px`;
    el.style.overflow = 'hidden';
    void el.offsetHeight;
    el.style.transition = 'height var(--dur-day-turn) var(--ease-settle)';
    el.style.height = `${to}px`;
    const done = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'height') {
        el.style.height = '';
        el.style.overflow = '';
        el.style.transition = '';
        el.removeEventListener('transitionend', done);
      }
    };
    el.addEventListener('transitionend', done);
  }, [phase, plain]);

  const body = turning ? (
    <div
      key={`k${phase}`}
      className={cx(
        'tp-turn',
        changed ? `tp-turn-out-${dir.current}` : phase ? `tp-turn-in-${dir.current}` : null,
      )}
    >
      {changed ? snapshot.current : children}
    </div>
  ) : (
    children
  );
  const mergedStyle: CSSProperties | undefined = minHeight ? { minHeight, ...style } : style;
  return createElement(
    as,
    {
      ref,
      className: cx('tp-root', plain ? 'tp-sheet-plain' : 'tp-sheet', fill && 'tp-sheet-fill', className),
      style: mergedStyle,
      'aria-label': label,
      ...rest,
    },
    body,
  );
}

export interface SheetBodyProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** The part of a filled Sheet that scrolls. Once it has scrolled, its top edge fades under the header's hairline. */
export function SheetBody({ children, className, onScroll, ...rest }: SheetBodyProps) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div
      className={cx('tp-sheet-body', scrolled && 'tp-scrolled', className)}
      data-scrolled={scrolled ? 'true' : undefined}
      onScroll={(e) => {
        const on = e.currentTarget.scrollTop > 2;
        if (on !== scrolled) setScrolled(on);
        onScroll?.(e);
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface DayTitleProps {
  day: string;
  date?: string;
  /** "Today" only on today; other days show the week ("Week 41"). */
  eyebrow?: string;
  className?: string;
}

/** The heading of a day sheet: a mono eyebrow in brand-text, the day in Instrument Serif, the date in italic. */
export function DayTitle({ day, date, eyebrow, className }: DayTitleProps) {
  return (
    <div className={cx('tp-root', className)}>
      {eyebrow ? (
        <div className="tp-eyebrow" style={{ marginBottom: 8 }}>
          {eyebrow}
        </div>
      ) : null}
      <div className="tp-day">
        <h1>{day}</h1>
        {date ? <span>{date}</span> : null}
      </div>
    </div>
  );
}
