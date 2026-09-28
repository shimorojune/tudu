import { useEffect, useMemo, useState } from "react";
import {
  PERSONAL_REQUESTS_SPACE,
  effectiveDayIso,
  proposalFields,
  type TaskRequestView,
} from "@tudu/shared";
import {
  useGetRequestsQuery,
  useGetTasksForDayQuery,
  useRequestAcceptMutation,
  useRequestDeclineMutation,
  useRequestReturnedDiscardMutation,
  useRequestReturnedTakeMutation,
  useRequestWithdrawMutation,
} from "@tudu/store";
import { useSelector } from "react-redux";
import { selectVisible } from "@tudu/store";
import { RequestAcceptControls } from "@/components/requests/RequestAcceptControls";
import { Button } from "@/components/ui/button";
import { openNowCount } from "@/lib/nowCount";
import { notifyAction, mutationResult } from "@/lib/notifyAction";
import { requestShortcutAction } from "@/lib/requestShortcuts";
import { useActiveOrgSlug } from "@/hooks/useSpaceContext";
import { useListSpacesQuery } from "@tudu/store";

export function RequestsRoute() {
  const orgSlug = useActiveOrgSlug();
  const { data: spacesData } = useListSpacesQuery();
  const space = useMemo(() => {
    if (!orgSlug) {
      return PERSONAL_REQUESTS_SPACE;
    }
    const match = spacesData?.spaces.find(
      (row) => row.kind === "org" && row.slug === orgSlug,
    );
    return match?.orgId ?? PERSONAL_REQUESTS_SPACE;
  }, [orgSlug, spacesData?.spaces]);

  const { data, isLoading } = useGetRequestsQuery(space);
  const replica = useSelector(selectVisible);
  const viewerId = replica.viewerId;
  const today = effectiveDayIso();
  const dayQuery = useGetTasksForDayQuery(today);
  const openNow = openNowCount(dayQuery.data?.tasks ?? []);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const [accept] = useRequestAcceptMutation();
  const [decline] = useRequestDeclineMutation();
  const [withdraw] = useRequestWithdrawMutation();
  const [take] = useRequestReturnedTakeMutation();
  const [discard] = useRequestReturnedDiscardMutation();

  const focused =
    data?.incoming.find((row) => row.id === focusId) ??
    data?.sent.find((row) => row.id === focusId) ??
    null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!focused || focused.kind !== "new_task" || focused.status !== "pending") {
        return;
      }
      const action = requestShortcutAction(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      if (action.type === "decline") {
        setDecliningId(focused.id);
        return;
      }
      void notifyAction(
        () =>
          mutationResult(
            accept({
              requestId: focused.id,
              bucket: action.bucket,
            }),
          ),
        { success: "Accepted", error: "Could not accept" },
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [accept, focused]);

  async function sendDecline(requestId: string) {
    const trimmed = declineReason.trim();
    await notifyAction(
      () =>
        mutationResult(
          decline({
            requestId,
            reason: trimmed || null,
          }),
        ),
      { success: "Declined", error: "Could not decline" },
    );
    setDecliningId(null);
    setDeclineReason("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-rule px-[22px] py-[18px]">
        <h1 className="text-[18px] font-bold tracking-[-0.02em]">Requests</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Nothing here is in your day yet
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-[22px] py-[18px] text-[13px] text-muted-foreground">
            Loading…
          </p>
        ) : null}
        <Section title="Incoming" empty={data?.incoming.length === 0}>
          {data?.incoming.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              viewerId={viewerId}
              aggregate={space === PERSONAL_REQUESTS_SPACE}
              focused={focusId === row.id}
              onFocus={() => setFocusId(row.id)}
              declining={decliningId === row.id}
              declineReason={declineReason}
              onDeclineReasonChange={setDeclineReason}
              onDecline={() => void sendDecline(row.id)}
              onToggleDecline={(open) => setDecliningId(open ? row.id : null)}
              openNow={openNow}
              today={today}
              onAccept={(bucket) =>
                void notifyAction(
                  () =>
                    mutationResult(
                      accept({
                        requestId: row.id,
                        bucket,
                      }),
                    ),
                  { success: "Accepted", error: "Could not accept" },
                )
              }
            />
          ))}
        </Section>
        <Section title="Sent" empty={data?.sent.length === 0}>
          {data?.sent.map((row) => (
            <article
              key={row.id}
              className="border-b border-hair px-[32px] py-[20px]"
            >
              <p className="text-[12.5px] text-muted-foreground">
                Waiting on {row.to.name ?? row.to.email}
              </p>
              <h2 className="mt-2 text-[16px] font-bold">{row.task.title}</h2>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() =>
                  void notifyAction(
                    () => mutationResult(withdraw(row.id)),
                    { success: "Withdrawn", error: "Could not withdraw" },
                  )
                }
              >
                Withdraw
              </Button>
            </article>
          ))}
        </Section>
        <Section title="Recent outcomes" empty={data?.recent.length === 0}>
          {data?.recent.map((row) => (
            <article
              key={row.id}
              className="border-b border-hair px-[32px] py-[20px]"
            >
              <p className="text-[12px] uppercase tracking-[0.12em] text-faint">
                {row.status}
              </p>
              <h2 className="mt-1 text-[15px] font-bold">{row.task.title}</h2>
            </article>
          ))}
        </Section>
        {data?.returned.length ? (
          <Section title="Returned to you" empty={false}>
            {data.returned.map((row) => (
              <article
                key={row.id}
                className="border-b border-hair px-[32px] py-[20px]"
              >
                <p className="text-[12.5px] text-muted-foreground">
                  {row.declineReason ?? "Declined"}
                </p>
                <h2 className="mt-2 text-[16px] font-bold">{row.task.title}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void notifyAction(
                        () =>
                          mutationResult(
                            take({ requestId: row.id, bucket: "next" }),
                          ),
                        { success: "Added to your day", error: "Could not take" },
                      )
                    }
                  >
                    Take it myself
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void notifyAction(
                        () => mutationResult(discard(row.id)),
                        { success: "Discarded", error: "Could not discard" },
                      )
                    }
                  >
                    Discard
                  </Button>
                </div>
              </article>
            ))}
          </Section>
        ) : null}
        {orgSlug ? (
          <p className="px-[32px] py-[16px] text-[12px] text-faint">
            Requests are per space.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="px-[32px] pb-2 pt-6 text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">
        {title}
      </h2>
      {empty ? (
        <p className="px-[32px] pb-4 text-[13px] text-muted-foreground">None</p>
      ) : (
        children
      )}
    </section>
  );
}

