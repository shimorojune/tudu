import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import type { Bucket, Task } from "@tudu/shared";
import { effectiveDayIso } from "@tudu/shared";
import {
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
} from "@tudu/store";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { WeekGrid } from "@/components/week/WeekGrid";
import { createTaskBody } from "@/lib/createTask";
import {
  defaultHighlightDay,
  defaultWeekId,
  weekDaysFromWeekId,
} from "@/lib/week";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { useWeekTaskQueries } from "@/hooks/useWeekTaskQueries";

export function WeekRoute() {
  const search = useSearch({ strict: false }) as { week?: string };
  const weekId = search.week ?? defaultWeekId();
  const weekDays = useMemo(() => weekDaysFromWeekId(weekId), [weekId]);
  const today = effectiveDayIso();

  const { unscheduledQuery, tasksByDay, isLoading, isError } =
    useWeekTaskQueries(weekDays);

  const [highlightedDay, setHighlightedDay] = useState(() =>
    defaultHighlightDay(weekDays, today),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBucket, setDialogBucket] = useState<Bucket>("later");

  const highlightedDayQuery = useGetTasksForDayQuery(highlightedDay);
  const nowCount =
    highlightedDayQuery.data?.tasks.filter(
      (task) => task.bucket === "now" && task.completedAt === null,
    ).length ?? 0;

  const [createTask] = useCreateTaskMutation();
  const [createSubtask] = useCreateSubtaskMutation();

  useNewTaskShortcut(() => {
    setDialogBucket("later");
    setDialogOpen(true);
  });

  useEffect(() => {
    setHighlightedDay(defaultHighlightDay(weekDays, today));
  }, [weekId, weekDays, today]);

  if (isLoading) {
    return (
      <p className="px-[22px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="px-[22px] py-[24px] text-[14px] text-destructive">
        Could not load week tasks.
      </p>
    );
  }

  const unscheduledTasks = [...(unscheduledQuery.data?.tasks ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  const tasksByDayLists = new Map<string, Task[]>();
  for (const day of weekDays) {
    const data = tasksByDay.get(day);
    tasksByDayLists.set(
      day,
      [...(data?.tasks ?? [])].sort((a, b) => a.position - b.position),
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WeekGrid
        weekDays={weekDays}
        unscheduledTasks={unscheduledTasks}
        tasksByDay={tasksByDayLists}
        highlightedDay={highlightedDay}
        onHighlightDay={setHighlightedDay}
      />
      <footer className="flex h-[34px] shrink-0 items-center gap-[18px] border-t border-hair bg-background px-[22px] text-[11.5px] text-faint">
        <span>Undated tasks live in the left rail. Drag one onto a day.</span>
      </footer>
      <NewTaskDialog
        open={dialogOpen}
        initialBucket={dialogBucket}
        initialDate={highlightedDay}
        defaultDayChoice="pick"
        nowCount={nowCount}
        onOpenChange={setDialogOpen}
        onSubmit={async (args) => {
          const created = await createTask(
            createTaskBody({
              title: args.title,
              scheduledDate: args.scheduledDate,
              bucket: args.bucket,
            }),
          ).unwrap();
          for (const subtaskTitle of args.subtaskTitles) {
            await createSubtask({
              taskId: created.task.id,
              body: { title: subtaskTitle },
            }).unwrap();
          }
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
