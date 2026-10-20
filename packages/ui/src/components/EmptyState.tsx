import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from '../lib/icons';
import { Button } from './Button';
import { Logo } from './Logo';

export interface EmptyStateProps {
  /** Serif, one sentence, never an exclamation mark. */
  title: string;
  /** One or two lines. */
  children?: ReactNode;
  action?: string;
  onAction?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  /** `error` swaps the mark for the error icon and uses a secondary button. */
  tone?: 'default' | 'error';
  /** The action is a way back ("Show all projects"): a secondary button with no icon. */
  plain?: boolean;
  /** Hide the mark. */
  mark?: boolean;
  /** A line icon in a soft 56px accent well instead of the mark (empty panes that are not a day). */
  icon?: IconName;
  className?: string;
}

/** Short, kind, one next step. Sits on the sheet where the list would be, and fades up into place. */
export function EmptyState({
  title,
  children,
  action,
  onAction,
  loading,
  loadingLabel,
  tone = 'default',
  plain,
  mark = true,
  icon,
  className,
}: EmptyStateProps) {
  const error = tone === 'error';
  return (
    <div className={cx('tp-root tp-empty', error && 'tp-empty-error', className)} data-tone={tone}>
      {icon ? (
        <span className="tp-empty-mark tp-empty-icon" aria-hidden="true">
          <Icon name={icon} size={22} stroke={1.75} />
        </span>
      ) : mark ? (
        <span className="tp-empty-mark" aria-hidden="true">
          {error ? <Icon name="error" size={18} /> : <Logo size={30} />}
        </span>
      ) : null}
      <p className="tp-empty-t">{title}</p>
      {children ? <p className="tp-empty-b">{children}</p> : null}
      {action ? (
        <Button
          variant={error || plain ? 'secondary' : 'primary'}
          icon={
            plain ? undefined : error ? <Icon name="refresh" size={14} /> : <Icon name="plus" size={14} />
          }
          loading={loading}
          loadingLabel={loadingLabel}
          onClick={onAction}
        >
          {action}
        </Button>
      ) : null}
    </div>
  );
}
