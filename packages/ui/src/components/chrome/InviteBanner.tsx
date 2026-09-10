import { personFirstName } from "@/lib/person";
import {
  useAcceptTeamInviteMutation,
  useDeclineTeamInviteMutation,
  useGetTeamQuery,
} from "@tudu/store";

export function InviteBanner() {
  const { data } = useGetTeamQuery();
  const [acceptInvite] = useAcceptTeamInviteMutation();
  const [declineInvite] = useDeclineTeamInviteMutation();
  const incoming = data?.incomingInvites ?? [];
  const invite = incoming[0];

  if (!invite) {
    return null;
  }

  const name = personFirstName(invite.inviter.name);

  return (
    <div
      className="flex items-center gap-[16px] border-b border-rule bg-card px-[28px] py-[11px]"
      role="status"
    >
      <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
        <span className="font-bold text-foreground">{name}</span> wants to be your
        manager. Confirm before they can see your day.
      </p>
      <div className="flex shrink-0 items-center gap-[8px]">
        <button
          type="button"
          className="bg-foreground px-[12px] py-[6px] text-[12.5px] font-bold text-card"
          onClick={() => void acceptInvite(invite.id)}
        >
          Confirm
        </button>
        <button
          type="button"
          className="border border-rule px-[12px] py-[5px] text-[12.5px] text-muted-foreground"
          onClick={() => void declineInvite(invite.id)}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
