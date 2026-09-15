import { format, isSameDay, parseISO } from "date-fns";
import { useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  DEFAULT_MANAGER_PERMISSIONS,
  effectiveDayIso,
  type InboxPendingItem,
  type JiraIssue,
} from "@tudu/shared";
import { useGetReportInboxQuery, useGetTeamQuery } from "@tudu/store";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { JiraColumn } from "@/components/jira/JiraColumn";
import { JiraIssueDetail } from "@/components/jira/JiraIssueDetail";
import { SendJiraInboxDialog } from "@/components/jira/CreateJiraTaskControls";
import { PhoneJiraButton } from "@/components/jira/PhoneJiraButton";
import { InboxSkeleton } from "@/components/loading/InboxSkeleton";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { ReportPersonHeader } from "@/components/team/ReportPersonHeader";
import { SendInboxForm } from "@/components/team/SendInboxForm";
import { useJiraPreview } from "@/hooks/useJiraPreview";
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
  const jiraPreview = useJiraPreview();
  const [sendIssue, setSendIssue] = useState<JiraIssue | null>(null);
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
  const permissions = data?.permissions ?? DEFAULT_MANAGER_PERMISSIONS;
  const canSendInbox = permissions.canSendInbox;

  function goInbox(send: boolean) {
    if (send && !canSendInbox) {
      return;
    }
    void navigate({
      to: "/team/$userId/inbox",
      params: { userId },
      search: { send },
    });
  }

  if (isLoading && pending.length === 0 && !data?.report) {
    return <InboxSkeleton withJiraPane />;
  }

  if (isError) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-destructive">
        Could not load this inbox.
      </p>
    );
  }

  const sendForm = (
    canSendInbox ? (
      <SendInboxForm
        userId={userId}
        reportName={report.name}
        autoFocus={search.send === true}
        onSent={() => goInbox(false)}
      />
    ) : (
      <div className="flex h-full flex-col bg-background px-[24px] py-[20px] text-[13px] text-muted-foreground">
        You cannot send tasks to this report.
      </div>
    )
  );

  const jiraColumn = (
    <JiraColumn
      selectedTask={null}
      selectedDate={effectiveDayIso()}
      selectedIssueKey={jiraPreview.previewIssueKey}
      onPreviewIssue={jiraPreview.setPreviewIssueKey}
      onCreateTask={setSendIssue}
      reportUserId={userId}
      reportName={report.name}
      reportPermissions={permissions}
    />
  );

  const inspector = jiraPreview.previewIssueKey ? (
    <JiraIssueDetail
      issueIdOrKey={jiraPreview.previewIssueKey}
      selectedTask={null}
      selectedDate={effectiveDayIso()}
      reportUserId={userId}
      reportName={report.name}
      reportPermissions={permissions}
      backLabel={band === "phone" ? "Back" : "Close preview"}
      onBack={jiraPreview.clearPreview}
      onCreateTask={setSendIssue}
    />
  ) : (
    sendForm
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReportPersonHeader
        userId={userId}
        name={report.name}
        view="inbox"
        canSend={canSendInbox}
        onSend={() => {
          jiraPreview.clearPreview();
          goInbox(true);
        }}
      />
      <div
        className={cn(
          "grid min-h-0 flex-1",
          band === "phone"
            ? "grid-cols-1"
            : "grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(280px,396px)]",
        )}
      >
        <div className="min-h-0 overflow-y-auto border-r border-hair bg-card">
          {band === "phone" ? (
            <PhoneJiraButton onClick={jiraPreview.openJiraSheet} />
          ) : null}
          {pending.length === 0 ? (
            <p className="px-[16px] py-[48px] text-[14px] text-muted-foreground md:px-[32px]">
              Nothing waiting
            </p>
          ) : (
            pending.map((item) => <WaitingCard key={item.id} item={item} />)
          )}
        </div>
        {band === "phone" ? null : (
          <div className="min-h-0 border-r border-hair">
            {jiraColumn}
          </div>
        )}
        {band === "phone" ? (
          jiraPreview.jiraSheetOpen ? (
            <InspectorSheet
              open
              title="Jira"
              onClose={jiraPreview.closeJiraSheet}
            >
              {jiraPreview.previewIssueKey ? inspector : jiraColumn}
            </InspectorSheet>
          ) : (
            <InspectorSheet
              open={search.send === true}
              title="Send a task"
              onClose={() => goInbox(false)}
            >
              {sendForm}
            </InspectorSheet>
          )
        ) : (
          <div className="min-h-0">{inspector}</div>
        )}
      </div>
      <SendJiraInboxDialog
        issue={sendIssue}
        reportUserId={userId}
        reportName={report.name}
        onOpenChange={(open) => {
          if (!open) {
            setSendIssue(null);
          }
        }}
        onSent={() => setSendIssue(null)}
      />
    </div>
  );
}
