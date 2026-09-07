import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { effectiveDayIso } from "@tudu/shared";
import {
  setSelectedTaskId,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  useReorderTasksMutation,
  type RootState,
} from "@tudu/store";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { createTaskBody } from "@/lib/createTask";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { JiraColumnEmpty } from "@/components/jira/JiraColumnEmpty";
import { MidnightBanner } from "@/components/today/MidnightBanner";
import { RolloverBanner } from "@/components/today/RolloverBanner";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";
import { useRolloverOnFocus } from "@/hooks/useRolloverOnFocus";
import { buildPushCarriedToLaterLanes } from "@/lib/pushCarriedToLater";
import { dismissRecap } from "@/lib/rolloverState";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);

  const dayQuery = useGetTasksForDayQuery(selectedDate);
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const [createTask] = useCreateTaskMutation();
  const [reorderTasks] = useReorderTasksMutation();

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

  const [recapDismissed, setRecapDismissed] = useState(false);

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ?? null;

  const handlePushAllToLater = useCallback(async () => {
    const lanes = buildPushCarriedToLaterLanes({
      tasks,
      scheduledDate: effectiveDay,
    });
    if (lanes.length === 0) {
      return;
    }
    await reorderTasks({ lanes }).unwrap();
    dismissRecap(effectiveDay);
    setRecapDismissed(true);
  }, [effectiveDay, reorderTasks, tasks]);

  const handleDismissRecap = useCallback(() => {
    dismissRecap(effectiveDay);
    setRecapDismissed(true);
  }, [effectiveDay]);

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
      <TodayFirstRun
        onAddFirst={() => {
          createTask(
            createTaskBody({
              title: "My first task",
              scheduledDate: selectedDate,
              bucket: "later",
            }),
          );
        }}
      />
    );
  }

  const showRecap =
    selectedDate === effectiveDay && !recapDismissed;

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
            {showRecap ? (
              <RolloverBanner
                tasks={tasks}
                effectiveDay={effectiveDay}
                onPushAllToLater={() => {
                  void handlePushAllToLater();
                }}
                onDismiss={handleDismissRecap}
              />
            ) : null}
            <DayTaskList
              tasks={tasks}
              selectedDate={selectedDate}
              selectedTaskId={selectedTaskId}
              onSelectTask={(id) => dispatch(setSelectedTaskId(id))}
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
