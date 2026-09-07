import { useCallback, useMemo, useRef, useState } from "react";
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { BUCKETS, type Bucket, type Task } from "@tudu/shared";
import {
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useDeleteSubtaskMutation,
  useDeleteTaskMutation,
  useReorderTasksMutation,
  useReorderSubtasksMutation,
  useUpdateSubtaskMutation,
  useUpdateTaskMutation,
  todayIso,
} from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";
import { openNowCount } from "@/lib/nowCount";
import {
  buildPullIntoNowLanes,
  moveTaskToBucketLanes,
  unscheduleTaskLanes,
} from "@/lib/reorder";
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
import { BucketSection } from "@/components/tasks/BucketSection";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { createTaskBody } from "@/lib/createTask";
import type { TaskRowActions } from "@/components/tasks/TaskRow";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { usePointerY } from "@/hooks/usePointerY";
import { ScrollArea } from "@/components/ui/scroll-area";

const CONTAINER_SWITCH_HYSTERESIS_PX = 12;

export type DayTaskListProps = {
  tasks: Task[];
  selectedDate: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onTaskDeleted?: (id: string) => void;
};

function tasksByBucket(tasks: Task[]): Record<Bucket, Task[]> {
  const grouped = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, [] as Task[]]),
  ) as Record<Bucket, Task[]>;

  for (const task of tasks) {
    if (task.bucket) {
      grouped[task.bucket].push(task);
    }
  }

  for (const bucket of BUCKETS) {
    grouped[bucket].sort((a, b) => a.position - b.position);
  }

  return grouped;
}

type DayTaskListDndProps = {
  tasks: Task[];
  selectedDate: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  isToday: boolean;
  baseItems: ContainerItems;
  showNowClearPrompt: boolean;
  rowActionsForTask: (taskId: string) => TaskRowActions;
  onNowClearPrompt: () => void;
  onReorder: (items: ContainerItems) => void;
  onAddTask: (bucket: Bucket) => void;
  flashTaskId: string | null;
  onFlashComplete: () => void;
};

function DayTaskListDnd({
  tasks,
  selectedDate,
  selectedTaskId,
  onSelectTask,
  isToday,
  baseItems,
  showNowClearPrompt,
  rowActionsForTask,
  onNowClearPrompt,
  onReorder,
  onAddTask,
  flashTaskId,
  onFlashComplete,
}: DayTaskListDndProps) {
  const { droppableRects } = useDndContext();
  const pointerYRef = usePointerY();
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

  const laneFor = (bucket: string) => ({
    scheduledDate: selectedDate,
    bucket: bucket as Bucket,
  });

  const displayTasks = useMemo(
    () =>
      drag ? tasksFromItems({ tasks, items: drag.items, laneFor }) : tasks,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, drag, selectedDate],
  );
  const grouped = useMemo(() => tasksByBucket(displayTasks), [displayTasks]);

  const activeTask = drag
    ? displayTasks.find((task) => task.id === drag.activeId) ?? null
    : null;

  const dropTargetBucket = drag
    ? findContainer(drag.items, drag.activeId)
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
    const target = resolvePlacementTarget({
      overId: String(event.over.id),
      insertAfter: insertAfterFromEvent(event, liveY),
      items: current.items,
      activeId: current.activeId,
      pointerY: pointerYFromEvent(event, liveY),
      rowRectFor,
    });

    const nextItems = placeItem({
      items: current.items,
      activeId: current.activeId,
      overId: target.overId,
      insertAfter: target.insertAfter,
    });

    const beforeContainer = findContainer(current.items, current.activeId);
    const afterContainer = findContainer(nextItems, current.activeId);
    const changesContainer = beforeContainer !== afterContainer;

    if (
      !commit &&
      !pointerMovedSinceLastPlacement(event.delta.y, changesContainer)
    ) {
      return current.items;
    }

    return nextItems;
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
      {BUCKETS.map((bucket) => (
        <BucketSection
          key={bucket}
          bucket={bucket}
          label={bucketLabel(bucket, isToday)}
          tasks={grouped[bucket]}
          selectedTaskId={selectedTaskId}
          selectedDate={selectedDate}
          onSelectTask={onSelectTask}
          onAddTask={onAddTask}
          showNowHelper={bucket === "now" && isToday}
          showNowClearPrompt={bucket === "now" && showNowClearPrompt}
          onNowClearPrompt={onNowClearPrompt}
          nowCount={openNowCount(grouped.now)}
          dropTarget={dropTargetBucket === bucket}
          dragActive={drag !== null}
          rowActionsForTask={rowActionsForTask}
          flashTaskId={flashTaskId}
          onFlashComplete={onFlashComplete}
        />
      ))}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="bg-card px-[28px] py-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <span className="text-[15px] font-semibold">{activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </>
  );
}

