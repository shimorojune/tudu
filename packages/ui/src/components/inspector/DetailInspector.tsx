import { useDispatch, useSelector } from "react-redux";
import type { Task } from "@tudu/shared";
import {
  setInspectorTab,
  setSelectedTaskId,
  todayIso,
  useGetTimelineQuery,
  type RootState,
} from "@tudu/store";
import { CommentsTab } from "@/components/inspector/CommentsTab";
import { DetailsTab } from "@/components/inspector/DetailsTab";
import { DetailInspectorEmpty } from "@/components/inspector/DetailInspectorEmpty";
import { InspectorTabs } from "@/components/inspector/InspectorTabs";
import { TimelineTab } from "@/components/inspector/TimelineTab";

export type DetailInspectorProps = {
  task: Task | null;
  selectedDate: string;
  todayNowCount?: number;
  canDelete?: boolean;
  onDelete?: () => void;
};

export function DetailInspector({
  task,
  selectedDate,
  todayNowCount,
  canDelete,
  onDelete,
}: DetailInspectorProps) {
  if (!task) {
    return <DetailInspectorEmpty />;
  }

  const dispatch = useDispatch();
  const tab = useSelector((state: RootState) => state.day.inspectorTab);
  const isToday = selectedDate === todayIso();
  const { data: timelineData } = useGetTimelineQuery(task.id);

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
          todayNowCount={todayNowCount}
          canDelete={canDelete}
          onDelete={onDelete}
        />
      ) : null}
      {tab === "comments" ? <CommentsTab task={task} canComment /> : null}
      {tab === "timeline" ? (
        <TimelineTab
          task={task}
          selectedDate={selectedDate}
          isToday={isToday}
          timelineEvents={timelineData?.events ?? []}
          hasMore={timelineData?.hasMore ?? false}
          canEditPrivacy
        />
      ) : null}
    </div>
  );
}
