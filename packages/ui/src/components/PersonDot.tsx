import { cx } from '../lib/cx';

export interface PersonDotPerson {
  name?: string;
  initials?: string;
  /** Their colour. Ink by default. */
  color?: string;
}

export interface PersonDotProps {
  person: PersonDotPerson;
  /** Px, 20 by default; the initials scale with it. */
  size?: number;
  className?: string;
}

/** A person as a small round mark: their initials on their colour. The full name is its tooltip. */
export function PersonDot({ person, size = 20, className }: PersonDotProps) {
  return (
    <span
      className={cx('tp-pdot', className)}
      title={person.name}
      style={{
        width: size,
        height: size,
        background: person.color || undefined,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {person.initials || '?'}
    </span>
  );
}
