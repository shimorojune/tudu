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
import { personFirstName, personInitials } from "@/lib/person";
import { cn } from "@/lib/utils";

function Avatar({ name, filled }: { name: string; filled?: boolean }) {
  return (
    <div
      className={cn(
        "flex size-[32px] shrink-0 items-center justify-center text-[12.5px] font-extrabold",
        filled
          ? "bg-foreground text-card"
          : "border-[1.5px] border-rule text-foreground",
      )}
    >
      {personInitials(name)}
    </div>
  );
}

export function TeamRoute() {
  const navigate = useNavigate();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const date = selectedDate || todayIso();
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
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-center justify-end gap-[12px] border-b border-rule px-[32px] py-[14px]">
        {adding ? (
          <form className="flex items-center gap-[8px]" onSubmit={(event) => void submitInvite(event)}>
            <input
              type="email"
              required
              value={email}
              placeholder="name@company.com"
              className="w-[240px] border border-rule bg-card px-[11px] py-[7px] text-[13px] outline-none"
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              type="submit"
              disabled={createState.isLoading}
              className="bg-foreground px-[14px] py-[7px] text-[12px] font-bold text-card disabled:opacity-40"
            >
              Send invite
            </button>
            <button
              type="button"
              className="text-[12.5px] text-muted-foreground"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
            >
              Cancel
            </button>
          </form>
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
      {addError ? (
        <p className="border-b border-hair px-[32px] py-[10px] text-[12.5px] text-destructive">
          {addError}
        </p>
      ) : null}

      {incoming.length > 0 ? (
        <div className="border-b border-hair px-[32px] py-[16px]">
          <div className="mb-[10px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
            Incoming invites
          </div>
          <div className="flex flex-col gap-[10px]">
            {incoming.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-[14px]"
              >
                <Avatar name={invite.inviter.name} />
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

      <div className="grid grid-cols-[minmax(0,1fr)_84px_84px_112px_214px] gap-x-[16px] border-b border-rule px-[32px] py-[14px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
        <span>Reports to me</span>
        <span className="text-right">Now</span>
        <span className="text-right">Open</span>
        <span className="text-right">Slipping</span>
        <span />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {reports.length === 0 && outgoing.length === 0 ? (
          <p className="px-[32px] py-[28px] text-[14px] text-muted-foreground">
            Add someone by email. They confirm before anything is shared.
          </p>
        ) : null}

        {reports.map((row, index) => (
          <div
            key={row.user.id}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_84px_84px_112px_214px] items-center gap-x-[16px] border-b border-hair px-[32px] py-[18px]",
              index === 0 && "bg-foreground/[0.03]",
            )}
          >
            <div className="flex min-w-0 items-center gap-[14px]">
              <Avatar name={row.user.name} filled={index === 0} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{row.user.name}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {row.nowTitle ? `now: ${row.nowTitle}` : "nothing in Now"}
                </div>
              </div>
            </div>
            <span className="text-right text-[14px] tabular-nums">{row.nowCount}</span>
            <span className="text-right text-[14px] tabular-nums">{row.openCount}</span>
            <span
              className={cn(
                "text-right text-[14px] tabular-nums",
                row.slippingCount > 0
                  ? "font-bold text-primary"
                  : "text-faint",
              )}
            >
              {row.slippingCount}
            </span>
            <div className="flex justify-end gap-[8px]">
              <Link
                to="/team/$userId"
                params={{ userId: row.user.id }}
                search={{ send: false }}
                className="border border-rule px-[14px] py-[7px] text-[12px] whitespace-nowrap"
              >
                Open day
              </Link>
              <button
                type="button"
                className={cn(
                  "px-[14px] py-[7px] text-[12px] font-bold whitespace-nowrap",
                  index === 0
                    ? "bg-foreground text-card"
                    : "border border-rule",
                )}
                onClick={() =>
                  void navigate({
                    to: "/team/$userId",
                    params: { userId: row.user.id },
                    search: { send: true },
                  })
                }
              >
                Add task
              </button>
            </div>
          </div>
        ))}

        {outgoing.map((invite) => (
          <div
            key={invite.id}
            className="grid grid-cols-[minmax(0,1fr)_84px_84px_112px_214px] items-center gap-x-[16px] border-b border-hair px-[32px] py-[18px]"
          >
            <div className="flex min-w-0 items-center gap-[14px]">
              <Avatar name={invite.email} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{invite.email}</div>
                <div className="text-[12px] text-muted-foreground">
                  Invite sent. Waiting for them to confirm.
                </div>
              </div>
            </div>
            <span className="text-right text-[14px] tabular-nums text-faint">-</span>
            <span className="text-right text-[14px] tabular-nums text-faint">-</span>
            <span className="text-right text-[14px] tabular-nums text-faint">-</span>
            <span />
          </div>
        ))}

        <div className="border-b border-rule px-[32px] pb-[14px] pt-[34px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
          I report to
        </div>
        {manager ? (
          <div className="grid grid-cols-[minmax(0,1fr)_310px] items-center gap-x-[16px] px-[32px] py-[18px]">
            <div className="flex min-w-0 items-center gap-[14px]">
              <Avatar name={manager.name} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{manager.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  {manager.email} · sees your day, minus private tasks
                </div>
              </div>
            </div>
            <p className="text-right text-[12px] leading-[1.45] text-muted-foreground">
              {personFirstName(manager.name)} can read, comment, reorder, delete, and
              send to Inbox. They cannot edit, complete, or see private tasks.
            </p>
          </div>
        ) : (
          <p className="px-[32px] py-[18px] text-[14px] text-muted-foreground">
            You do not report to anyone yet.
          </p>
        )}
      </div>

      <div className="mt-auto flex h-[34px] items-center border-t border-hair bg-background px-[32px] text-[11.5px] text-faint">
        Slipping = carried two days or more, or past deadline
      </div>
    </div>
  );
}
