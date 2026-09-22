import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import type { Task } from "@tudu/shared";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDndContext,
  useDndMonitor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { effectiveDayIso } from "@tudu/shared";
import {
  useReorderReportTasksMutation,
  useReorderTasksMutation,
} from "@tudu/store";
import {
  findContainer,
  itemsFromTasks,
  lanesFromItems,
  placeItem,
  resolvePlacementTarget,
  tasksFromItems,
  type ContainerItems,
} from "@/lib/dragSort";
import {
  insertAfterFromEvent,
  pointerYFromEvent,
  taskCollisionDetection,
} from "@/lib/dragCollision";
import {
  containerForDayBucket,
  parseIsoDate,
  UNSCHEDULED_CONTAINER,
  weekContainersForDays,
  type WeekViewer,
} from "@/lib/week";
import { remapWeekDropTarget, weekLaneFor } from "@/lib/weekDrag";
import { usePointerY } from "@/hooks/usePointerY";
import { useProjectFilterId } from "@/hooks/useProjectFilterId";
import { isTaskDimmed } from "@/lib/projectFilter";
import { UnscheduledRail } from "@/components/week/UnscheduledRail";
import { WeekColumn } from "@/components/week/WeekColumn";
import { WeekCard } from "@/components/week/WeekCard";
import { lanesExceedNowCap, NOW_CAP_EXCEEDED_MESSAGE } from "@/lib/nowCapGuard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TaskListHeader } from "@/components/tasks/TaskListHeader";

const CONTAINER_SWITCH_HYSTERESIS_PX = 12;

export type WeekGridProps = {
  weekDays: string[];
  unscheduledTasks: Task[];
  tasksByDay: Map<string, Task[]>;
  highlightedDay: string;
  onHighlightDay: (day: string) => void;
  viewer?: WeekViewer;
  reportUserId?: string;
};

function containerOf(task: Task): string | null {
  if (task.scheduledDate === null || task.bucket === null) {
    return UNSCHEDULED_CONTAINER;
  }
  return containerForDayBucket(task.scheduledDate, task.bucket);
}

type WeekGridDndProps = WeekGridProps & {
  allTasks: Task[];
  baseItems: ContainerItems;
  onReorder: (items: ContainerItems) => void;
  viewer: WeekViewer;
  reportUserId?: string;
};

