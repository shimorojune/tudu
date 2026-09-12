import { useEffect } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedTaskId,
  useGetReportDayQuery,
  todayIso,
  type RootState,
} from "@tudu/store";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { ReportDaySkeleton } from "@/components/loading/ReportDaySkeleton";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { ReportPersonHeader } from "@/components/team/ReportPersonHeader";
import { SendInboxForm } from "@/components/team/SendInboxForm";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useViewportBand } from "@/hooks/useViewportBand";
import { DAY_TASK_TAB_FIELDS } from "@/lib/daySearch";
import { personFirstName } from "@/lib/person";

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
    }
  }, [dispatch, search.send]);

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
  const first = personFirstName(data.report.name);

  const taskList = (
    <DayTaskList
      tasks={tasks}
      selectedDate={date}
      selectedTaskId={selectedTaskId}
      onSelectTask={(id) => {
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
    />
  );

  const sidePanel =
    showSend && !selectedTask ? (
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
        notifiedName={first}
        reportUserId={userId}
      />
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReportPersonHeader
        userId={userId}
        name={data.report.name}
        view="day"
        onSend={() => {
          dispatch(setSelectedTaskId(null));
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
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,396px)]">
          <div className="min-h-0 border-r border-hair bg-card">
            {taskList}
          </div>
          <div className="min-h-0">{sidePanel}</div>
        </div>
      )}
    </div>
  );
}
