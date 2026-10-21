import { cx } from '../lib/cx';

export interface AvatarProps {
  /** One or two letters. */
  initials: string;
  /** Read out and shown on hover. */
  name: string;
  /** Defaults to ink. Never red: red means today. */
  color?: string;
  /** Their photo, in place of the initials. */
  image?: string;
  /** `md` 34px, `sm` 26px. */
  size?: 'md' | 'sm';
  className?: string;
}

/** A person, as initials in a round chip. */
export function Avatar({ initials, name, color, image, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cx('tp-root tp-avatar', size === 'sm' && 'tp-sm', image && 'tp-photo', className)}
      title={name}
      aria-label={name}
      role="img"
      style={color ? { background: color } : undefined}
    >
      {image ? <img src={image} alt="" draggable={false} /> : initials}
    </span>
  );
}
