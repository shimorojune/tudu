import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { PersonDot, type PersonDotPerson } from './PersonDot';

export interface MemberRowPerson extends PersonDotPerson {
  id?: string;
  name: string;
  email: string;
  you?: boolean;
}

export const ROLE_WORDS: Record<'admin' | 'member', { label: string; hint: string }> = {
  admin: { label: 'Admin', hint: 'Can change the space and who’s in it' },
  member: { label: 'Member', hint: 'Can add, share and send tasks' },
};

export interface MemberRowProps {
  person: MemberRowPerson;
  role?: 'admin' | 'member';
  /** A pending invite instead of a person: a send mark, the email, "Invited 2 days ago", and quiet Cancel. */
  invited?: boolean;
  /** "2 days ago", "just now". */
  when?: string;
  onResend?: () => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * One person in a space: their mark, name, email and role. Changing roles and Remove wait for Settings (chunk 09),
 * so the role reads as a quiet word. `invited` shows a pending invite with Resend and Cancel.
 */
export function MemberRow({
  person: w,
  role = 'member',
  invited,
  when,
  onResend,
  onCancel,
  className,
}: MemberRowProps) {
  return (
    <div className={cx('tp-root tp-mrow', invited && 'tp-invited', className)} role="listitem">
      {invited ? (
        <span className="tp-mrow-inv" aria-hidden="true">
          <Icon name="send" size={13} />
        </span>
      ) : (
        <PersonDot person={w} size={32} />
      )}
      <span className="tp-mrow-n">
        <span className="tp-mrow-name">
          {invited ? w.email : w.name || w.email}
          {w.you ? <span className="tp-prow-you">You</span> : null}
        </span>
        <span className="tp-mrow-sub">{invited ? `Invited ${when ?? 'just now'}` : w.email}</span>
      </span>
      {invited ? (
        <div className="tp-mrow-acts">
          {onResend ? (
            <button type="button" className="tp-mrow-q" onClick={onResend}>
              Resend
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              className="tp-mrow-q"
              aria-label={`Cancel the invite to ${w.email}`}
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : (
        <span className="tp-mrow-role tp-ro">{ROLE_WORDS[role].label}</span>
      )}
    </div>
  );
}
