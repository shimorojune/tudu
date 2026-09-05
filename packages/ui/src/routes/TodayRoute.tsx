import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedTaskId,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { JiraColumnEmpty } from "@/components/jira/JiraColumnEmpty";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const selectedTaskId = useSelector(
    (state: RootState) => state.day.selectedTaskId,
  );

  const dayQuery = useGetTasksForDayQuery(selectedDate);
  const unscheduledQuery = useGetUnscheduledTasksQuery();

  const tasks = dayQuery.data?.tasks ?? [];
  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const isFirstRun =
    !dayQuery.isLoading &&
    !unscheduledQuery.isLoading &&
    tasks.length === 0 &&
    unscheduledCount === 0;

  if (dayQuery.isLoading || unscheduledQuery.isLoading) {
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
    return <TodayFirstRun />;
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
          />
        </div>
      }
      jiraColumn={<JiraColumnEmpty />}
      inspector={
        <DetailInspector task={selectedTask} selectedDate={selectedDate} />
      }
    />
  );
}
