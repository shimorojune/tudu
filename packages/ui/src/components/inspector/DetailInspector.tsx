import { useDispatch, useSelector } from "react-redux";
import { DEFAULT_MANAGER_PERMISSIONS, type ManagerPermissions, type Task } from "@tudu/shared";
import {
  setInspectorTab,
  setSelectedTaskId,
  todayIso,
  useCreateReportProjectMutation,
  useGetReportProjectsQuery,
  useGetTeamQuery,
  useGetTimelineQuery,
  type RootState,
} from "@tudu/store";
import { CommentsTab } from "@/components/inspector/CommentsTab";
import { DetailsTab } from "@/components/inspector/DetailsTab";
import { DetailInspectorEmpty } from "@/components/inspector/DetailInspectorEmpty";
import { InspectorTabs } from "@/components/inspector/InspectorTabs";
import { TimelineTab } from "@/components/inspector/TimelineTab";
import type { TaskViewer } from "@/components/tasks/TaskRow";

export type DetailInspectorProps = {
  task: Task | null;
  selectedDate: string;
  viewer?: TaskViewer;
  reportUserId?: string;
  reportPermissions?: ManagerPermissions;
  todayNowCount?: number;
  canDelete?: boolean;
  onDelete?: () => void;
};

export function DetailInspector({
  task,
  selectedDate,
  viewer = "owner",
  reportUserId,
  reportPermissions,
  todayNowCount,
  canDelete,
  onDelete,
}: DetailInspectorProps) {
  if (!task) {
    return <DetailInspectorEmpty />;
  }

  return (
    <DetailInspectorBody
      task={task}
      selectedDate={selectedDate}
      viewer={viewer}
      reportUserId={reportUserId}
      reportPermissions={reportPermissions}
      todayNowCount={todayNowCount}
      canDelete={canDelete}
      onDelete={onDelete}
    />
  );
}

function DetailInspectorBody({
  task,
  selectedDate,
  viewer,
  reportUserId,
  reportPermissions,
  todayNowCount,
  canDelete,
  onDelete,
}: {
  task: Task;
  selectedDate: string;
  viewer: TaskViewer;
  reportUserId?: string;
  reportPermissions?: ManagerPermissions;
  todayNowCount?: number;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const dispatch = useDispatch();
  const tab = useSelector((state: RootState) => state.day.inspectorTab);
  const isToday = selectedDate === todayIso();
  const isManager = viewer === "manager";
  const permissions = reportPermissions ?? DEFAULT_MANAGER_PERMISSIONS;
  const { data: team } = useGetTeamQuery(undefined, { skip: isManager });
  const { data: timelineData } = useGetTimelineQuery(task.id);
  const { data: reportProjects = [] } = useGetReportProjectsQuery(
    reportUserId ?? "",
    { skip: !isManager || !reportUserId },
  );
  const [createReportProject] = useCreateReportProjectMutation();

  const sharedWithName = isManager ? null : (team?.manager?.name ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <InspectorTabs
        active={tab}
        commentCount={task.commentCount}
        onChange={(next) => dispatch(setInspectorTab(next))}
        onClose={() => dispatch(setSelectedTaskId(null))}
      />

      {tab === "details" ? (
        <DetailsTab
          task={task}
          selectedDate={selectedDate}
          isToday={isToday}
          timelineEvents={timelineData?.events ?? []}
          onJumpToTimeline={() => dispatch(setInspectorTab("timeline"))}
          readOnly={isManager}
          canAssignProject={isManager}
          projects={isManager ? reportProjects : undefined}
          onCreateProject={
            isManager && reportUserId
              ? (body) =>
                  createReportProject({ userId: reportUserId, body }).unwrap()
              : undefined
          }
          sharedWithName={sharedWithName}
          todayNowCount={todayNowCount}
          canDelete={canDelete && !isManager}
          onDelete={onDelete}
        />
      ) : null}
      {tab === "comments" ? (
        <CommentsTab
          task={task}
          canComment={!isManager || permissions.canComment}
        />
      ) : null}
      {tab === "timeline" ? (
        <TimelineTab
          task={task}
          selectedDate={selectedDate}
          isToday={isToday}
          timelineEvents={timelineData?.events ?? []}
          hasMore={timelineData?.hasMore ?? false}
          canEditPrivacy={!isManager}
          sharedWithName={sharedWithName}
        />
      ) : null}
    </div>
  );
}
