import { personFirstName } from "@/lib/person";
import { Button } from "@/components/ui/button";
import { notifyAction, mutationResult } from "@/lib/notifyAction";
import {
  useAcceptTeamInviteMutation,
  useDeclineTeamInviteMutation,
  useGetTeamQuery,
} from "@tudu/store";

export function InviteBanner() {
  const { data } = useGetTeamQuery();
  const [acceptInvite, acceptState] = useAcceptTeamInviteMutation();
  const [declineInvite, declineState] = useDeclineTeamInviteMutation();
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
        <Button
          type="button"
          loading={Boolean(acceptState?.isLoading)}
          className="h-auto bg-foreground px-[12px] py-[6px] text-[12.5px] font-bold text-card"
          onClick={() =>
            void notifyAction(
              () => mutationResult(acceptInvite(invite.id)),
              { success: "Invite confirmed", error: "Could not confirm" },
            )
          }
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="outline"
          loading={Boolean(declineState?.isLoading)}
          className="h-auto border-rule px-[12px] py-[5px] text-[12.5px] text-muted-foreground"
          onClick={() =>
            void notifyAction(
              () => mutationResult(declineInvite(invite.id)),
              { success: "Invite declined", error: "Could not decline" },
            )
          }
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