function RequestCard({
  row,
  viewerId,
  aggregate,
  focused,
  onFocus,
  declining,
  declineReason,
  onDeclineReasonChange,
  onDecline,
  onToggleDecline,
  openNow,
  today,
  onAccept,
}: {
  row: TaskRequestView;
  viewerId: string | null;
  aggregate: boolean;
  focused: boolean;
  onFocus: () => void;
  declining: boolean;
  declineReason: string;
  onDeclineReasonChange: (value: string) => void;
  onDecline: () => void;
  onToggleDecline: (open: boolean) => void;
  openNow: number;
  today: string;
  onAccept: (bucket: import("@tudu/shared").Bucket) => void;
}) {
  const isNew = row.kind === "new_task";
  const isEdit = row.kind === "edit";
  const fields = proposalFields(row.proposal);

  return (
    <article
      className={`border-b border-hair px-[32px] py-[24px] ${focused ? "bg-foreground/[0.03]" : ""}`}
      onClick={onFocus}
    >
      {aggregate ? (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {row.orgName}
        </p>
      ) : null}
      <p className="text-[12.5px] text-muted-foreground">
        {row.from.name ?? row.from.email} · co-worker
      </p>
      <h2 className="mt-2 text-[17px] font-bold leading-[1.35]">{row.task.title}</h2>
      {row.message ? (
        <p className="mt-2 border-l-2 border-hair pl-3 text-[13px] text-muted-foreground">
          {row.message}
        </p>
      ) : null}
      {isNew && row.to.id === viewerId ? (
        declining ? (
          <div className="mt-4 flex flex-col gap-2 border border-rule p-3">
            <textarea
              className="min-h-[72px] w-full resize-none bg-transparent text-[13px]"
              value={declineReason}
              maxLength={500}
              onChange={(event) => onDeclineReasonChange(event.target.value)}
              placeholder="Reason (optional)"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={onDecline}>
                Send decline
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onToggleDecline(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <RequestAcceptControls
              openNowCountOnToday={openNow}
              today={today}
              onAccept={onAccept}
              onDecline={() => onToggleDecline(true)}
            />
          </div>
        )
      ) : null}
      {isEdit && row.to.id === viewerId ? (
        <div className="mt-4 flex flex-col gap-2">
          {fields.map((field) => (
            <label key={field} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" defaultChecked />
              <span>{field}</span>
            </label>
          ))}
          <Button
            type="button"
            size="sm"
            className="mt-2 w-fit"
            onClick={(event) => {
              event.stopPropagation();
              onAccept("next");
            }}
          >
            Accept all
          </Button>
        </div>
      ) : null}
    </article>
  );
}
