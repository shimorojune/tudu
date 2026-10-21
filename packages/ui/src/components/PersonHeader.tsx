import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { PersonDot, type PersonDotPerson } from './PersonDot';

export interface PersonHeaderProps {
  person: PersonDotPerson & { name: string; email?: string };
  /** The quiet line: the email, or "email · spaces you share". */
  sub?: string;
  /** The tools row: "Send Meera a task". */
  children?: ReactNode;
  /** Phones: a 44px mark and a 34px name. */
  compact?: boolean;
  className?: string;
}

/**
 * The top of a member's page: a 56px mark, their name in the serif (like a day title), a quiet line and a tools row.
 * Its insets match the day header's, so every page title starts in the same place.
 */
export function PersonHeader({ person: w, sub, children, compact, className }: PersonHeaderProps) {
  return (
    <header className={cx('tp-root tp-ph', compact && 'tp-compact', className)}>
      <div className="tp-ph-row">
        <PersonDot person={w} size={compact ? 44 : 56} />
        <div className="tp-ph-n">
          <h1 className="tp-ph-name">{w.name}</h1>
          <div className="tp-ph-sub">{sub ?? w.email}</div>
        </div>
      </div>
      {children ? <div className="tp-ph-tools">{children}</div> : null}
    </header>
  );
}
