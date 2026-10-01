import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSelector } from "react-redux";
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
import { BUCKETS, effectiveDayIso, type Bucket, type Task } from "@tudu/shared";
import {
  useCreateSubtaskMutation,
  useCreateTaskMutation,
  useDeleteSubtaskMutation,
  useDeleteTaskMutation,
  useReorderTasksMutation,
  useReorderSubtasksMutation,
  useUpdateSubtaskMutation,
  useUpdateTaskMutation,
  useUploadTaskAttachmentMutation,
  selectVisible,
} from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";
import {
  openTaskContainer,
  splitOpenAndCompleted,
  tasksByBucketOpen,
} from "@/lib/completedTasks";
import { openNowCount } from "@/lib/nowCount";
import {
  canMoveTaskToNow,
  lanesExceedNowCap,
  NOW_CAP_EXCEEDED_MESSAGE,
} from "@/lib/nowCapGuard";
import { toast } from "sonner";
import {
  buildPullIntoNowLanes,
  moveTaskToBucketLanes,
  unscheduleTaskLanes,
} from "@/lib/reorder";
import { offsetIso } from "@/components/tasks/TaskScheduleFields";
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
import { CompletedSection } from "@/components/tasks/CompletedSection";
import {
  NewTaskDialog,
  type NewTaskSubmitArgs,
} from "@/components/tasks/NewTaskDialog";
import { patchTaskDescriptionIfAttachmentsChanged } from "@/lib/afterCreateTaskDescription";
import { createTaskBody } from "@/lib/createTask";
import { orgIdForSpace } from "@/lib/taskSpace";
import { MoveToSpaceDialog } from "@/components/orgs/MoveToSpaceDialog";
import type { TaskOrgBadge, TaskRowActions, TaskViewer } from "@/components/tasks/TaskRow";
import { mergeSubsetReorder } from "@/lib/spaceTasks";
import type { CurrentSpace } from "@tudu/store";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { usePointerY } from "@/hooks/usePointerY";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notifyAction, mutationResult } from "@/lib/notifyAction";
import { useViewportBand } from "@/hooks/useViewportBand";
import { cn } from "@/lib/utils";

const CONTAINER_SWITCH_HYSTERESIS_PX = 12;

export type DayTaskListProps = {
  tasks: Task[];
  selectedDate: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onDeselectTask?: () => void;
  onTaskDeleted?: (id: string) => void;
  viewer?: TaskViewer;
  header?: ReactNode;
  highlightTaskId?: string | null;
  space?: CurrentSpace;
  aggregateOpenTasks?: Task[];
  orgBadgeForTask?: (task: Task) => TaskOrgBadge | null;
};

type DayTaskListDndProps = {
  openTasks: Task[];
  completedTasks: Task[];
  selectedDate: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onDeselectTask?: () => void;
  isToday: boolean;
  baseItems: ContainerItems;
  showNowClearPrompt: boolean;
  rowActionsForTask: (taskId: string) => TaskRowActions;
  onNowClearPrompt: () => void;
  onReorder: (items: ContainerItems) => void;
  onAddTask: (bucket: Bucket) => void;
  flashTaskId: string | null;
  onFlashComplete: () => void;
  viewer: TaskViewer;
  canDragRows: boolean;
  orgBadgeForTask?: (task: Task) => TaskOrgBadge | null;
};

