import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

export interface SpaceTileSpace {
  name?: string;
  color?: string;
  initials?: string;
  /** Personal is a paper tile with a person icon, so it never looks like a team. */
  personal?: boolean;
}

export interface SpaceTileProps {
  space: SpaceTileSpace;
  /** Px: 38 on the rail, 26 to 28 in lists and headers; 36 by default. */
  size?: number;
  /** Names it when it stands alone; otherwise it is decorative and hidden from screen readers. */
  label?: string;
  className?: string;
}

/**
 * A space as a rounded square: its first letter on its colour. The corner radius is 30% of the size, so tiles
 * read as spaces, never as people (people are round: PersonDot).
 */
export function SpaceTile({ space, size = 36, label, className }: SpaceTileProps) {
  const personal = !!space.personal;
  return (
    <span
      className={cx('tp-stile', personal && 'tp-stile-me', className)}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: personal ? undefined : space.color,
        fontSize: Math.round(size * (personal ? 0.36 : 0.44)),
      }}
    >
      {personal ? (
        <Icon name="user" size={Math.round(size * 0.5)} />
      ) : (
        space.initials || String(space.name || '?').slice(0, 1)
      )}
    </span>
  );
}
