import { useDispatch, useSelector } from "react-redux";
import type { Task } from "@tudu/shared";
import {
  setInspectorTab,
  setSelectedTaskId,
  todayIso,
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
import { personFirstName } from "@/lib/person";

export type DetailInspectorProps = {
  task: Task | null;
  selectedDate: string;
  viewer?: TaskViewer;
  notifiedName?: string | null;
};

export function DetailInspector({
  task,
  selectedDate,
  viewer = "owner",
  notifiedName = null,
}: DetailInspectorProps) {
  if (!task) {
    return <DetailInspectorEmpty />;
  }

  return (
    <DetailInspectorBody
      task={task}
      selectedDate={selectedDate}
      viewer={viewer}
      notifiedName={notifiedName}
    />
  );
}

function DetailInspectorBody({
  task,
  selectedDate,
  viewer,
  notifiedName,
}: {
  task: Task;
  selectedDate: string;
  viewer: TaskViewer;
  notifiedName: string | null;
}) {
  const dispatch = useDispatch();
  const tab = useSelector((state: RootState) => state.day.inspectorTab);
  const isToday = selectedDate === todayIso();
  const isManager = viewer === "manager";
  const { data: team } = useGetTeamQuery(undefined, { skip: isManager });
  const { data: timelineData } = useGetTimelineQuery(task.id);

  const sharedWithName = isManager ? null : (team?.manager?.name ?? null);
  const commentNotifyName = isManager
    ? notifiedName
    : sharedWithName
      ? personFirstName(sharedWithName)
      : null;

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
          sharedWithName={sharedWithName}
        />
      ) : null}
      {tab === "comments" ? (
        <CommentsTab task={task} notifiedName={commentNotifyName} />
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

      <footer className="mt-auto flex h-[30px] shrink-0 items-center justify-between border-t border-hair px-[24px] text-[11px] text-faint">
        <span>Panes drag to resize · rows drag to reorder</span>
        <span>Cmd+K for commands</span>
      </footer>
    </div>
  );
}
