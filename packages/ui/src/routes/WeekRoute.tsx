import { useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import type { Bucket, Task } from "@tudu/shared";
import { effectiveDayIso } from "@tudu/shared";
import {
  setSelectedDate,
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useUploadTaskAttachmentMutation,
  useGetTasksForDayQuery,
  type RootState,
} from "@tudu/store";
import { WeekGridSkeleton } from "@/components/loading/WeekGridSkeleton";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { WeekGrid } from "@/components/week/WeekGrid";
import { patchTaskDescriptionIfAttachmentsChanged } from "@/lib/afterCreateTaskDescription";
import { createTaskBody } from "@/lib/createTask";
import { orgIdForSpace } from "@/lib/taskSpace";
import { openNowCount } from "@/lib/nowCount";
import {
  defaultHighlightDay,
  defaultWeekId,
  weekDaysFromWeekId,
} from "@/lib/week";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { useWeekTaskQueries } from "@/hooks/useWeekTaskQueries";
import { DATE_ONLY_FIELDS } from "@/lib/daySearch";

export function WeekRoute() {
  const dispatch = useDispatch();
  const search = useSearch({ strict: false }) as { week?: string };
  const weekId = search.week ?? defaultWeekId();
  const weekDays = useMemo(() => weekDaysFromWeekId(weekId), [weekId]);
  const today = effectiveDayIso();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const space = useSelector((state: RootState) => state.space.current);
  useDaySearchSync(DATE_ONLY_FIELDS, { weekDays, today });

  const { unscheduledQuery, tasksByDay, isLoading, isError } =
    useWeekTaskQueries(weekDays);

  const highlightedDay = weekDays.includes(selectedDate)
    ? selectedDate
    : defaultHighlightDay(weekDays, today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBucket, setDialogBucket] = useState<Bucket>("later");

  const highlightedDayQuery = useGetTasksForDayQuery(highlightedDay);
  const nowCount = openNowCount(highlightedDayQuery.data?.tasks ?? []);

  const [createTask] = useCreateTaskMutation();
  const [createSubtask] = useCreateSubtaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();

  useNewTaskShortcut(() => {
    setDialogBucket("later");
    setDialogOpen(true);
  });

  if (isLoading) {
    return (
      <WeekGridSkeleton
        weekDays={weekDays}
        highlightedDay={highlightedDay}
      />
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
        onHighlightDay={(day) => dispatch(setSelectedDate(day))}
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
              description: args.description,
              scheduledDate: args.scheduledDate,
              bucket: args.bucket,
              startDate: args.startDate,
              deadline: args.deadline,
              projectId: args.projectId,
              orgId: orgIdForSpace(space),
            }),
          ).unwrap();

          await patchTaskDescriptionIfAttachmentsChanged(
            created.task.id,
            args.description,
            args.pendingAttachments,
            (input) => uploadTaskAttachment(input).unwrap(),
            (description) =>
              updateTask({ id: created.task.id, patch: { description } }).unwrap(),
          );

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