function DayTaskListDnd({
  openTasks,
  completedTasks,
  selectedDate,
  selectedTaskId,
  onSelectTask,
  onDeselectTask,
  isToday,
  baseItems,
  showNowClearPrompt,
  rowActionsForTask,
  onNowClearPrompt,
  onReorder,
  onAddTask,
  flashTaskId,
  onFlashComplete,
  viewer,
  canDragRows,
  orgBadgeForTask,
}: DayTaskListDndProps) {
  const remoteMovedTaskIds = useSelector(selectVisible).remoteMovedTaskIds;
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
  const [suppressSlideId, setSuppressSlideId] = useState<string | null>(null);
  dragRef.current = drag;

  const laneFor = (bucket: string) => ({
    scheduledDate: selectedDate,
    bucket: bucket as Bucket,
  });

  const displayTasks = useMemo(
    () =>
      drag
        ? tasksFromItems({ tasks: openTasks, items: drag.items, laneFor })
        : openTasks,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTasks, drag, selectedDate],
  );
  const grouped = useMemo(() => tasksByBucketOpen(displayTasks), [displayTasks]);

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
    onReorderRef.current(items);
    setSuppressSlideId(current.activeId);
    setDrag(null);
    requestAnimationFrame(() => setSuppressSlideId(null));
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
          onDeselectTask={onDeselectTask}
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
          skipSlideForTaskId={suppressSlideId}
          skipSlideForTaskIds={remoteMovedTaskIds}
          viewer={viewer}
          canDragRows={canDragRows}
          orgBadgeForTask={orgBadgeForTask}
        />
      ))}
      <CompletedSection
        tasks={completedTasks}
        selectedTaskId={selectedTaskId}
        selectedDate={selectedDate}
        onSelectTask={onSelectTask}
        onDeselectTask={onDeselectTask}
        rowActionsForTask={rowActionsForTask}
        flashTaskId={flashTaskId}
        onFlashComplete={onFlashComplete}
        viewer={viewer}
      />
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
  onDeselectTask,
  onTaskDeleted,
  viewer = "owner",
  header,
  highlightTaskId = null,
  space = { kind: "personal" },
  aggregateOpenTasks,
  orgBadgeForTask,
}: DayTaskListProps) {
  const [moveTarget, setMoveTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const logicalToday = effectiveDayIso();
  const isToday = selectedDate === logicalToday;
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBucket, setDialogBucket] = useState<Bucket>("later");
  const canReorder = true;
  const canDelete = true;
  const band = useViewportBand();

  const { open: openTasks, completed: completedTasks } = useMemo(
    () => splitOpenAndCompleted(tasks),
    [tasks],
  );

  const baseItems = useMemo(
    () => itemsFromTasks(openTasks, BUCKETS, openTaskContainer),
    [openTasks],
  );

  const aggregateBaseItems = useMemo(
    () =>
      aggregateOpenTasks
        ? itemsFromTasks(aggregateOpenTasks, BUCKETS, openTaskContainer)
        : baseItems,
    [aggregateOpenTasks, baseItems],
  );

  const groupedForPrompt = useMemo(() => tasksByBucketOpen(openTasks), [openTasks]);
  const showNowClearPrompt =
    isToday &&
    openNowCount(openTasks) === 0 &&
    groupedForPrompt.next.length > 0;

  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();
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

  useEffect(() => {
    if (highlightTaskId) {
      setFlashTaskId(highlightTaskId);
    }
  }, [highlightTaskId]);

  const laneFor = (bucket: string) => ({
    scheduledDate: selectedDate,
    bucket: bucket as Bucket,
  });

  function applyReorder(lanes: ReturnType<typeof lanesFromItems>) {
    if (lanes.length === 0) {
      return;
    }
    if (
      isToday &&
      lanesExceedNowCap(openTasks, lanes, logicalToday)
    ) {
      toast.error(NOW_CAP_EXCEEDED_MESSAGE);
      return;
    }
    reorderTasks({ lanes });
  }

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
      onDelete: canDelete
        ? () => {
            void notifyAction(
              () => mutationResult(deleteTask(taskId)),
              { success: "Task deleted", error: "Could not delete the task" },
            );
            onTaskDeleted?.(taskId);
          }
        : undefined,
      canMoveToNow: canMoveTaskToNow({
        openTasks,
        today: logicalToday,
        selectedDate,
        task: tasks.find((entry) => entry.id === taskId)!,
      }),
      onMoveToBucket: canReorder
        ? (bucket) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (
              bucket === "now" &&
              task &&
              !canMoveTaskToNow({
                openTasks,
                today: logicalToday,
                selectedDate,
                task,
              })
            ) {
              toast.error(NOW_CAP_EXCEEDED_MESSAGE);
              return;
            }
            const lanes = moveTaskToBucketLanes(openTasks, taskId, bucket, selectedDate);
            applyReorder(lanes);
          }
        : undefined,
      onUnschedule: canReorder
        ? () => {
            const lanes = unscheduleTaskLanes(openTasks, taskId);
            applyReorder(lanes);
          }
        : undefined,
      onScheduleForTomorrow: canReorder
          ? () => {
              const task = tasks.find((entry) => entry.id === taskId);
              if (!task?.bucket) {
                return;
              }
              updateTask({
                id: taskId,
                patch: {
                  scheduledDate: offsetIso(logicalToday, 1),
                  bucket: task.bucket,
                },
              });
            }
          : undefined,
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
      onMoveToSpace:
        space.kind === "personal" && !tasks.find((t) => t.id === taskId)?.orgId
          ? () => {
              const task = tasks.find((entry) => entry.id === taskId);
              if (task) {
                setMoveTarget({ id: task.id, title: task.title });
              }
            }
          : undefined,
    };
  }

  function handleReorder(afterItems: ContainerItems) {
    const mergedItems =
      aggregateOpenTasks && space.kind === "org"
        ? mergeSubsetReorder(aggregateOpenTasks, afterItems, selectedDate)
        : afterItems;
    applyReorder(
      lanesFromItems({
        before: aggregateBaseItems,
        after: mergedItems,
        laneFor,
      }),
    );
  }

  async function handleCreateTask(args: NewTaskSubmitArgs) {
    const result = (await notifyAction(
      () =>
        mutationResult(
          createTask(
            createTaskBody({
              title: args.title,
              description: args.description,
              scheduledDate: args.scheduledDate,
              bucket: args.scheduledDate === null ? null : args.bucket,
              startDate: args.startDate,
              deadline: args.deadline,
              projectId: args.projectId,
              orgId: orgIdForSpace(space),
            }),
          ),
        ),
      { success: "Task created", error: "Could not create the task" },
    )) as { task: { id: string } };

    await patchTaskDescriptionIfAttachmentsChanged(
      result.task.id,
      args.description,
      args.pendingAttachments,
      (input) => uploadTaskAttachment(input).unwrap(),
      (description) =>
        updateTask({ id: result.task.id, patch: { description } }).unwrap(),
    );

    for (const subtaskTitle of args.subtaskTitles) {
      await mutationResult(
        createSubtask({
          taskId: result.task.id,
          body: { title: subtaskTitle },
        }),
      );
    }

    onSelectTask(result.task.id);
    setFlashTaskId(result.task.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName={cn(
          band === "phone" &&
            "scroll-pt-[52px] scroll-pb-[calc(72px+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <div
          className={cn(
            band === "phone" &&
              "pb-[calc(72px+env(safe-area-inset-bottom,0px))]",
          )}
        >
        <DndContext
          sensors={sensors}
          collisionDetection={taskCollisionDetection}
          modifiers={[restrictToVerticalAxis]}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <DayTaskListDnd
            openTasks={openTasks}
            completedTasks={completedTasks}
            selectedDate={selectedDate}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onDeselectTask={onDeselectTask}
            isToday={isToday}
            baseItems={baseItems}
            showNowClearPrompt={showNowClearPrompt}
            rowActionsForTask={makeRowActions}
            onNowClearPrompt={() => {
              if (canReorder) {
                const lanes = buildPullIntoNowLanes(openTasks, selectedDate);
                applyReorder(lanes);
              }
            }}
            onReorder={handleReorder}
            onAddTask={openDialog}
            flashTaskId={flashTaskId}
            onFlashComplete={() => setFlashTaskId(null)}
            viewer={viewer}
            canDragRows={canReorder}
            orgBadgeForTask={orgBadgeForTask}
          />
        </DndContext>
        </div>
      </ScrollArea>
      {moveTarget ? (
        <MoveToSpaceDialog
          open={Boolean(moveTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setMoveTarget(null);
            }
          }}
          taskId={moveTarget.id}
          taskTitle={moveTarget.title}
        />
      ) : null}
      <NewTaskDialog
        open={dialogOpen}
        initialBucket={dialogBucket}
        initialDate={selectedDate}
        nowCount={openNowCount(openTasks)}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreateTask}
      />
    </div>
  );
}
