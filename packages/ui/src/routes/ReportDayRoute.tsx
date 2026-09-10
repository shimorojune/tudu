import { useEffect } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedTaskId,
  useGetReportDayQuery,
  todayIso,
  type RootState,
} from "@tudu/store";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { SendInboxForm } from "@/components/team/SendInboxForm";
import { personFirstName, personInitials } from "@/lib/person";

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

  useEffect(() => {
    if (search.send) {
      dispatch(setSelectedTaskId(null));
    }
  }, [dispatch, search.send]);

  useEffect(() => {
    return () => {
      dispatch(setSelectedTaskId(null));
    };
  }, [dispatch]);

  if (isLoading) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[56px] shrink-0 items-center gap-[16px] border-b border-rule bg-card px-[22px]">
        <Link
          to="/team"
          className="flex items-center gap-[8px] text-[13px] text-muted-foreground"
        >
          <ChevronLeft size={15} strokeWidth={1.9} />
          Team
        </Link>
        <div className="flex items-center gap-[12px]">
          <div className="flex size-[26px] items-center justify-center bg-foreground text-[11px] font-extrabold text-card">
            {personInitials(data.report.name)}
          </div>
          <span className="text-[16px] font-extrabold tracking-[-0.02em]">
            {data.report.name}
          </span>
          <span className="text-[12px] text-faint">reports to you</span>
        </div>
        <button
          type="button"
          className="ml-auto text-[12.5px] text-muted-foreground"
          onClick={() => {
            dispatch(setSelectedTaskId(null));
            void navigate({
              to: "/team/$userId",
              params: { userId },
              search: { send: true },
            });
          }}
        >
          Send a task
        </button>
      </div>

      {data.slippingCount > 0 ? (
        <div className="flex items-center gap-[10px] border-b border-hair bg-foreground/[0.03] px-[30px] py-[14px] text-[12.5px] text-muted-foreground">
          {data.slippingCount} {data.slippingCount === 1 ? "task is" : "tasks are"} slipping,
          carried two days or more
          <span className="ml-auto text-[11.5px]">
            Private tasks are hidden from this view
          </span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_396px]">
        <div className="min-h-0 border-r border-hair bg-card">
          <DayTaskList
            tasks={tasks}
            selectedDate={date}
            selectedTaskId={selectedTaskId}
            onSelectTask={(id) => {
              void navigate({
                to: "/team/$userId",
                params: { userId },
                search: { send: false },
              });
              dispatch(setSelectedTaskId(id));
            }}
            onDeselectTask={() => dispatch(setSelectedTaskId(null))}
            viewer="manager"
            reportUserId={userId}
          />
        </div>
        <div className="min-h-0">
          {showSend && !selectedTask ? (
            <SendInboxForm
              userId={userId}
              reportName={data.report.name}
              autoFocus={search.send === true}
              onSent={() =>
                void navigate({
                  to: "/team/$userId",
                  params: { userId },
                  search: { send: false },
                })
              }
            />
          ) : (
            <DetailInspector
              task={selectedTask}
              selectedDate={date}
              viewer="manager"
              notifiedName={first}
            />
          )}
        </div>
      </div>
    </div>
  );
}
