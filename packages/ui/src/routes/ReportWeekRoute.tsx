import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useDispatch } from "react-redux";
import type { Task } from "@tudu/shared";
import { effectiveDayIso } from "@tudu/shared";
import { setSelectedTaskId, useGetTeamQuery } from "@tudu/store";
import { WeekGridSkeleton } from "@/components/loading/WeekGridSkeleton";
import { ReportPersonHeader } from "@/components/team/ReportPersonHeader";
import { WeekGrid } from "@/components/week/WeekGrid";
import { useReportWeekTaskQueries } from "@/hooks/useReportWeekTaskQueries";
import {
  defaultHighlightDay,
  defaultWeekId,
  weekDaysFromWeekId,
} from "@/lib/week";

export function ReportWeekRoute() {
  const { userId } = useParams({ strict: false }) as { userId: string };
  const search = useSearch({ strict: false }) as { week?: string };
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const weekId = search.week ?? defaultWeekId();
  const weekDays = useMemo(() => weekDaysFromWeekId(weekId), [weekId]);
  const today = effectiveDayIso();

  const { unscheduledQuery, dayQueries, tasksByDay, isLoading, isError } =
    useReportWeekTaskQueries(userId, weekDays);
  const { data: team } = useGetTeamQuery();

  const [highlightedDay, setHighlightedDay] = useState(() =>
    defaultHighlightDay(weekDays, today),
  );

  useEffect(() => {
    setHighlightedDay(defaultHighlightDay(weekDays, today));
  }, [weekId, weekDays, today]);

  const report =
    dayQueries.find((query) => query.data?.report.name)?.data?.report ??
    team?.reports.find((row) => row.user.id === userId)?.user ?? {
      id: userId,
      name: "",
      email: "",
    };

  const header = (
    <ReportPersonHeader
      userId={userId}
      name={report.name}
      view="week"
      onSend={() => {
        dispatch(setSelectedTaskId(null));
        void navigate({
          to: "/team/$userId/inbox",
          params: { userId },
          search: { send: true },
        });
      }}
    />
  );

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <WeekGridSkeleton weekDays={weekDays} highlightedDay={highlightedDay} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <p className="px-[22px] py-[24px] text-[14px] text-destructive">
          Could not load this week.
        </p>
      </div>
    );
  }

  const slippingCount = dayQueries.reduce(
    (sum, query) => sum + (query.data?.slippingCount ?? 0),
    0,
  );

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
      {header}
      {slippingCount > 0 ? (
        <div className="flex items-center gap-[10px] border-b border-hair bg-foreground/[0.03] px-[16px] py-[14px] text-[12.5px] text-muted-foreground md:px-[30px]">
          {slippingCount} {slippingCount === 1 ? "task is" : "tasks are"} slipping,
          carried two days or more
          <span className="ml-auto text-[11.5px]">
            Private tasks are hidden from this view
          </span>
        </div>
      ) : null}
      <WeekGrid
        weekDays={weekDays}
        unscheduledTasks={unscheduledTasks}
        tasksByDay={tasksByDayLists}
        highlightedDay={highlightedDay}
        onHighlightDay={setHighlightedDay}
        viewer="manager"
        reportUserId={userId}
      />
      <footer className="flex h-[34px] shrink-0 items-center gap-[18px] border-t border-hair bg-background px-[22px] text-[11.5px] text-faint">
        <span>Undated tasks live in the left rail. Drag one onto a day.</span>
        {slippingCount === 0 ? (
          <span className="ml-auto">Private tasks are hidden from this view</span>
        ) : null}
      </footer>
    </div>
  );
}
