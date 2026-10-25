import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

export interface SpaceTileSpace {
  name?: string;
  color?: string;
  initials?: string;
  /** Personal is a paper tile with a person icon, so it never looks like a team. */
  personal?: boolean;
  /** All spaces: an ink tile with the sheets of every space stacked. */
  all?: boolean;
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
 * read as spaces, never as people (people are round: PersonDot). All spaces is an ink tile (ink means you) with
 * stacked sheets.
 */
export function SpaceTile({ space, size = 36, label, className }: SpaceTileProps) {
  const personal = !!space.personal;
  const all = !!space.all;
  const small = size < 18;
  return (
    <span
      className={cx('tp-stile', personal && 'tp-stile-me', all && 'tp-stile-all', className)}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: personal || all ? undefined : space.color,
        fontSize: Math.round(size * (personal ? 0.36 : 0.44)),
      }}
    >
      {all ? (
        // Sized so the icon sits on whole pixels inside the tile.
        <Icon name="layers" size={size - 2 * Math.round(size * 0.22)} stroke={small ? 2.4 : 2} />
      ) : personal ? (
        <Icon name="user" size={Math.round(size * (small ? 0.7 : 0.5))} stroke={small ? 2.4 : 2} />
      ) : (
        // Initials are drawn, not laid out as text: an SVG glyph sits on the tile's exact centre at any size or row
        // offset, where a text line snaps to the pixel grid on its own and drifts. .355em is half Geist's cap height.
        <svg className="tp-stile-txt" width="100%" height="100%" aria-hidden="true">
          <text x="50%" y="50%" dy=".355em" textAnchor="middle">
            {space.initials || String(space.name || '?').slice(0, 1)}
          </text>
        </svg>
      )}
    </span>
  );
}
