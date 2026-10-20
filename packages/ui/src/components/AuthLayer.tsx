import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { TickSvg } from '../lib/ink';

export interface AuthLayerProps {
  open: boolean;
  /** Draws the page in place, without the layer (state boards, tests). */
  inline?: boolean;
  /** The form alone. */
  phone?: boolean;
  /** The form on the left and a picture of the day on the right (desktop). */
  side?: boolean;
  /** The accessible name of the region. */
  label?: string;
  className?: string;
  children?: ReactNode;
}

/** The layer fades away over 320ms to show the app underneath. */
export const AUTH_LEAVE_MS = 320;

/**
 * The full-window layer sign in and the first run sit on: the desk colour, fading in over 320ms. When `open` turns
 * false it fades out (and grows a hair) over 320ms, then unmounts.
 */
export function AuthLayer({ open, inline, phone, side, label, className, children }: AuthLayerProps) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  // Opening mounts at once; closing keeps the layer while it fades, then unmounts (the timer below).
  if (open && (!mounted || leaving)) {
    setMounted(true);
    setLeaving(false);
  }
  if (!open && mounted && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, AUTH_LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!mounted && !inline) return null;
  return (
    <div
      className={cx(
        'tp-root tp-auth',
        inline && 'tp-auth-inline',
        phone && 'tp-auth-phone',
        side && !phone && 'tp-auth-split',
        leaving && 'tp-leaving',
        className,
      )}
      role="main"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export interface AuthArtProps {
  /** The day on the sheet, "Tuesday" by default. */
  day?: string;
  /** The date beside it, "20 October" by default. */
  date?: string;
  /** The week in the eyebrow, 43 by default. */
  week?: number;
  /** The line under the picture, "One calm page for your day." by default. */
  caption?: string;
}

const ROWS: Array<[text: string, done: boolean]> = [
  ['Send the quarterly numbers to Meera', true],
  ['Book the car service', false],
  ['Read the onboarding notes', false],
];

/**
 * A calm picture of the day for the sign-in page's other half: an ember sheet tilted behind a paper sheet with today
 * on it. Decorative; hidden from screen readers.
 */
export function AuthArt({
  day = 'Tuesday',
  date = '20 October',
  week = 43,
  caption = 'One calm page for your day.',
}: AuthArtProps) {
  return (
    <div className="tp-auth-art" aria-hidden="true">
      <div className="tp-auth-paper">
        <div className="tp-auth-ember" />
        <div className="tp-sheet tp-auth-sheet">
          <div className="tp-auth-eye">Today · Week {week}</div>
          <div className="tp-auth-day">
            <span>{day}</span>
            <em>{date}</em>
          </div>
          {ROWS.map(([text, done], i) => (
            <div key={i} className={cx('tp-auth-row', done && 'tp-done')}>
              <span className="tp-auth-box">{done ? <TickSvg size={14} /> : null}</span>
              <span>{text}</span>
            </div>
          ))}
          <div className="tp-auth-row tp-auth-wnext">
            <span className="tp-auth-box" />
            <span>Write the next thing…</span>
          </div>
        </div>
      </div>
      <p className="tp-auth-cap">{caption}</p>
    </div>
  );
}