export function DayTaskList({
  tasks,
  selectedDate,
  selectedTaskId,
  onSelectTask,
  onTaskDeleted,
}: DayTaskListProps) {
  const isToday = selectedDate === todayIso();
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBucket, setDialogBucket] = useState<Bucket>("later");

  const baseItems = useMemo(
    () => itemsFromTasks(tasks, BUCKETS, (task) => task.bucket),
    [tasks],
  );

  const groupedForPrompt = useMemo(() => tasksByBucket(tasks), [tasks]);
  const showNowClearPrompt =
    isToday &&
    openNowCount(tasks) === 0 &&
    groupedForPrompt.next.length > 0;

  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [reorderTasks] = useReorderTasksMutation();
  const [reorderSubtasks] = useReorderSubtasksMutation();
  const [createSubtask] = useCreateSubtaskMutation();
  const [deleteSubtask] = useDeleteSubtaskMutation();
  const [updateSubtask] = useUpdateSubtaskMutation();

  const openDialog = useCallback((bucket: Bucket = "later") => {
    setDialogBucket(bucket);
    setDialogOpen(true);
  }, []);

  useNewTaskShortcut(() => openDialog("later"));

  const laneFor = (bucket: string) => ({
    scheduledDate: selectedDate,
    bucket: bucket as Bucket,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
        onTaskDeleted?.(taskId);
      },
      onMoveToBucket: (bucket) => {
        const lanes = moveTaskToBucketLanes(tasks, taskId, bucket, selectedDate);
        if (lanes.length > 0) {
          reorderTasks({ lanes });
        }
      },
      onUnschedule: () => {
        const lanes = unscheduleTaskLanes(tasks, taskId);
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
      onDeleteSubtask: (subtaskId) => {
        deleteSubtask(subtaskId);
      },
      onAddSubtask: (title) => {
        createSubtask({ taskId, body: { title } });
      },
      onReorderSubtasks: (subtaskIds) => {
        reorderSubtasks({ taskId, body: { subtaskIds } });
      },
    };
  }

  function handleReorder(afterItems: ContainerItems) {
    const lanes = lanesFromItems({ before: baseItems, after: afterItems, laneFor });
    if (lanes.length > 0) {
      reorderTasks({ lanes });
    }
  }

  async function handleCreateTask(args: {
    title: string;
    bucket: Bucket;
    scheduledDate: string | null;
    subtaskTitles: string[];
  }) {
    const result = await createTask(
      createTaskBody({
        title: args.title,
        scheduledDate: args.scheduledDate,
        bucket: args.scheduledDate === null ? null : args.bucket,
      }),
    ).unwrap();

    for (const subtaskTitle of args.subtaskTitles) {
      await createSubtask({
        taskId: result.task.id,
        body: { title: subtaskTitle },
      }).unwrap();
    }

    onSelectTask(result.task.id);
    setFlashTaskId(result.task.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={taskCollisionDetection}
          modifiers={[restrictToVerticalAxis]}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <DayTaskListDnd
            tasks={tasks}
            selectedDate={selectedDate}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            isToday={isToday}
            baseItems={baseItems}
            showNowClearPrompt={showNowClearPrompt}
            rowActionsForTask={makeRowActions}
            onNowClearPrompt={() => {
              const lanes = buildPullIntoNowLanes(tasks, selectedDate);
              if (lanes.length > 0) {
                reorderTasks({ lanes });
              }
            }}
            onReorder={handleReorder}
            onAddTask={openDialog}
            flashTaskId={flashTaskId}
            onFlashComplete={() => setFlashTaskId(null)}
          />
        </DndContext>
      </ScrollArea>
      <NewTaskDialog
        open={dialogOpen}
        initialBucket={dialogBucket}
        initialDate={selectedDate}
        nowCount={openNowCount(tasks)}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreateTask}
      />
    </div>
  );
}
