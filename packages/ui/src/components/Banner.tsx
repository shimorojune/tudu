import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

export type BannerTone = 'warning' | 'error' | 'success' | 'info';

export interface BannerAction {
  label: string;
  onClick?: () => void;
  primary?: boolean;
}

export interface BannerProps {
  tone?: BannerTone;
  /** Bold, ends with a full stop. */
  title: ReactNode;
  /** The detail. */
  children?: ReactNode;
  action?: string;
  onAction?: () => void;
  /** Two choices, e.g. "Start Monday" (primary) and "Stay on Sunday". */
  actions?: BannerAction[];
  /** Shows a × button. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * A one-line status message: icon on the first line, bold summary, detail, optional action. It opens its own room
 * (the space grows from 0 while it fades in, 280ms) so nothing below it jumps. Each tone has its own icon.
 */
export function Banner({
  tone = 'warning',
  title,
  children,
  action,
  onAction,
  actions,
  onDismiss,
  className,
}: BannerProps) {
  const acts = actions ?? (action ? [{ label: action, onClick: onAction }] : []);
  return (
    <div className={cx('tp-root tp-banner-wrap', className)}>
      <div
        className={cx('tp-banner', `tp-banner-${tone}`)}
        role={tone === 'error' ? 'alert' : 'status'}
        data-tone={tone}
      >
        <Icon name={tone} size={18} />
        <span className="tp-sp">
          <b>{title}</b>
          {children ? ' ' : null}
          {children}
        </span>
        {acts.map((a, i) => (
          <button key={i} type="button" className={cx(a.primary && 'tp-solid')} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
        {onDismiss ? (
          <button type="button" className="tp-x" aria-label="Dismiss" onClick={onDismiss}>
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
