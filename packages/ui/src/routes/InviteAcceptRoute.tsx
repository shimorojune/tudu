import { useParams, useNavigate, Link } from "@tanstack/react-router";
import {
  useAcceptInviteMutation,
  useGetInvitePreviewQuery,
} from "@tudu/store";
import { SPACE_COLOR_HEX } from "@tudu/shared";
import { Button } from "@/components/ui/button";
import { mutationResult, notifyAction } from "@/lib/notifyAction";

export function InviteAcceptRoute() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();
  const { data: preview, isLoading, isError } = useGetInvitePreviewQuery(token);
  const [acceptInvite, acceptState] = useAcceptInviteMutation();

  async function handleAccept() {
    try {
      const result = (await notifyAction(
        () => mutationResult(acceptInvite(token)),
        { success: "Invite accepted", error: "Could not accept invite" },
      )) as { orgSlug: string };
      void navigate({
        to: "/welcome",
        search: { orgSlug: result.orgSlug },
      });
    } catch {
      // Toast already shown.
    }
  }

  if (isLoading) {
    return null;
  }

  if (isError || !preview) {
    return (
      <div className="grid min-h-dvh place-items-center bg-card px-6 text-center">
        <p className="text-[15px]">This invite link is not valid.</p>
        <Link to="/" className="mt-4 text-[13px] underline">
          Go to Tudu
        </Link>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-card px-6">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4 text-center">
        <span
          className="grid size-12 place-items-center text-[18px] font-extrabold text-primary-foreground"
          style={{ backgroundColor: SPACE_COLOR_HEX[preview.color] }}
        >
          {preview.orgName.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="text-[20px] font-bold tracking-[-0.02em]">
          Join {preview.orgName}
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          {preview.inviterName ?? "A co-worker"} invited {preview.invitedEmail}.
        </p>
        <Button
          type="button"
          disabled={acceptState.isLoading || preview.status !== "pending"}
          onClick={() => void handleAccept()}
        >
          {acceptState.isLoading ? "Joining..." : "Accept invite"}
        </Button>
      </div>
    </div>
  );
}
