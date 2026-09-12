import { format, isSameDay, parseISO } from "date-fns";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { InboxPendingItem } from "@tudu/shared";
import { useGetReportInboxQuery, useGetTeamQuery } from "@tudu/store";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { InboxSkeleton } from "@/components/loading/InboxSkeleton";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { ReportPersonHeader } from "@/components/team/ReportPersonHeader";
import { SendInboxForm } from "@/components/team/SendInboxForm";
import { useViewportBand } from "@/hooks/useViewportBand";
import { personFirstName, personInitials } from "@/lib/person";
import { cn } from "@/lib/utils";

function sentLabel(createdAt: string) {
  const date = parseISO(createdAt);
  const now = new Date();
  const time = format(date, "HH:mm");

  if (isSameDay(date, now)) {
    return `sent this ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `sent this yesterday ${time}`;
  }

  return `sent this ${format(date, "d MMM")} ${time}`;
}

function WaitingCard({ item }: { item: InboxPendingItem }) {
  const first = personFirstName(item.from.name);

  return (
    <article className="flex flex-col gap-[14px] border-b border-hair px-[16px] py-[24px] md:px-[32px]">
      <div className="flex items-center gap-[10px]">
        <div className="flex size-[24px] shrink-0 items-center justify-center bg-foreground text-[11px] font-extrabold text-card">
          {personInitials(item.from.name)}
        </div>
        <span className="text-[12.5px] text-muted-foreground">
          <span className="font-bold text-foreground">{first}</span>{" "}
          {sentLabel(item.createdAt)}
        </span>
      </div>

      <div className="flex flex-col gap-[9px]">
        <h2 className="text-[17px] font-bold leading-[1.35] tracking-[-0.01em]">
          {item.task.title}
        </h2>
        {item.task.project ? <ProjectChip project={item.task.project} /> : null}
        {item.task.startDate || item.task.deadline ? (
          <p className="text-[12.5px] tabular-nums text-muted-foreground">
            {item.task.startDate
              ? `start ${format(new Date(`${item.task.startDate}T12:00:00`), "EEE d MMM")}`
              : null}
            {item.task.startDate && item.task.deadline ? " · " : null}
            {item.task.deadline
              ? `deadline ${format(parseISO(item.task.deadline), "EEE d MMM")}`
              : null}
          </p>
        ) : null}
        {item.task.description ? (
          <p className="border-l-2 border-hair pl-[12px] text-[13.5px] leading-[1.55] text-muted-foreground">
            {item.task.description}
          </p>
        ) : null}
        <p className="text-[12.5px] text-muted-foreground">
          waiting for them to accept
        </p>
      </div>
    </article>
  );
}

export function ReportInboxRoute() {
  const { userId } = useParams({ strict: false }) as { userId: string };
  const search = useSearch({ strict: false }) as { send?: boolean };
  const navigate = useNavigate();
  const band = useViewportBand();
  const { data, isLoading, isError } = useGetReportInboxQuery(userId);
  const { data: team } = useGetTeamQuery();
  const pending = data?.pending ?? [];
  const report =
    data?.report ??
    team?.reports.find((row) => row.user.id === userId)?.user ?? {
      id: userId,
      name: "",
      email: "",
    };

  function goInbox(send: boolean) {
    void navigate({
      to: "/team/$userId/inbox",
      params: { userId },
      search: { send },
    });
  }

  if (isLoading && pending.length === 0 && !data?.report) {
    return <InboxSkeleton />;
  }

  if (isError) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-destructive">
        Could not load this inbox.
      </p>
    );
  }

  const sendForm = (
    <SendInboxForm
      userId={userId}
      reportName={report.name}
      autoFocus={search.send === true}
      onSent={() => goInbox(false)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReportPersonHeader
        userId={userId}
        name={report.name}
        view="inbox"
        onSend={() => goInbox(true)}
      />
      <div
        className={cn(
          "grid min-h-0 flex-1",
          band === "phone"
            ? "grid-cols-1"
            : "grid-cols-[minmax(0,1fr)_minmax(280px,396px)]",
        )}
      >
        <div className="min-h-0 overflow-y-auto border-r border-hair bg-card">
          {pending.length === 0 ? (
            <p className="px-[16px] py-[48px] text-[14px] text-muted-foreground md:px-[32px]">
              Nothing waiting
            </p>
          ) : (
            pending.map((item) => <WaitingCard key={item.id} item={item} />)
          )}
        </div>
        {band === "phone" ? (
          <InspectorSheet
            open={search.send === true}
            title="Send a task"
            onClose={() => goInbox(false)}
          >
            {sendForm}
          </InspectorSheet>
        ) : (
          <div className="min-h-0">{sendForm}</div>
        )}
      </div>
    </div>
  );
}
