import { useId } from 'react';
import { cx } from '../lib/cx';

export interface JiraMarkProps {
  /** Its height in px, 14 by default. */
  size?: number;
  /** Names it when it stands alone; otherwise it is decorative and hidden from screen readers. */
  label?: string;
  className?: string;
}

/**
 * Jira's own logo: Atlassian's two-tone blue mark as the team supplied it, never redrawn, recoloured or rotated.
 * It keeps its colours in light and dark. Each copy gets its own gradient ids, so many can share a page.
 */
export function JiraMark({ size = 14, label, className }: JiraMarkProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const a = `tp-jm${uid}a`;
  const b = `tp-jm${uid}b`;
  return (
    <svg
      className={cx('tp-jm', className)}
      width={(size * 214.09) / 224}
      height={size}
      viewBox="2.59 0 214.09101008 224"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <defs>
        <linearGradient
          id={a}
          gradientTransform="matrix(1 0 0 -1 0 264)"
          gradientUnits="userSpaceOnUse"
          x1={102.4}
          x2={56.15}
          y1={218.63}
          y2={172.39}
        >
          <stop offset=".18" stopColor="#0052cc" />
          <stop offset="1" stopColor="#2684ff" />
        </linearGradient>
        <linearGradient
          id={b}
          gradientTransform="matrix(1 0 0 -1 0 264)"
          gradientUnits="userSpaceOnUse"
          x1={114.65}
          x2={160.81}
          y1={85.77}
          y2={131.92}
        >
          <stop offset=".18" stopColor="#0052cc" />
          <stop offset="1" stopColor="#2684ff" />
        </linearGradient>
      </defs>
      <path
        d="m214.06 105.73-96.39-96.39-9.34-9.34-72.56 72.56-33.18 33.17a8.89 8.89 0 0 0 0 12.54l66.29 66.29 39.45 39.44 72.55-72.56 1.13-1.12 32.05-32a8.87 8.87 0 0 0 0-12.59zm-105.73 39.39-33.12-33.12 33.12-33.12 33.11 33.12z"
        fill="#2684ff"
      />
      <path d="m108.33 78.88a55.75 55.75 0 0 1 -.24-78.61l-72.47 72.44 39.44 39.44z" fill={`url(#${a})`} />
      <path d="m141.53 111.91-33.2 33.21a55.77 55.77 0 0 1 0 78.86l72.67-72.63z" fill={`url(#${b})`} />
    </svg>
  );
}
