import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSelector } from "react-redux";
import {
  useAcceptTeamInviteMutation,
  useCreateTeamInviteMutation,
  useDeclineTeamInviteMutation,
  useGetTeamQuery,
  todayIso,
  type RootState,
} from "@tudu/store";
import { TeamFirstRun } from "@/components/team/TeamFirstRun";
import { TeamInviteForm } from "@/components/team/TeamInviteForm";
import { TeamManagerPane } from "@/components/team/TeamManagerPane";
import { TeamPersonRow } from "@/components/team/TeamPersonRow";
import { TeamAvatar } from "@/components/team/TeamAvatar";
import { TeamSkeleton } from "@/components/loading/TeamSkeleton";
import { useViewportBand } from "@/hooks/useViewportBand";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { DATE_ONLY_FIELDS, dateLinkSearch } from "@/lib/daySearch";
import { defaultWeekId } from "@/lib/week";
import { cn } from "@/lib/utils";

export function TeamRoute() {
  const navigate = useNavigate();
  const band = useViewportBand();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const date = selectedDate || todayIso();
  useDaySearchSync(DATE_ONLY_FIELDS);
  const { data, isLoading, isError } = useGetTeamQuery(date);
  const [createInvite, createState] = useCreateTeamInviteMutation();
  const [acceptInvite] = useAcceptTeamInviteMutation();
  const [declineInvite] = useDeclineTeamInviteMutation();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    setAddError(null);
    try {
      await createInvite({ email }).unwrap();
      setEmail("");
      setAdding(false);
    } catch (error) {
      const message =
        error && typeof error === "object" && "data" in error
          ? String((error as { data?: { error?: string } }).data?.error ?? "Could not send invite")
          : "Could not send invite";
      setAddError(message);
    }
  }

  if (isLoading) {
    return <TeamSkeleton />;
  }

  if (isError || !data) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-destructive">
        Could not load Team.
      </p>
    );
  }

  const reports = data.reports;
  const incoming = data.incomingInvites;
  const outgoing = data.outgoingInvites;
  const manager = data.manager;
  const isEmptyReports = reports.length === 0 && outgoing.length === 0;
  const managerPane = <TeamManagerPane manager={manager} />;

  return (
    <div
      className={cn(
        "grid h-full min-h-0",
        band === "phone" ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_356px]",
      )}
    >
      <div className="flex min-h-0 flex-col overflow-y-auto border-r border-hair bg-card">
        {incoming.length > 0 ? (
          <div className="border-b border-hair px-[16px] py-[16px] md:px-[32px]">
            <div className="mb-[10px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
              Incoming invites
            </div>
            <div className="flex flex-col gap-[10px]">
              {incoming.map((invite) => (
                <div key={invite.id} className="flex items-center gap-[14px]">
                  <TeamAvatar name={invite.inviter.name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold">
                      {invite.inviter.name}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      wants to be your manager
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bg-foreground px-[14px] py-[7px] text-[12px] font-bold text-card"
                    onClick={() => void acceptInvite(invite.id)}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="border border-rule px-[14px] py-[7px] text-[12px]"
                    onClick={() => void declineInvite(invite.id)}
                  >
                    Decline
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isEmptyReports ? (
          <TeamFirstRun
            email={email}
            error={addError}
            sending={createState.isLoading}
            onEmailChange={setEmail}
            onSubmit={(event) => void submitInvite(event)}
          />
        ) : (
          <>
            <div className="flex items-center justify-end gap-[12px] border-b border-rule px-[16px] py-[14px] md:px-[32px]">
              {adding ? (
                <TeamInviteForm
                  email={email}
                  error={addError}
                  sending={createState.isLoading}
                  onEmailChange={setEmail}
                  onSubmit={(event) => void submitInvite(event)}
                  onCancel={() => {
                    setAdding(false);
                    setAddError(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="border border-rule px-[12px] py-[7px] text-[12.5px]"
                  onClick={() => setAdding(true)}
                >
                  Add someone
                </button>
              )}
            </div>

            {reports.map((row, index) => (
              <TeamPersonRow
                key={row.user.id}
                name={row.user.name}
                subtitle={row.nowTitle ? `now: ${row.nowTitle}` : "nothing in Now"}
                filled={index === 0}
                showCounts
                nowCount={row.nowCount}
                openCount={row.openCount}
                slippingCount={row.slippingCount}
              >
                <Link
                  to="/team/$userId"
                  params={{ userId: row.user.id }}
                  search={dateLinkSearch(date, { send: false })}
                  className="border border-rule px-[14px] py-[7px] text-[12px] whitespace-nowrap"
                >
                  Open day
                </Link>
                <Link
                  to="/team/$userId/week"
                  params={{ userId: row.user.id }}
                  search={{ week: defaultWeekId() }}
                  className="border border-rule px-[14px] py-[7px] text-[12px] whitespace-nowrap"
                >
                  Open week
                </Link>
                <Link
                  to="/team/$userId/inbox"
                  params={{ userId: row.user.id }}
                  search={{ send: false }}
                  className="border border-rule px-[14px] py-[7px] text-[12px] whitespace-nowrap"
                >
                  Open inbox
                </Link>
                <button
                  type="button"
                  className={cn(
                    "px-[14px] py-[7px] text-[12px] font-bold whitespace-nowrap",
                    index === 0 ? "bg-foreground text-card" : "border border-rule",
                  )}
                  onClick={() =>
                    void navigate({
                      to: "/team/$userId/inbox",
                      params: { userId: row.user.id },
                      search: { send: true },
                    })
                  }
                >
                  Add task
                </button>
              </TeamPersonRow>
            ))}

            {outgoing.map((invite) => (
              <TeamPersonRow
                key={invite.id}
                name={invite.email}
                subtitle="Invite sent. Waiting for them to confirm."
              />
            ))}

            {reports.length > 0 ? (
              <div
                className={cn(
                  "flex h-[34px] items-center border-t border-hair bg-background px-[16px] text-[11.5px] text-faint md:px-[32px]",
                  band !== "phone" && "mt-auto",
                )}
              >
                Slipping = carried two days or more, or past deadline
              </div>
            ) : null}
          </>
        )}

        {band === "phone" ? (
          <div className="border-t border-rule">{managerPane}</div>
        ) : null}
      </div>
      {band === "phone" ? null : managerPane}
    </div>
  );
}
