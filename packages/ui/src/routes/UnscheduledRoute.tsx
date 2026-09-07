import { useRef, useState } from "react";
import type { Task } from "@tudu/shared";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDndContext,
  useDndMonitor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
} from "@dnd-kit/sortable";
import {
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  useReorderTasksMutation,
  useReorderSubtasksMutation,
  useUpdateSubtaskMutation,
  useUpdateTaskMutation,
  todayIso,
} from "@tudu/store";
import { scheduleToTodayLanes } from "@/lib/reorder";
import {
  containerDroppableId,
  itemsFromTasks,
  lanesFromItems,
  noSortingStrategy,
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
import { createTaskBody } from "@/lib/createTask";
import { cn } from "@/lib/utils";
import { AddTaskRow } from "@/components/tasks/AddTaskRow";
import { TaskRow, type TaskRowActions } from "@/components/tasks/TaskRow";
import { usePointerY } from "@/hooks/usePointerY";
import { ScrollArea } from "@/components/ui/scroll-area";

const CONTAINER = "unscheduled";
const laneFor = () => ({ scheduledDate: null, bucket: null });

type UnscheduledDndProps = {
  sourceTasks: Task[];
  baseItems: ContainerItems;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  makeRowActions: (taskId: string) => TaskRowActions;
  onReorder: (items: ContainerItems) => void;
  flashTaskId: string | null;
  onFlashComplete: () => void;
};

function UnscheduledDnd({
  sourceTasks,
  baseItems,
  selectedTaskId,
  setSelectedTaskId,
  makeRowActions,
  onReorder,
  flashTaskId,
  onFlashComplete,
}: UnscheduledDndProps) {
  const { droppableRects } = useDndContext();
  const pointerYRef = usePointerY();
  const { setNodeRef } = useDroppable({ id: containerDroppableId(CONTAINER) });
  const appliedDeltaRef = useRef<number | null>(null);
  const dragRef = useRef<{ activeId: string; items: ContainerItems } | null>(null);
  const baseItemsRef = useRef(baseItems);
  baseItemsRef.current = baseItems;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [drag, setDrag] = useState<{
    activeId: string;
    items: ContainerItems;
  } | null>(null);
  dragRef.current = drag;

  const tasks = drag
    ? tasksFromItems({ tasks: sourceTasks, items: drag.items, laneFor }).sort(
        (a, b) => a.position - b.position,
      )
    : sourceTasks;

  const activeTask = drag
    ? tasks.find((task) => task.id === drag.activeId) ?? null
    : null;

  useDndMonitor({
    onDragStart(event) {
      appliedDeltaRef.current = null;
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

  function pointerMovedSinceLastPlacement(delta: number): boolean {
    return (
      appliedDeltaRef.current === null ||
      Math.abs(delta - (appliedDeltaRef.current ?? 0)) >= 1
    );
  }

  function placeFromEvent(
    current: { activeId: string; items: ContainerItems },
    event: DragMoveEvent | DragOverEvent | DragEndEvent,
    commit = false,
  ): ContainerItems {
    if (!event.over) {
      return current.items;
    }
    if (!commit && !pointerMovedSinceLastPlacement(event.delta.y)) {
      return current.items;
    }

    const liveY = pointerYRef.current;
    const target = resolvePlacementTarget({
      overId: String(event.over.id),
      insertAfter: insertAfterFromEvent(event, liveY),
      items: current.items,
      activeId: current.activeId,
      pointerY: pointerYFromEvent(event, liveY),
      rowRectFor,
    });

    return placeItem({
      items: current.items,
      activeId: current.activeId,
      overId: target.overId,
      insertAfter: target.insertAfter,
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
      <div
        ref={setNodeRef}
        className={cn("min-h-[48px]", drag && "bg-foreground/[0.03]")}
      >
        {tasks.length === 0 ? (
          <p className="px-[28px] py-[16px] text-[13px] text-faint">
            Nothing unscheduled. Tasks without a day land here.
          </p>
        ) : (
          <SortableContext
            items={tasks.map((task) => task.id)}
            strategy={noSortingStrategy}
          >
            {tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                bucket="later"
                selected={task.id === selectedTaskId}
                selectedDate=""
                onSelect={() => setSelectedTaskId(task.id)}
                menuVariant="unscheduled"
                orderKey={`unscheduled:${index}`}
                actions={makeRowActions(task.id)}
                flash={task.id === flashTaskId}
                onFlashComplete={onFlashComplete}
              />
            ))}
          </SortableContext>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="bg-card px-[28px] py-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <span className="text-[15px]">{activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </>
  );
}

export function UnscheduledRoute() {
  const { data, isLoading, isError } = useGetUnscheduledTasksQuery();
  const { data: todayData } = useGetTasksForDayQuery(todayIso());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [reorderTasks] = useReorderTasksMutation();
  const [reorderSubtasks] = useReorderSubtasksMutation();
  const [createSubtask] = useCreateSubtaskMutation();
  const [updateSubtask] = useUpdateSubtaskMutation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (isLoading) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-destructive">
        Could not load unscheduled tasks.
      </p>
    );
  }

  const sourceTasks = [...(data?.tasks ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const baseItems = itemsFromTasks(sourceTasks, [CONTAINER], () => CONTAINER);
  const todayTasks = todayData?.tasks ?? [];

  function makeRowActions(taskId: string): TaskRowActions {
    return {
      onComplete: (completed) => {
        updateTask({ id: taskId, patch: { completed } });
      },
      onRename: (title) => {
        updateTask({ id: taskId, patch: { title } });
      },
      onDelete: () => {
        deleteTask(taskId);
        if (selectedTaskId === taskId) {
          setSelectedTaskId(null);
        }
      },
      onScheduleToToday: () => {
        const lanes = scheduleToTodayLanes(todayTasks, sourceTasks, taskId, todayIso());
        if (lanes.length > 0) {
          reorderTasks({ lanes });
        }
      },
      onToggleSubtask: (subtaskId, done) => {
        updateSubtask({ id: subtaskId, patch: { done } });
      },
      onRenameSubtask: (subtaskId, title) => {
        updateSubtask({ id: subtaskId, patch: { title } });
      },
      onAddSubtask: (title) => {
        createSubtask({ taskId, body: { title } });
      },
      onReorderSubtasks: (subtaskIds) => {
        reorderSubtasks({ taskId, body: { subtaskIds } });
      },
    };
  }

  function handleReorder(items: ContainerItems) {
    const lanes = lanesFromItems({ before: baseItems, after: items, laneFor });
    if (lanes.length > 0) {
      reorderTasks({ lanes });
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="px-[28px] pb-[8px] pt-[24px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        Unscheduled
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={taskCollisionDetection}
          modifiers={[restrictToVerticalAxis]}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <UnscheduledDnd
            sourceTasks={sourceTasks}
            baseItems={baseItems}
            selectedTaskId={selectedTaskId}
            setSelectedTaskId={setSelectedTaskId}
            makeRowActions={makeRowActions}
            onReorder={handleReorder}
            flashTaskId={flashTaskId}
            onFlashComplete={() => setFlashTaskId(null)}
          />
        </DndContext>
      </ScrollArea>
      <AddTaskRow
        inputRef={addInputRef}
        onSubmit={async (title) => {
          try {
            const result = await createTask(
              createTaskBody({ title, scheduledDate: null, bucket: null }),
            ).unwrap();
            setSelectedTaskId(result.task.id);
            setFlashTaskId(result.task.id);
          } catch {
            // create failed; leave selection unchanged
          }
        }}
      />
    </div>
  );
}
