import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedTaskId,
  todayIso,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { createTaskBody } from "@/lib/createTask";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { JiraColumnEmpty } from "@/components/jira/JiraColumnEmpty";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);

  const dayQuery = useGetTasksForDayQuery(selectedDate);
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const [createTask] = useCreateTaskMutation();

  const tasks = dayQuery.data?.tasks ?? [];
  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const isFirstRun =
    !dayQuery.isLoading &&
    !unscheduledQuery.isLoading &&
    tasks.length === 0 &&
    unscheduledCount === 0;

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
              scheduledDate: todayIso(),
              bucket: "later",
            }),
          );
        }}
      />
    );
  }

  return (
    <TodayPanelLayout
      taskList={
        <div className="flex h-full min-h-0 flex-col bg-card">
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
      inspector={<DetailInspector task={selectedTask} selectedDate={selectedDate} />}
    />
  );
}
