import { Link, useParams } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedTaskId,
  useGetProjectQuery,
  type RootState,
} from "@tudu/store";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { ProjectListSkeleton } from "@/components/loading/ProjectListSkeleton";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useViewportBand } from "@/hooks/useViewportBand";
import { TASK_TAB_FIELDS } from "@/lib/daySearch";
import { groupProjectTasks } from "@/lib/projectGroups";

export function ProjectRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const dispatch = useDispatch();
  const selectedTaskId = useSelector((state: RootState) => state.day.selectedTaskId);
  const { data, isLoading } = useGetProjectQuery(projectId);
  const band = useViewportBand();
  useDaySearchSync(TASK_TAB_FIELDS, {
    taskFound: isLoading
      ? null
      : !selectedTaskId ||
        Boolean(data?.tasks.some((task) => task.id === selectedTaskId)),
  });

  if (isLoading) {
    return <ProjectListSkeleton />;
  }

  if (!data) {
    return (
      <div className="px-[28px] py-[24px]">
        <p className="text-[14px] text-muted-foreground">
          This project is gone, or it has no work yet.
        </p>
        <Link
          to="/settings"
          search={{ section: "projects" }}
          className="mt-[12px] inline-block text-[13px] text-foreground"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  const groups = groupProjectTasks(data.tasks);
  const selectedTask =
    data.tasks.find((task) => task.id === selectedTaskId) ?? null;

  return (
    <div className="flex h-full min-h-0 bg-card">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex items-center gap-[12px] px-[16px] pb-[8px] pt-[24px] md:px-[28px]">
          <ProjectChip project={data.project} />
          {data.project.archivedAt ? (
            <span className="text-[11px] text-faint">Archived</span>
          ) : null}
        </header>
        {groups.length === 0 ? (
          <p className="px-[28px] py-[16px] text-[13px] text-faint">
            No tasks in this project.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.id}>
              <div className="px-[16px] pt-[18px] pb-[6px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint md:px-[28px]">
                {group.label}
              </div>
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  bucket={task.bucket ?? "later"}
                  selected={task.id === selectedTaskId}
                  selectedDate={task.scheduledDate ?? ""}
                  onSelect={() => dispatch(setSelectedTaskId(task.id))}
                  onCollapse={() => dispatch(setSelectedTaskId(null))}
                  menuVariant={task.scheduledDate ? "day" : "unscheduled"}
                />
              ))}
            </section>
          ))
        )}
      </div>
      {band === "phone" ? (
        <InspectorSheet
          open={selectedTask !== null}
          title="Task details"
          onClose={() => dispatch(setSelectedTaskId(null))}
        >
          <DetailInspector
            task={selectedTask}
            selectedDate={selectedTask?.scheduledDate ?? ""}
          />
        </InspectorSheet>
      ) : (
        <aside className="hidden w-[360px] shrink-0 border-l border-hair xl:block">
          <DetailInspector
            task={selectedTask}
            selectedDate={selectedTask?.scheduledDate ?? ""}
          />
        </aside>
      )}
    </div>
  );
}
