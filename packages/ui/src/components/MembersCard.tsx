import { cx } from '../lib/cx';
import { Dialog } from './Dialog';
import { MembersBody, type MembersBodyInvite, type MembersBodyMember } from './MembersBody';

export type MembersCardMember = MembersBodyMember;
export type MembersCardInvite = MembersBodyInvite;

export interface MembersCardProps {
  open: boolean;
  onClose?: () => void;
  spaceName: string;
  members: MembersCardMember[];
  invites: MembersCardInvite[];
  /** Send the invites; resolve when they are on their way (the button confirms "Sent"). */
  onInvite?: (emails: string[]) => Promise<void> | void;
  onCancelInvite?: (invite: MembersCardInvite) => void;
  onResendInvite?: (invite: MembersCardInvite) => void;
  /** You are an admin: roles are menus with Remove. */
  canEdit?: boolean;
  onRole?: (member: MembersCardMember, role: 'admin' | 'member') => void;
  onRemove?: (member: MembersCardMember) => void;
  /** `sheet` on phones. */
  variant?: 'dialog' | 'sheet';
  inline?: boolean;
  /** The kit: start with these. */
  initial?: { invites?: string[]; busy?: 0 | 1 | 2; noFocus?: boolean };
  className?: string;
}

/** "Sent" shows for this long before the field clears. */
export { MB_DONE_MS as MC_DONE_MS } from './MembersBody';

/**
 * The Members card: Settings › Members as a card of its own, for the welcome on a new space, People and the space
 * list: who is in the space with their role, an email line with Invite, and the invites still waiting.
 */
export function MembersCard(p: MembersCardProps) {
  const init = p.initial ?? {};
  const sheet = p.variant === 'sheet';
  return (
    <Dialog
      open={p.open}
      inline={p.inline}
      onClose={p.onClose}
      variant={sheet ? 'sheet' : 'dialog'}
      size="md"
      title="Members"
      sub={`Who is in ${p.spaceName}, and who is invited.`}
      noFocus={init.noFocus}
      className={cx('tp-mc', p.className)}
    >
      <MembersBody
        spaceName={p.spaceName}
        members={p.members}
        invites={p.invites}
        onInvite={p.onInvite}
        onCancelInvite={p.onCancelInvite}
        onResendInvite={p.onResendInvite}
        canEdit={p.canEdit}
        onRole={p.onRole}
        onRemove={p.onRemove}
        autoFocus={!init.noFocus && !sheet}
        initial={init}
      />
    </Dialog>
  );
}
