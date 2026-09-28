import { useParams, useNavigate, Link } from "@tanstack/react-router";
import {
  useGetJoinPreviewQuery,
  useRequestJoinMutation,
} from "@tudu/store";
import { SPACE_COLOR_HEX } from "@tudu/shared";
import { Button } from "@/components/ui/button";
import { mutationResult, notifyAction } from "@/lib/notifyAction";

export function JoinRoute() {
  const { code } = useParams({ strict: false }) as { code: string };
  const navigate = useNavigate();
  const { data: preview, isLoading, isError } = useGetJoinPreviewQuery(code);
  const [requestJoin, joinState] = useRequestJoinMutation();

  async function handleJoin() {
    try {
      await notifyAction(
        () => mutationResult(requestJoin(code)),
        {
          success: "Join request sent",
          error: "Could not request to join",
        },
      );
      void navigate({ to: "/" });
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
        <p className="text-[15px]">This join link is not valid.</p>
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
          {preview.joinLinkEnabled
            ? "You can request to join this organization."
            : "This organization is not accepting join links right now."}
        </p>
        <Button
          type="button"
          disabled={joinState.isLoading || !preview.joinLinkEnabled}
          onClick={() => void handleJoin()}
        >
          {joinState.isLoading ? "Sending..." : "Request to join"}
        </Button>
      </div>
    </div>
  );
}
