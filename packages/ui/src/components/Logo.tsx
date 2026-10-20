import { cx } from '../lib/cx';
import { INK_SHAPE } from '../lib/ink';

export interface LogoProps {
  /** The mark's height in px, 24 by default. Smallest 16. */
  size?: number;
  /** Set "Tudu" beside the mark in Geist Semibold. */
  wordmark?: boolean;
  className?: string;
}

/**
 * The stacked ink tick, drawn live in the theme's colours: today's paper box (card, check-border edge), the ink tick
 * (foreground) breaking out of its corner, and the ember sheet (brand) tilted behind. Follows light and dark by itself.
 */
export function Logo({ size = 24, wordmark, className }: LogoProps) {
  const mark = (
    <svg
      className="tp-logo-mark"
      width={(size * 101) / 99.5}
      height={size}
      viewBox="9.5 13.5 101 99.5"
      aria-hidden={wordmark ? 'true' : undefined}
      role={wordmark ? undefined : 'img'}
      aria-label={wordmark ? undefined : 'Tudu'}
    >
      <rect x={17} y={25} width={74} height={74} rx={20} transform="rotate(-10 54 62)" fill="var(--brand)" />
      <rect
        x={24}
        y={34}
        width={74}
        height={74}
        rx={20}
        fill="var(--card)"
        stroke="var(--check-border)"
        strokeWidth={6}
      />
      <path transform="translate(27.89 6.74) scale(3.5702)" d={INK_SHAPE} fill="var(--foreground)" />
    </svg>
  );
  if (!wordmark) return <span className={cx('tp-root tp-logo', className)}>{mark}</span>;
  return (
    <span
      className={cx('tp-root tp-logo', className)}
      role="img"
      aria-label="Tudu"
      style={{ gap: Math.round(size * 0.32) }}
    >
      {mark}
      <span className="tp-logo-word" style={{ fontSize: Math.round(size * 0.78) }} aria-hidden="true">
        Tudu
      </span>
    </span>
  );
}
