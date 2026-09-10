import { useEffect, useState } from "react";
import type { Task, TimelineEvent } from "@tudu/shared";
import {
  useGetMeQuery,
  useLazyGetTimelineOlderQuery,
  useUpdateTaskMutation,
} from "@tudu/store";
import {
  formatTimelineEvent,
  withSyntheticCreated,
} from "@/lib/timelineCopy";
import { personFirstName } from "@/lib/person";
import { TimelineEventRow } from "@/components/inspector/TimelineEventRow";

export type TimelineTabProps = {
  task: Task;
  selectedDate: string;
  isToday: boolean;
  timelineEvents: TimelineEvent[];
  hasMore: boolean;
  canEditPrivacy?: boolean;
  sharedWithName?: string | null;
};

export function TimelineTab({
  task,
  selectedDate,
  isToday,
  timelineEvents,
  hasMore,
  canEditPrivacy = true,
  sharedWithName = null,
}: TimelineTabProps) {
  const { data: me } = useGetMeQuery();
  const [updateTask] = useUpdateTaskMutation();
  const [olderEvents, setOlderEvents] = useState<TimelineEvent[]>([]);
  const [olderHasMore, setOlderHasMore] = useState(false);
  const [fetchOlder, { isFetching }] = useLazyGetTimelineOlderQuery();

  useEffect(() => {
    setOlderEvents([]);
    setOlderHasMore(false);
  }, [task.id, timelineEvents]);

  const viewerName = me?.name?.trim() || "You";
  const firstPage = withSyntheticCreated(task.id, task.createdAt, timelineEvents);
  const events = [...firstPage, ...olderEvents];
  const oldest = events.at(-1);
  const showOlder = olderEvents.length > 0 ? olderHasMore : hasMore;

  async function loadOlder() {
    if (!oldest) {
      return;
    }

    const page = await fetchOlder({
      taskId: task.id,
      before: oldest.createdAt,
    }).unwrap();

    setOlderEvents((current) => [...current, ...page.events]);
    setOlderHasMore(page.hasMore);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[22px]">
        <h2 className="text-[16px] font-extrabold leading-[1.3] tracking-[-0.018em]">
          {task.title}
        </h2>

        <div className="mt-[18px]">
          {events.map((event, index) => {
            const copy = formatTimelineEvent(event, {
              viewerName,
              viewerId: me?.id,
              isToday,
              selectedDate,
            });
            return (
              <TimelineEventRow
                key={event.id}
                timeLabel={copy.timeLabel}
                isSystem={copy.isSystem}
                parts={copy.parts}
                isLast={index === events.length - 1}
              />
            );
          })}
        </div>

        {showOlder && oldest ? (
          <button
            type="button"
            className="mt-[12px] text-[12.5px] text-muted-foreground"
            disabled={isFetching}
            onClick={() => void loadOlder()}
          >
            Show older
          </button>
        ) : null}
      </div>

      {canEditPrivacy ? (
        <div className="mt-auto flex items-center gap-[10px] border-t border-hair px-[24px] py-[14px] text-[12px] text-muted-foreground">
          <span className="size-[5px] bg-primary" aria-hidden />
          {task.isPrivate || !sharedWithName
            ? "Only you can see this task"
            : `${personFirstName(sharedWithName)} can see this task`}
          <button
            type="button"
            className="ml-auto border border-rule px-[10px] py-[4px] text-[11.5px]"
            onClick={() => {
              void updateTask({
                id: task.id,
                patch: { isPrivate: !task.isPrivate },
              });
            }}
          >
            {task.isPrivate ? "Make visible" : "Make private"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