function WeekGridDnd({
  weekDays,
  allTasks,
  baseItems,
  onReorder,
  highlightedDay,
  onHighlightDay,
  viewer,
  reportUserId,
}: WeekGridDndProps) {
  const today = effectiveDayIso();
  const filterProjectId = useProjectFilterId();
  const { droppableRects } = useDndContext();
  const pointerYRef = usePointerY();
  const appliedDeltaRef = useRef<number | null>(null);
  const dragRef = useRef<{ activeId: string; items: ContainerItems } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const baseItemsRef = useRef(baseItems);
  baseItemsRef.current = baseItems;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [popoverTaskId, setPopoverTaskId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    activeId: string;
    items: ContainerItems;
  } | null>(null);
  dragRef.current = drag;

  const displayTasks = useMemo(
    () =>
      drag
        ? tasksFromItems({ tasks: allTasks, items: drag.items, laneFor: weekLaneFor })
        : allTasks,
    [allTasks, drag],
  );

  const displayUnscheduled = useMemo(
    () =>
      displayTasks
        .filter((task) => task.scheduledDate === null)
        .sort((a, b) => a.position - b.position),
    [displayTasks],
  );

  const displayByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const day of weekDays) {
      map.set(
        day,
        displayTasks
          .filter((task) => task.scheduledDate === day)
          .sort((a, b) => a.position - b.position),
      );
    }
    return map;
  }, [displayTasks, weekDays]);

  const activeTask = drag
    ? displayTasks.find((task) => task.id === drag.activeId) ?? null
    : null;

  const dropTargetContainer = drag
    ? findContainer(drag.items, drag.activeId)
    : null;

  useDndMonitor({
    onDragStart(event) {
      appliedDeltaRef.current = null;
      setPopoverTaskId(null);
      setDrag({ activeId: String(event.active.id), items: baseItemsRef.current });
    },
    onDragMove(event) {
      handleDragUpdate(event);
    },
    onDragOver(event) {
      handleDragUpdate(event);
    },
    onDragEnd(event) {
      handleDragEnd(event);
    },
    onDragCancel() {
      setDrag(null);
    },
  });

  function rowRectFor(id: string) {
    const rect = droppableRects.get(id);
    return rect ? { top: rect.top, height: rect.height } : null;
  }

  function pointerMovedSinceLastPlacement(
    delta: number,
    changesContainer: boolean,
  ): boolean {
    if (appliedDeltaRef.current === null) {
      return true;
    }
    const moved = Math.abs(delta - appliedDeltaRef.current);
    return changesContainer
      ? moved >= CONTAINER_SWITCH_HYSTERESIS_PX
      : moved >= 1;
  }

  function placeFromEvent(
    current: { activeId: string; items: ContainerItems },
    event: DragMoveEvent | DragOverEvent | DragEndEvent,
    commit = false,
  ): ContainerItems {
    if (!event.over) {
      return current.items;
    }

    const liveY = pointerYRef.current;
    const resolved = resolvePlacementTarget({
      overId: String(event.over.id),
      insertAfter: insertAfterFromEvent(event, liveY),
      items: current.items,
      activeId: current.activeId,
      pointerY: pointerYFromEvent(event, liveY),
      rowRectFor,
    });

    const remapped = remapWeekDropTarget({
      items: current.items,
      activeId: current.activeId,
      overId: resolved.overId,
      insertAfter: resolved.insertAfter,
    });

    const from = findContainer(current.items, current.activeId);
    const to = findContainer(current.items, remapped.overId);
    const changesContainer = from !== null && to !== null && from !== to;

    if (
      !commit &&
      !pointerMovedSinceLastPlacement(event.delta.y, changesContainer)
    ) {
      return current.items;
    }

    return placeItem({
      items: current.items,
      activeId: current.activeId,
      overId: remapped.overId,
      insertAfter: remapped.insertAfter,
    });
  }

  function handleDragUpdate(event: DragMoveEvent | DragOverEvent) {
    const current = dragRef.current;
    if (!current) {
      return;
    }

    const items = placeFromEvent(current, event);
    if (items === current.items) {
      return;
    }

    appliedDeltaRef.current = event.delta.y;
    setDrag({ ...current, items });
  }

  function handleDragEnd(event: DragEndEvent) {
    const current = dragRef.current;
    if (!current) {
      return;
    }

    const items = placeFromEvent(current, event, true);
    onReorderRef.current(items);
    setDrag(null);
  }

  function scrollToColumn(id: string) {
    const node = scrollerRef.current?.querySelector(`[data-week-col="${id}"]`);
    node?.scrollIntoView({ inline: "start", block: "nearest" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-panel-id="task-list">
      <TaskListHeader className="border-t-0" />
      <div className="flex shrink-0 gap-[6px] overflow-x-auto border-b border-hair bg-card px-[10px] py-[8px] xl:hidden">
        <button
          type="button"
          aria-label="Jump to Unscheduled"
          className="shrink-0 border border-rule px-[8px] py-[5px] text-[11px] font-bold text-muted-foreground"
          onClick={() => scrollToColumn("unscheduled")}
        >
          Unscheduled
        </button>
        {weekDays.map((day) => {
          const active = day === highlightedDay;
          return (
            <button
              key={day}
              type="button"
              aria-label={`Jump to ${format(parseIsoDate(day), "EEEE")}`}
              className={cn(
                "shrink-0 border border-rule px-[8px] py-[5px] text-[11px] font-bold",
                active
                  ? "bg-foreground text-card"
                  : "text-muted-foreground",
              )}
              onClick={() => {
                onHighlightDay(day);
                scrollToColumn(day);
              }}
            >
              {format(parseIsoDate(day), "EEE")}
            </button>
          );
        })}
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-x-auto xl:overflow-x-hidden"
      >
        <div className="grid h-full min-h-0 min-w-[1160px] grid-cols-[180px_repeat(7,minmax(140px,1fr))] xl:min-w-0 xl:grid-cols-[220px_repeat(7,minmax(0,1fr))]">
          <UnscheduledRail
            tasks={displayUnscheduled}
            dropActive={dropTargetContainer === UNSCHEDULED_CONTAINER}
          />
          {weekDays.map((day) => (
            <WeekColumn
              key={day}
              date={day}
              tasks={displayByDay.get(day) ?? []}
              isToday={day === today}
              highlighted={day === highlightedDay}
              dropTargetBucket={dropTargetContainer}
              popoverTaskId={popoverTaskId}
              onHighlight={() => onHighlightDay(day)}
              onPopoverChange={setPopoverTaskId}
              viewer={viewer}
              reportUserId={reportUserId}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="max-w-[200px] bg-card px-[12px] py-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <WeekCard
              task={activeTask}
              scheduledDate={activeTask.scheduledDate ?? ""}
              isToday={activeTask.scheduledDate === today}
              dragging={false}
              dimmed={isTaskDimmed(activeTask, filterProjectId)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </div>
  );
}

export function WeekGrid({
  weekDays,
  unscheduledTasks,
  tasksByDay,
  highlightedDay,
  onHighlightDay,
  viewer = "self",
  reportUserId,
}: WeekGridProps) {
  const [reorderTasks] = useReorderTasksMutation();
  const [reorderReportTasks] = useReorderReportTasksMutation();

  const allTasks = useMemo(() => {
    const dayTasks = weekDays.flatMap((day) => tasksByDay.get(day) ?? []);
    const combined = [...unscheduledTasks, ...dayTasks];
    const seen = new Set<string>();
    return combined.filter((task) => {
      if (seen.has(task.id)) {
        return false;
      }
      seen.add(task.id);
      return true;
    });
  }, [unscheduledTasks, tasksByDay, weekDays]);

  const containers = useMemo(() => weekContainersForDays(weekDays), [weekDays]);

  const baseItems = useMemo(
    () => itemsFromTasks(allTasks, containers, containerOf),
    [allTasks, containers],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleReorder(items: ContainerItems) {
    const lanes = lanesFromItems({
      before: baseItems,
      after: items,
      laneFor: weekLaneFor,
    });
    const today = effectiveDayIso();
    if (lanes.length > 0 && lanesExceedNowCap(allTasks, lanes, today)) {
      toast.error(NOW_CAP_EXCEEDED_MESSAGE);
      return;
    }
    if (lanes.length > 0) {
      if (viewer === "manager" && reportUserId) {
        reorderReportTasks({ userId: reportUserId, lanes });
      } else {
        reorderTasks({ lanes });
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={taskCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll
    >
      <WeekGridDnd
        weekDays={weekDays}
        unscheduledTasks={unscheduledTasks}
        tasksByDay={tasksByDay}
        allTasks={allTasks}
        baseItems={baseItems}
        onReorder={handleReorder}
        highlightedDay={highlightedDay}
        onHighlightDay={onHighlightDay}
        viewer={viewer}
        reportUserId={reportUserId}
      />
    </DndContext>
  );
}
