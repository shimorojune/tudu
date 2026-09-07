import { useMemo, useRef, useState } from "react";
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
import { useReorderTasksMutation } from "@tudu/store";
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
  UNSCHEDULED_CONTAINER,
  weekContainersForDays,
} from "@/lib/week";
import { remapWeekDropTarget, weekLaneFor } from "@/lib/weekDrag";
import { usePointerY } from "@/hooks/usePointerY";
import { UnscheduledRail } from "@/components/week/UnscheduledRail";
import { WeekColumn } from "@/components/week/WeekColumn";
import { WeekCard } from "@/components/week/WeekCard";

const CONTAINER_SWITCH_HYSTERESIS_PX = 12;

export type WeekGridProps = {
  weekDays: string[];
  unscheduledTasks: Task[];
  tasksByDay: Map<string, Task[]>;
  highlightedDay: string;
  onHighlightDay: (day: string) => void;
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
};

function WeekGridDnd({
  weekDays,
  allTasks,
  baseItems,
  onReorder,
  highlightedDay,
  onHighlightDay,
}: WeekGridDndProps) {
  const today = effectiveDayIso();
  const { droppableRects } = useDndContext();
  const pointerYRef = usePointerY();
  const appliedDeltaRef = useRef<number | null>(null);
  const dragRef = useRef<{ activeId: string; items: ContainerItems } | null>(null);
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
    setDrag(null);
    onReorderRef.current(items);
  }

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_repeat(7,minmax(0,1fr))]">
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
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="max-w-[200px] bg-card px-[12px] py-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <WeekCard
              task={activeTask}
              scheduledDate={activeTask.scheduledDate ?? ""}
              isToday={activeTask.scheduledDate === today}
              dragging={false}
            />
          </div>
        ) : null}
      </DragOverlay>
    </>
  );
}

export function WeekGrid({
  weekDays,
  unscheduledTasks,
  tasksByDay,
  highlightedDay,
  onHighlightDay,
}: WeekGridProps) {
  const [reorderTasks] = useReorderTasksMutation();

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
    if (lanes.length > 0) {
      reorderTasks({ lanes });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={taskCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
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
      />
    </DndContext>
  );
}
