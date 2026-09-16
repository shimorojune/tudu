import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import type { JiraIssue } from "@tudu/shared";
import {
  setSelectedTaskId,
  useGetReportDayQuery,
  todayIso,
  type RootState,
} from "@tudu/store";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { JiraColumn } from "@/components/jira/JiraColumn";
import { JiraIssueDetail } from "@/components/jira/JiraIssueDetail";
import { SendJiraInboxDialog } from "@/components/jira/CreateJiraTaskControls";
import { PhoneJiraButton } from "@/components/jira/PhoneJiraButton";
import { ReportDaySkeleton } from "@/components/loading/ReportDaySkeleton";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { TaskListHeader } from "@/components/tasks/TaskListHeader";
import { ReportPersonHeader } from "@/components/team/ReportPersonHeader";
import { SendInboxForm } from "@/components/team/SendInboxForm";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useJiraPreview } from "@/hooks/useJiraPreview";
import { useViewportBand } from "@/hooks/useViewportBand";
import { DAY_TASK_TAB_FIELDS } from "@/lib/daySearch";
export function ReportDayRoute() {
  const { userId } = useParams({ strict: false }) as { userId: string };
  const search = useSearch({ strict: false }) as { send?: boolean };
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const selectedTaskId = useSelector((state: RootState) => state.day.selectedTaskId);
  const date = selectedDate || todayIso();
  const { data, isLoading, isError } = useGetReportDayQuery({ userId, date });
  const showSend = search.send === true || selectedTaskId === null;
  const band = useViewportBand();
  const jiraPreview = useJiraPreview();
  const [sendIssue, setSendIssue] = useState<JiraIssue | null>(null);
  useDaySearchSync(DAY_TASK_TAB_FIELDS, {
    clearTask: search.send === true,
    taskFound: isLoading
      ? null
      : !selectedTaskId ||
        Boolean(data?.tasks.some((task) => task.id === selectedTaskId)),
  });

  useEffect(() => {
    if (search.send) {
      dispatch(setSelectedTaskId(null));
      jiraPreview.clearPreview();
    }
  }, [dispatch, jiraPreview.clearPreview, search.send]);

  if (isLoading) {
    return <ReportDaySkeleton isToday={date === todayIso()} />;
  }

  if (isError || !data) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-destructive">
        Could not load this day.
      </p>
    );
  }

  const tasks = data.tasks;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const canSendInbox = data.permissions.canSendInbox;

  const taskList = (
    <DayTaskList
      tasks={tasks}
      selectedDate={date}
      selectedTaskId={selectedTaskId}
      header={
        <TaskListHeader>
          {band === "phone" ? (
            <PhoneJiraButton onClick={jiraPreview.openJiraSheet} />
          ) : null}
        </TaskListHeader>
      }
      onSelectTask={(id) => {
        jiraPreview.clearPreview();
        void navigate({
          to: "/team/$userId",
          params: { userId },
          search: (prev: Record<string, unknown>) => ({ ...prev, send: false }),
        } as never);
        dispatch(setSelectedTaskId(id));
      }}
      onDeselectTask={() => dispatch(setSelectedTaskId(null))}
      viewer="manager"
      reportUserId={userId}
      reportPermissions={data.permissions}
    />
  );

  const sidePanel =
    showSend && !selectedTask && canSendInbox && !jiraPreview.previewIssueKey ? (
      <SendInboxForm
        userId={userId}
        reportName={data.report.name}
        autoFocus={search.send === true}
        onSent={() =>
          void navigate({
            to: "/team/$userId",
            params: { userId },
            search: (prev: Record<string, unknown>) => ({ ...prev, send: false }),
          } as never)
        }
      />
    ) : (
      <DetailInspector
        task={selectedTask}
        selectedDate={date}
        viewer="manager"
        reportUserId={userId}
        reportPermissions={data.permissions}
      />
    );

  const inspector = jiraPreview.previewIssueKey ? (
    <JiraIssueDetail
      issueIdOrKey={jiraPreview.previewIssueKey}
      selectedTask={selectedTask}
      selectedDate={date}
      reportUserId={userId}
      reportName={data.report.name}
      reportPermissions={data.permissions}
      backLabel={band === "phone" ? "Back" : "Close preview"}
      onBack={jiraPreview.clearPreview}
      onCreateTask={setSendIssue}
    />
  ) : (
    sidePanel
  );

  const jiraColumn = (
    <JiraColumn
      selectedTask={selectedTask}
      selectedDate={date}
      selectedIssueKey={jiraPreview.previewIssueKey}
      onPreviewIssue={jiraPreview.setPreviewIssueKey}
      onCreateTask={setSendIssue}
      reportUserId={userId}
      reportName={data.report.name}
      reportPermissions={data.permissions}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReportPersonHeader
        userId={userId}
        name={data.report.name}
        view="day"
        canSend={canSendInbox}
        onSend={() => {
          if (!canSendInbox) {
            return;
          }
          dispatch(setSelectedTaskId(null));
          jiraPreview.clearPreview();
          void navigate({
            to: "/team/$userId/inbox",
            params: { userId },
            search: { send: true },
          });
        }}
      />

      {data.slippingCount > 0 ? (
        <div className="flex items-center gap-[10px] border-b border-hair bg-foreground/[0.03] px-[16px] py-[14px] text-[12.5px] text-muted-foreground md:px-[30px]">
          {data.slippingCount} {data.slippingCount === 1 ? "task is" : "tasks are"} slipping,
          carried two days or more
          <span className="ml-auto text-[11.5px]">
            Private tasks are hidden from this view
          </span>
        </div>
      ) : null}

      {band === "phone" ? (
        <>
          <div className="min-h-0 flex-1 border-hair bg-card">
            {taskList}
          </div>
          {jiraPreview.jiraSheetOpen ? (
            <InspectorSheet
              open
              title="Jira"
              onClose={jiraPreview.closeJiraSheet}
            >
              {jiraPreview.previewIssueKey ? inspector : jiraColumn}
            </InspectorSheet>
          ) : (
            <InspectorSheet
              open={selectedTask !== null || search.send === true}
              title={search.send && !selectedTask ? "Send a task" : "Task details"}
              onClose={() => {
                dispatch(setSelectedTaskId(null));
                void navigate({
                  to: "/team/$userId",
                  params: { userId },
                  search: (prev: Record<string, unknown>) => ({
                    ...prev,
                    send: false,
                  }),
                } as never);
              }}
            >
              {sidePanel}
            </InspectorSheet>
          )}
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(280px,396px)]">
          <div className="min-h-0 border-r border-hair bg-card">
            {taskList}
          </div>
          <div className="min-h-0 border-r border-hair">
            {jiraColumn}
          </div>
          <div className="min-h-0">{inspector}</div>
        </div>
      )}
      <SendJiraInboxDialog
        issue={sendIssue}
        reportUserId={userId}
        reportName={data.report.name}
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
