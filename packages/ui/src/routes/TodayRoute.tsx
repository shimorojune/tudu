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
import { JiraColumnEmpty } from "@/components/jira/JiraColumnEmpty";
import { MidnightBanner } from "@/components/today/MidnightBanner";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { useRolloverOnFocus } from "@/hooks/useRolloverOnFocus";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);

  const dayQuery = useGetTasksForDayQuery(selectedDate);
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const [createTask] = useCreateTaskMutation();
  const [createSubtask] = useCreateSubtaskMutation();

  const [firstRunDialogOpen, setFirstRunDialogOpen] = useState(false);
  const [firstRunBucket, setFirstRunBucket] = useState<Bucket>("later");

  const tasks = dayQuery.data?.tasks ?? [];
  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;
  const effectiveDay = effectiveDayIso();

  const isFirstRun =
    !dayQuery.isLoading &&
    !unscheduledQuery.isLoading &&
    tasks.length === 0 &&
    unscheduledCount === 0 &&
    selectedDate === effectiveDay;

  const { maybeRollover } = useRolloverOnFocus(!isFirstRun);

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ?? null;

  function openFirstRunDialog(bucket: Bucket = "later") {
    setFirstRunBucket(bucket);
    setFirstRunDialogOpen(true);
  }

  useNewTaskShortcut(() => openFirstRunDialog("later"), { enabled: isFirstRun });

  if (dayQuery.isLoading) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
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
    </div>
  );
}
