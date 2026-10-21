import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { TickSvg } from '../lib/ink';
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
  /** An admin's view: the role is a menu (Admin, Member, then Remove). Never on your own row. */
  canEdit?: boolean;
  onRole?: (role: 'admin' | 'member') => void;
  onRemove?: () => void;
  /** For "Remove from Northwind". */
  spaceName?: string;
  className?: string;
}

const ROLES = ['admin', 'member'] as const;

/**
 * One person in a space: their mark, name, email and role. For an admin the role is a menu: Admin or Member, then
 * Remove from the space; it opens downward, or upward when there is no room below. Everyone else sees the role as
 * a quiet word. `invited` shows a pending invite with Resend and Cancel.
 */
export function MemberRow({
  person: w,
  role = 'member',
  invited,
  when,
  onResend,
  onCancel,
  canEdit,
  onRole,
  onRemove,
  spaceName,
  className,
}: MemberRowProps) {
  const [open, setOpen] = useState(false);
  const words = ROLE_WORDS[role];
  const roleControl =
    !canEdit || w.you ? (
      <span className="tp-mrow-role tp-ro">{words.label}</span>
    ) : (
      <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cx('tp-mrow-role', open && 'tp-on')}
            aria-label={`${w.name || w.email}: ${words.label}`}
          >
            {words.label}
            <span className="tp-mrow-chev" aria-hidden="true">
              <Icon name="right" size={12} />
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="tp-root tp-menu tp-mrow-menu tp-menu-pop"
            aria-label={`Role of ${w.name || w.email}`}
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            loop
          >
            <DropdownMenu.RadioGroup
              value={role}
              onValueChange={(v) => {
                if (v !== role) onRole?.(v as 'admin' | 'member');
              }}
            >
              {ROLES.map((r) => (
                <DropdownMenu.RadioItem key={r} value={r} className={cx('tp-mrow-mi', r === role && 'tp-on')}>
                  <span className="tp-mrow-mt">
                    <span>{ROLE_WORDS[r].label}</span>
                    <span>{ROLE_WORDS[r].hint}</span>
                  </span>
                  {r === role ? <TickSvg size={13} /> : null}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
            {onRemove ? (
              <>
                <DropdownMenu.Separator className="tp-mrow-sep" />
                <DropdownMenu.Item className="tp-mi" onSelect={() => onRemove()}>
                  Remove from {spaceName ?? 'the space'}
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
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
        roleControl
      )}
    </div>
  );
}
