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
};

export function DetailInspector({ task, selectedDate }: DetailInspectorProps) {
  if (!task) {
    return <DetailInspectorEmpty />;
  }

  return <DetailInspectorBody task={task} selectedDate={selectedDate} />;
}

function DetailInspectorBody({
  task,
  selectedDate,
}: {
  task: Task;
  selectedDate: string;
}) {
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
        />
      ) : null}
      {tab === "comments" ? <CommentsTab task={task} /> : null}
      {tab === "timeline" ? (
        <TimelineTab
          task={task}
          selectedDate={selectedDate}
          isToday={isToday}
          timelineEvents={timelineData?.events ?? []}
          hasMore={timelineData?.hasMore ?? false}
        />
      ) : null}

      <footer className="mt-auto flex h-[30px] shrink-0 items-center justify-between border-t border-hair px-[24px] text-[11px] text-faint">
        <span>Panes drag to resize · rows drag to reorder</span>
        <span className="font-mono">⌘K commands</span>
      </footer>
    </div>
  );
}
