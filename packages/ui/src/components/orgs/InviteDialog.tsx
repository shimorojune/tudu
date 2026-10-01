import { useMemo, useState } from "react";
import type { OrgRole } from "@tudu/shared";
import {
  resolveWebAppBaseUrl,
  useApproveJoinRequestMutation,
  useCreateOrgInviteMutation,
  useDeclineJoinRequestMutation,
  useGetOrgQuery,
  useListOrgInvitesQuery,
  useRegenerateJoinLinkMutation,
  useResendOrgInviteMutation,
  useRevokeOrgInviteMutation,
} from "@tudu/store";
import { SPACE_COLOR_HEX } from "@tudu/shared";
import { FormBusy } from "@/components/forms/FormBusy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mutationResult, notifyAction } from "@/lib/notifyAction";
import { toast } from "sonner";

export type InviteDialogProps = {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InviteDialog({ slug, open, onOpenChange }: InviteDialogProps) {
  const { data: org } = useGetOrgQuery(slug, { skip: !open });
  const { data: invitesPayload, refetch } = useListOrgInvitesQuery(slug, {
    skip: !open,
  });
  const [createInvite, createState] = useCreateOrgInviteMutation();
  const [resendInvite] = useResendOrgInviteMutation();
  const [revokeInvite] = useRevokeOrgInviteMutation();
  const [regenerateJoinLink, regenState] = useRegenerateJoinLinkMutation();
  const [approveJoin] = useApproveJoinRequestMutation();
  const [declineJoin] = useDeclineJoinRequestMutation();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");

  const joinUrl = useMemo(() => {
    const code = invitesPayload?.joinCode;
    if (!code) {
      return "";
    }
    return `${resolveWebAppBaseUrl()}/join/${code}`;
  }, [invitesPayload?.joinCode]);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    try {
      const result = await mutationResult(
        createInvite({ slug, body: { email: trimmed, role } }),
      );
      const payload = result as { emailDelivered?: boolean };
      toast.success(
        payload.emailDelivered
          ? "Invite sent"
          : "Invite saved. Email is not configured; share the join link.",
      );
      setEmail("");
      void refetch();
    } catch {
      toast.error("Could not send invite");
    }
  }

  async function copyJoinLink() {
    if (!joinUrl) {
      return;
    }
    await navigator.clipboard.writeText(joinUrl);
  }

  const pendingInvites =
    invitesPayload?.invites.filter((row) => row.status === "pending") ?? [];
  const pendingJoins =
    invitesPayload?.joinRequests.filter((row) => row.status === "pending") ??
    [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] gap-0 p-0">
        <DialogHeader className="flex flex-row items-center gap-[11px] border-b border-rule px-[22px] py-[18px]">
          <span
            className="size-4 shrink-0"
            style={{
              backgroundColor: org?.color
                ? SPACE_COLOR_HEX[org.color]
                : "var(--foreground)",
            }}
          />
          <DialogTitle className="text-[17px] font-bold tracking-[-0.01em]">
            Invite to {org?.name ?? "organization"}
          </DialogTitle>
        </DialogHeader>

        <FormBusy
          busy={createState.isLoading}
          className="flex flex-col gap-[11px] border-b border-hair px-[22px] py-[18px]"
        >
          <div className="flex gap-[9px]">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="min-w-0 flex-1 text-[13.5px]"
            />
            <Select
              value={role}
              onValueChange={(value) => setRole(value as OrgRole)}
            >
              <SelectTrigger className="w-[120px]" aria-label="Invite role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                {org?.role === "owner" ? (
                  <SelectItem value="owner">Owner</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={createState.isLoading || !email.trim()}
              onClick={() => void handleInvite()}
            >
              Invite
            </Button>
          </div>
        </FormBusy>

        {invitesPayload?.joinLinkEnabled ? (
          <div className="flex flex-col gap-[10px] border-b border-hair px-[22px] py-[16px]">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Join link
            </span>
            <div className="flex gap-[9px]">
              <Input
                readOnly
                value={joinUrl}
                className="min-w-0 flex-1 font-mono text-[12.5px] text-muted-foreground"
              />
              <Button type="button" variant="outline" onClick={() => void copyJoinLink()}>
                Copy
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={regenState.isLoading}
                onClick={() =>
                  void notifyAction(
                    () => mutationResult(regenerateJoinLink(slug)),
                    {
                      success: "Join link regenerated",
                      error: "Could not regenerate link",
                    },
                  )
                }
              >
                Regenerate
              </Button>
            </div>
          </div>
        ) : null}

        <div className="max-h-[280px] overflow-y-auto">
          {pendingInvites.length > 0 ? (
            <div className="px-[22px] py-[12px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Pending invites
            </div>
          ) : null}
          {pendingInvites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center gap-3 border-t border-hair px-[22px] py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px]">{invite.email}</div>
                <div className="text-[11.5px] text-faint">
                  {invite.role} · invited by {invite.inviterName ?? "someone"}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!invite.canResend}
                onClick={() =>
                  void (async () => {
                    try {
                      const result = await mutationResult(
                        resendInvite({ slug, inviteId: invite.id }),
                      );
                      const payload = result as { emailDelivered?: boolean };
                      toast.success(
                        payload.emailDelivered
                          ? "Invite resent"
                          : "Invite still pending. Email is not configured.",
                      );
                    } catch {
                      toast.error("Could not resend");
                    }
                  })()
                }
              >
                Resend
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!invite.canRevoke}
                onClick={() =>
                  void notifyAction(
                    () =>
                      mutationResult(
                        revokeInvite({ slug, inviteId: invite.id }),
                      ),
                    { success: "Invite revoked", error: "Could not revoke" },
                  )
                }
              >
                Revoke
              </Button>
            </div>
          ))}

          {pendingJoins.map((request) => (
            <div
              key={request.id}
              className="flex items-center gap-3 border-t border-hair px-[22px] py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px]">
                  {request.userName ?? request.userEmail}
                </div>
                <div className="text-[11.5px] text-faint">
                  Joined by link · awaiting approval
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void notifyAction(
                    () =>
                      mutationResult(
                        approveJoin({ slug, requestId: request.id }),
                      ),
                    { success: "Member approved", error: "Could not approve" },
                  )
                }
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void notifyAction(
                    () =>
                      mutationResult(
                        declineJoin({ slug, requestId: request.id }),
                      ),
                    { success: "Request declined", error: "Could not decline" },
                  )
                }
              >
                Decline
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
