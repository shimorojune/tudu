import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { effectiveDayIso, type Bucket, type JiraIssue } from "@tudu/shared";
import {
  setSelectedDate,
  setSelectedTaskId,
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useUploadTaskAttachmentMutation,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { TaskListHeader } from "@/components/tasks/TaskListHeader";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { patchTaskDescriptionIfAttachmentsChanged } from "@/lib/afterCreateTaskDescription";
import { createTaskBody } from "@/lib/createTask";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { SpawnJiraTaskDialog } from "@/components/jira/CreateJiraTaskControls";
import { JiraColumn } from "@/components/jira/JiraColumn";
import { JiraIssueDetail } from "@/components/jira/JiraIssueDetail";
import { LinkJiraPalette } from "@/components/jira/LinkJiraPalette";
import { PhoneJiraButton } from "@/components/jira/PhoneJiraButton";
import { MidnightBanner } from "@/components/today/MidnightBanner";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { DayListSkeleton } from "@/components/loading/DayListSkeleton";
import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { PaneSkeleton } from "@/components/loading/PaneSkeleton";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useJiraPreview } from "@/hooks/useJiraPreview";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { useRolloverOnFocus } from "@/hooks/useRolloverOnFocus";
import { useViewportBand } from "@/hooks/useViewportBand";
import { DAY_TASK_TAB_FIELDS } from "@/lib/daySearch";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);
  const jiraPreview = useJiraPreview();

  const dayQuery = useGetTasksForDayQuery(selectedDate);
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const tasks = dayQuery.data?.tasks ?? [];
  useDaySearchSync(DAY_TASK_TAB_FIELDS, {
    taskFound: dayQuery.isLoading
      ? null
      : !selectedTaskId || tasks.some((task) => task.id === selectedTaskId),
  });
  const [createTask] = useCreateTaskMutation();
  const [createSubtask] = useCreateSubtaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();

  const [firstRunDialogOpen, setFirstRunDialogOpen] = useState(false);
  const [firstRunBucket, setFirstRunBucket] = useState<Bucket>("later");
  const [spawnIssue, setSpawnIssue] = useState<JiraIssue | null>(null);

  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;
  const effectiveDay = effectiveDayIso();
  const nowCount = tasks.filter((task) => task.bucket === "now").length;

  const isFirstRun =
    !dayQuery.isLoading &&
    !unscheduledQuery.isLoading &&
    tasks.length === 0 &&
    unscheduledCount === 0 &&
    selectedDate === effectiveDay;

  const { maybeRollover } = useRolloverOnFocus(!isFirstRun);
  const band = useViewportBand();

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ?? null;

  function openFirstRunDialog(bucket: Bucket = "later") {
    setFirstRunBucket(bucket);
    setFirstRunDialogOpen(true);
  }

  function selectTask(id: string) {
    jiraPreview.clearPreview();
    dispatch(setSelectedTaskId(id));
  }

  const spawnDialog = (
    <SpawnJiraTaskDialog
      issue={spawnIssue}
      selectedDate={selectedDate}
      nowCount={nowCount}
      onOpenChange={(open) => {
        if (!open) {
          setSpawnIssue(null);
        }
      }}
      onCreated={(task) => {
        setSpawnIssue(null);
        jiraPreview.handleCreatedTask(task, {
          selectedDate,
          onSelectDate: (date) => dispatch(setSelectedDate(date)),
          onSelectTask: selectTask,
        });
      }}
    />
  );

  const jiraColumn = (
    <JiraColumn
      selectedTask={selectedTask}
      selectedDate={selectedDate}
      selectedIssueKey={jiraPreview.previewIssueKey}
      onPreviewIssue={jiraPreview.setPreviewIssueKey}
      onCreateTask={setSpawnIssue}
    />
  );

  const inspector = jiraPreview.previewIssueKey ? (
    <JiraIssueDetail
      issueIdOrKey={jiraPreview.previewIssueKey}
      selectedTask={selectedTask}
      selectedDate={selectedDate}
      backLabel={band === "phone" ? "Back" : "Close preview"}
      onBack={jiraPreview.clearPreview}
      onCreateTask={setSpawnIssue}
      onCreatedTask={(task) =>
        jiraPreview.handleCreatedTask(task, {
          selectedDate,
          onSelectDate: (date) => dispatch(setSelectedDate(date)),
          onSelectTask: selectTask,
        })
      }
    />
  ) : (
    <DetailInspector task={selectedTask} selectedDate={selectedDate} />
  );

  useNewTaskShortcut(() => openFirstRunDialog("later"), { enabled: isFirstRun });

  if (dayQuery.isLoading) {
    return (
      <LoadingStatus>
        <TodayPanelLayout
          taskList={
            <DayListSkeleton
              announce={false}
              isToday={selectedDate === effectiveDay}
            />
          }
          jiraColumn={<PaneSkeleton announce={false} />}
          inspector={<PaneSkeleton announce={false} />}
        />
      </LoadingStatus>
    );
  }

  if (dayQuery.isError) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-destructive">
        Could not load tasks for this day.
      </p>
    );
  }

  if (isFirstRun) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TodayPanelLayout
          taskList={
            <>
              {band === "phone" ? (
                <PhoneJiraButton onClick={jiraPreview.openJiraSheet} />
              ) : null}
              <TodayFirstRun
                onAddFirst={() => openFirstRunDialog("later")}
              />
            </>
          }
          jiraColumn={jiraColumn}
          inspector={inspector}
        />
        {band === "phone" ? (
          <InspectorSheet
            open={jiraPreview.jiraSheetOpen}
            title="Jira"
            onClose={jiraPreview.closeJiraSheet}
          >
            {jiraPreview.previewIssueKey ? inspector : jiraColumn}
          </InspectorSheet>
        ) : null}
        <NewTaskDialog
          open={firstRunDialogOpen}
          initialBucket={firstRunBucket}
          initialDate={selectedDate}
          nowCount={0}
          onOpenChange={setFirstRunDialogOpen}
          onSubmit={async (args) => {
            const result = await createTask(
              createTaskBody({
                title: args.title,
                description: args.description,
                scheduledDate: args.scheduledDate,
                bucket: args.scheduledDate === null ? null : args.bucket,
                projectId: args.projectId,
              }),
            ).unwrap();

            await patchTaskDescriptionIfAttachmentsChanged(
              result.task.id,
              args.description,
              args.pendingAttachments,
              (input) => uploadTaskAttachment(input).unwrap(),
              (description) =>
                updateTask({ id: result.task.id, patch: { description } }).unwrap(),
            );

            for (const subtaskTitle of args.subtaskTitles) {
              await createSubtask({
                taskId: result.task.id,
                body: { title: subtaskTitle },
              }).unwrap();
            }

            selectTask(result.task.id);
          }}
        />
        {spawnDialog}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MidnightBanner
        selectedDate={selectedDate}
        onStartDay={(calendarDay) => {
          void maybeRollover(calendarDay);
        }}
      />
      <TodayPanelLayout
        taskList={
          <div className="flex h-full min-h-0 flex-col bg-card">
            <DayTaskList
              tasks={tasks}
              selectedDate={selectedDate}
              selectedTaskId={selectedTaskId}
              highlightTaskId={jiraPreview.highlightTaskId}
              header={
                <TaskListHeader>
                  {band === "phone" ? (
                    <PhoneJiraButton onClick={jiraPreview.openJiraSheet} />
                  ) : null}
                </TaskListHeader>
              }
              onSelectTask={selectTask}
              onDeselectTask={() => dispatch(setSelectedTaskId(null))}
              onTaskDeleted={(id) => {
                if (selectedTaskId === id) {
                  dispatch(setSelectedTaskId(null));
                }
              }}
            />
          </div>
        }
        jiraColumn={jiraColumn}
        inspector={inspector}
      />
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
            open={selectedTask !== null}
            title="Task details"
            onClose={() => dispatch(setSelectedTaskId(null))}
          >
            <DetailInspector task={selectedTask} selectedDate={selectedDate} />
          </InspectorSheet>
        )
      ) : null}
      <LinkJiraPalette selectedTask={selectedTask} selectedDate={selectedDate} />
      {spawnDialog}
    </div>
  );
}
