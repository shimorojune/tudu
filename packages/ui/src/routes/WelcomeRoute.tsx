import { Link, useNavigate } from "@tanstack/react-router";
import {
  useCompleteOnboardingMutation,
  useGetUnscheduledTasksQuery,
  useGetTasksForDayQuery,
  useListMyInvitesQuery,
  useListSpacesQuery,
  todayIso,
} from "@tudu/store";
import { CreateOrgDialog } from "@/components/orgs/CreateOrgDialog";
import { JoinWithLinkDialog } from "@/components/orgs/JoinWithLinkDialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function WelcomeRoute() {
  const navigate = useNavigate();
  const { data: spaces } = useListSpacesQuery();
  const { data: invites } = useListMyInvitesQuery();
  const dayQuery = useGetTasksForDayQuery(todayIso());
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const [completeOnboarding, { isLoading }] = useCompleteOnboardingMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const taskCount =
    (dayQuery.data?.tasks.length ?? 0) +
    (unscheduledQuery.data?.tasks.length ?? 0);
  const pendingInvites = invites?.invites?.length ?? 0;

  async function finish(toJira: boolean) {
    await completeOnboarding().unwrap();
    if (toJira) {
      navigate({ to: "/settings", search: { section: "jira" } });
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-card px-6 py-10">
      <div className="flex w-full max-w-[460px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Step 2 of 3
          </span>
          <h1 className="text-[23px] font-bold tracking-[-0.025em]">
            You&apos;re in Personal
          </h1>
          <p className="text-[13.5px] leading-[1.55] text-muted-foreground">
            Your own space, nobody else in it. Everything you add lives here
            unless you move it. This is a complete way to use Tudu.
          </p>
        </div>

        <div className="flex items-center gap-3 border border-rule bg-background px-[14px] py-[13px]">
          <span className="size-[14px] border-[1.5px] border-rule bg-card" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">Personal</div>
            <div className="text-[12px] text-muted-foreground">
              Ready now · {taskCount} task{taskCount === 1 ? "" : "s"}
            </div>
          </div>
          <span className="text-[12px] text-faint">Always yours</span>
        </div>

        <div className="flex flex-col gap-[11px] border-t border-hair pt-5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Work with other people?
          </span>
          <button
            type="button"
            className="flex items-center gap-[11px] border border-rule px-[13px] py-[11px] text-left"
            onClick={() => setCreateOpen(true)}
          >
            <span className="text-[13.5px] font-semibold">
              Create an organization
            </span>
            <span className="ml-auto text-[12px] text-muted-foreground">
              You&apos;d own it
            </span>
          </button>
          <button
            type="button"
            className="flex items-center gap-[11px] border border-rule px-[13px] py-[11px] text-left"
            onClick={() => setJoinOpen(true)}
          >
            <span className="text-[13.5px] font-semibold">
              Join with a link or invite
            </span>
            <span className="ml-auto text-[12px] text-muted-foreground">
              {pendingInvites > 0
                ? `${pendingInvites} invite${pendingInvites === 1 ? "" : "s"} waiting`
                : "No invites yet"}
            </span>
          </button>
          <p className="text-[12px] leading-[1.6] text-faint">
            A task made in Personal can be moved into an organization later. One
            made in an organization stays there.
          </p>
        </div>

        <div className="flex items-center gap-[14px]">
          <Button
            type="button"
            disabled={isLoading}
            onClick={() => void finish(true)}
          >
            Continue to JIRA
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isLoading}
            onClick={() => void finish(false)}
          >
            Skip for now
          </Button>
        </div>

        {spaces?.spaces.some((space) => space.kind === "org") ? (
          <Button type="button" variant="outline" asChild>
            <Link to="/">Go to Today</Link>
          </Button>
        ) : null}
      </div>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinWithLinkDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
