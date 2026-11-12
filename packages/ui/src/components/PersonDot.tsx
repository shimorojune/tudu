import { cx } from '../lib/cx';
import { useMine } from '../lib/scramble';

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
  // Scramble my text: the name and initials jumble; a photo becomes a block (html[data-scrambled]).
  const mine = useMine();
  return (
    <span
      className={cx('tp-pdot', person.image && 'tp-photo', className)}
      title={person.name ? mine(person.name) : undefined}
      style={{
        width: size,
        height: size,
        background: person.color || undefined,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {person.image ? <img src={person.image} alt="" draggable={false} /> : mine(person.initials) || '?'}
    </span>
  );
}
