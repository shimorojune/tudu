import { cx } from '../lib/cx';

export interface PersonDotPerson {
  name?: string;
  initials?: string;
  /** Their colour. Ink by default. */
  color?: string;
  /** Their photo, shown in place of the initials. */
  image?: string;
}

export interface PersonDotProps {
  person: PersonDotPerson;
  /** Px, 20 by default; the initials scale with it. */
  size?: number;
  className?: string;
}

/** A person as a small round mark: their initials on their colour, or their photo. The full name is its tooltip. */
export function PersonDot({ person, size = 20, className }: PersonDotProps) {
  return (
    <span
      className={cx('tp-pdot', person.image && 'tp-photo', className)}
      title={person.name}
      style={{
        width: size,
        height: size,
        background: person.color || undefined,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {person.image ? <img src={person.image} alt="" draggable={false} /> : person.initials || '?'}
    </span>
  );
}
