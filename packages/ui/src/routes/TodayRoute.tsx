import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { effectiveDayIso, type Bucket } from "@tudu/shared";
import {
  setSelectedTaskId,
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { createTaskBody } from "@/lib/createTask";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { JiraColumnEmpty } from "@/components/jira/JiraColumnEmpty";
import { MidnightBanner } from "@/components/today/MidnightBanner";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { DayListSkeleton } from "@/components/loading/DayListSkeleton";
import { LoadingStatus } from "@/components/loading/LoadingStatus";
import { PaneSkeleton } from "@/components/loading/PaneSkeleton";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { useRolloverOnFocus } from "@/hooks/useRolloverOnFocus";
import { useViewportBand } from "@/hooks/useViewportBand";
import { DAY_TASK_TAB_FIELDS } from "@/lib/daySearch";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);

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

  const [firstRunDialogOpen, setFirstRunDialogOpen] = useState(false);
  const [firstRunBucket, setFirstRunBucket] = useState<Bucket>("later");

  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;
  const effectiveDay = effectiveDayIso();

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
      <>
        <TodayFirstRun
          onAddFirst={() => openFirstRunDialog("later")}
        />
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

            for (const subtaskTitle of args.subtaskTitles) {
              await createSubtask({
                taskId: result.task.id,
                body: { title: subtaskTitle },
              }).unwrap();
            }

            dispatch(setSelectedTaskId(result.task.id));
          }}
        />
      </>
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
              onSelectTask={(id) => dispatch(setSelectedTaskId(id))}
              onDeselectTask={() => dispatch(setSelectedTaskId(null))}
              onTaskDeleted={(id) => {
                if (selectedTaskId === id) {
                  dispatch(setSelectedTaskId(null));
                }
              }}
            />
          </div>
        }
        jiraColumn={<JiraColumnEmpty />}
        inspector={
          <DetailInspector task={selectedTask} selectedDate={selectedDate} />
        }
      />
      {band === "phone" ? (
        <InspectorSheet
          open={selectedTask !== null}
          title="Task details"
          onClose={() => dispatch(setSelectedTaskId(null))}
        >
          <DetailInspector task={selectedTask} selectedDate={selectedDate} />
        </InspectorSheet>
      ) : null}
    </div>
  );
}
