import { cx } from '../lib/cx';

export interface AvatarProps {
  /** One or two letters. */
  initials: string;
  /** Read out and shown on hover. */
  name: string;
  /** Defaults to ink. Never red: red means today. */
  color?: string;
  /** `md` 34px, `sm` 26px. */
  size?: 'md' | 'sm';
  className?: string;
}

/** A person, as initials in a round chip. */
export function Avatar({ initials, name, color, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cx('tp-root tp-avatar', size === 'sm' && 'tp-sm', className)}
      title={name}
      aria-label={name}
      role="img"
      style={color ? { background: color } : undefined}
    >
      {initials}
    </span>
  );
}
