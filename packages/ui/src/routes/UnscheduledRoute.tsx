import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Plus } from "lucide-react";
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
  useDeleteSubtaskMutation,
  useDeleteTaskMutation,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  useReorderTasksMutation,
  useReorderSubtasksMutation,
  useUpdateSubtaskMutation,
  useUpdateTaskMutation,
  useUploadTaskAttachmentMutation,
  todayIso,
  selectVisible,
  setSelectedTaskId,
  setInspectorTab,
  clearFocusCommentId,
  type RootState,
} from "@tudu/store";
import { scheduleToTodayLanes } from "@/lib/reorder";
import { offsetIso } from "@/components/tasks/TaskScheduleFields";
import { canScheduleInNow, NOW_CAP_EXCEEDED_MESSAGE } from "@/lib/nowCapGuard";
import { toast } from "sonner";
import { MoveToSpaceDialog } from "@/components/orgs/MoveToSpaceDialog";
import { ScheduleTaskDialog } from "@/components/tasks/ScheduleTaskDialog";
import { effectiveDayIso } from "@tudu/shared";
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
import { patchTaskDescriptionIfAttachmentsChanged } from "@/lib/afterCreateTaskDescription";
import { createTaskBody } from "@/lib/createTask";
import { orgIdForSpace } from "@/lib/taskSpace";
import { openNowCount } from "@/lib/nowCount";
import { splitOpenAndCompleted } from "@/lib/completedTasks";
import { cn } from "@/lib/utils";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { UnscheduledListSkeleton } from "@/components/loading/UnscheduledListSkeleton";
import { TaskRow, type TaskRowActions } from "@/components/tasks/TaskRow";
import { CompletedSection } from "@/components/tasks/CompletedSection";
import { useProjectFilterId } from "@/hooks/useProjectFilterId";
import { isTaskDimmed } from "@/lib/projectFilter";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { useViewportBand } from "@/hooks/useViewportBand";
import { useDaySearchSync } from "@/hooks/useDaySearchSync";
import { useNewTaskShortcut } from "@/hooks/useNewTaskShortcut";
import { TASK_TAB_FIELDS } from "@/lib/daySearch";
import { usePointerY } from "@/hooks/usePointerY";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskListHeader } from "@/components/tasks/TaskListHeader";

const CONTAINER = "unscheduled";
const laneFor = () => ({ scheduledDate: null, bucket: null });

type UnscheduledDndProps = {
  openTasks: Task[];
  baseItems: ContainerItems;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  makeRowActions: (taskId: string) => TaskRowActions;
  onReorder: (items: ContainerItems) => void;
  flashTaskId: string | null;
  onFlashComplete: () => void;
};

function UnscheduledDnd({
  openTasks,
  baseItems,
  selectedTaskId,
  setSelectedTaskId,
  makeRowActions,
  onReorder,
  flashTaskId,
  onFlashComplete,
}: UnscheduledDndProps) {
  const remoteMovedTaskIds = useSelector(selectVisible).remoteMovedTaskIds;
  const filterProjectId = useProjectFilterId();
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
  const [suppressSlideId, setSuppressSlideId] = useState<string | null>(null);
  dragRef.current = drag;

  const tasks = drag
    ? tasksFromItems({ tasks: openTasks, items: drag.items, laneFor }).sort(
        (a, b) => a.position - b.position,
      )
    : openTasks;

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
    onReorderRef.current(items);
    setSuppressSlideId(current.activeId);
    setDrag(null);
    requestAnimationFrame(() => setSuppressSlideId(null));
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
                onCollapse={() => setSelectedTaskId(null)}
                menuVariant="unscheduled"
                orderKey={`unscheduled:${index}`}
                actions={makeRowActions(task.id)}
                flash={task.id === flashTaskId}
                onFlashComplete={onFlashComplete}
                skipSlide={
                  task.id === suppressSlideId ||
                  remoteMovedTaskIds.includes(task.id)
                }
                dimmed={isTaskDimmed(task, filterProjectId)}
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
  const dispatch = useDispatch();
  const selectedTaskId = useSelector((state: RootState) => state.day.selectedTaskId);
  const space = useSelector((state: RootState) => state.space.current);
  const { data, isLoading, isError } = useGetUnscheduledTasksQuery();
  const { data: todayData } = useGetTasksForDayQuery(todayIso());
  useDaySearchSync(TASK_TAB_FIELDS, {
    taskFound: isLoading
      ? null
      : !selectedTaskId ||
        Boolean(data?.tasks.some((task) => task.id === selectedTaskId)),
    silentMissingTask: true,
  });
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const band = useViewportBand();
  const logicalToday = effectiveDayIso();

  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [reorderTasks] = useReorderTasksMutation();
  const [reorderSubtasks] = useReorderSubtasksMutation();
  const [createSubtask] = useCreateSubtaskMutation();
  const [deleteSubtask] = useDeleteSubtaskMutation();
  const [updateSubtask] = useUpdateSubtaskMutation();

  useNewTaskShortcut(() => setDialogOpen(true));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (isLoading) {
    return <UnscheduledListSkeleton />;
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
  const { open: openTasks, completed: completedTasks } =
    splitOpenAndCompleted(sourceTasks);
  const selectedTask = sourceTasks.find((task) => task.id === selectedTaskId) ?? null;
  const showInspector = selectedTask !== null;
  const baseItems = itemsFromTasks(openTasks, [CONTAINER], () => CONTAINER);
  const todayTasks = todayData?.tasks ?? [];
  const todayNowCount = openNowCount(todayTasks);

  const inspector = (
    <DetailInspector
      task={selectedTask}
      selectedDate={todayIso()}
      todayNowCount={todayNowCount}
      canDelete
      onDelete={
        selectedTask
          ? () => {
              deleteTask(selectedTask.id);
              dispatch(setSelectedTaskId(null));
            }
          : undefined
      }
    />
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
        if (selectedTaskId === taskId) {
          dispatch(setSelectedTaskId(null));
        }
      },
      onScheduleToToday: () => {
        const lanes = scheduleToTodayLanes(
          todayTasks,
          openTasks,
          taskId,
          todayIso(),
        );
        if (lanes.length > 0) {
          reorderTasks({ lanes });
        }
      },
      onScheduleForTomorrow: () => {
        updateTask({
          id: taskId,
          patch: {
            scheduledDate: offsetIso(logicalToday, 1),
            bucket: "later",
          },
        });
      },
      onOpenScheduleDialog: () => {
        const task = sourceTasks.find((entry) => entry.id === taskId);
        if (task) {
          setScheduleTarget({ id: task.id, title: task.title });
        }
      },
      onMoveToSpace:
        space.kind === "personal" &&
        !sourceTasks.find((t) => t.id === taskId)?.orgId
          ? () => {
              const task = sourceTasks.find((entry) => entry.id === taskId);
              if (task) {
                setMoveTarget({ id: task.id, title: task.title });
              }
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
    };
  }

  function handleReorder(items: ContainerItems) {
    const lanes = lanesFromItems({ before: baseItems, after: items, laneFor });
    if (lanes.length > 0) {
      reorderTasks({ lanes });
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-card">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-[11px] px-[16px] pb-[8px] pt-[24px] md:px-[28px]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          Unscheduled
        </span>
        <button
          type="button"
          className="inline-flex flex-none items-center gap-[5px] whitespace-nowrap border border-hair px-[8px] py-[4px] text-[11.5px] font-bold leading-none text-foreground hover:border-foreground hover:bg-foreground/[0.04]"
          onClick={() => setDialogOpen(true)}
        >
          <Plus size={11} strokeWidth={2.6} aria-hidden />
          Add task
        </button>
      </header>
      <TaskListHeader data-panel-id="task-list" className="border-t-0" />
      <ScrollArea className="min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={taskCollisionDetection}
          modifiers={[restrictToVerticalAxis]}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <UnscheduledDnd
            openTasks={openTasks}
            baseItems={baseItems}
            selectedTaskId={selectedTaskId}
            setSelectedTaskId={(id) => dispatch(setSelectedTaskId(id))}
            makeRowActions={makeRowActions}
            onReorder={handleReorder}
            flashTaskId={flashTaskId}
            onFlashComplete={() => setFlashTaskId(null)}
          />
          <CompletedSection
            tasks={completedTasks}
            selectedTaskId={selectedTaskId}
            selectedDate=""
            onSelectTask={(id) => dispatch(setSelectedTaskId(id))}
            onDeselectTask={() => dispatch(setSelectedTaskId(null))}
            rowActionsForTask={makeRowActions}
            flashTaskId={flashTaskId}
            onFlashComplete={() => setFlashTaskId(null)}
            menuVariant="unscheduled"
            bucketForRow={() => "later"}
          />
        </DndContext>
      </ScrollArea>
      </div>
      {band === "phone" ? (
        <InspectorSheet
          open={showInspector}
          title="Task details"
          onClose={() => {
            dispatch(setSelectedTaskId(null));
            dispatch(setInspectorTab("details"));
            dispatch(clearFocusCommentId());
          }}
        >
          {inspector}
        </InspectorSheet>
      ) : (
        <aside className="hidden w-[360px] shrink-0 border-l border-hair md:block">
          {inspector}
        </aside>
      )}
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
      {scheduleTarget ? (
        <ScheduleTaskDialog
          open={Boolean(scheduleTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setScheduleTarget(null);
            }
          }}
          taskTitle={scheduleTarget.title}
          initialScheduledDate={null}
          initialBucket={null}
          nowCount={todayNowCount}
          onConfirm={({ scheduledDate, bucket }) => {
            const task = sourceTasks.find((entry) => entry.id === scheduleTarget.id);
            if (
              bucket === "now" &&
              !canScheduleInNow({
                today: logicalToday,
                targetDate: scheduledDate,
                openNowCountOnToday: todayNowCount,
                currentTask: task,
              })
            ) {
              toast.error(NOW_CAP_EXCEEDED_MESSAGE);
              return;
            }
            updateTask({
              id: scheduleTarget.id,
              patch: { scheduledDate, bucket },
            });
            setScheduleTarget(null);
          }}
        />
      ) : null}
      <NewTaskDialog
        open={dialogOpen}
        initialBucket="later"
        initialDate={todayIso()}
        defaultDayChoice="unscheduled"
        nowCount={todayNowCount}
        onOpenChange={setDialogOpen}
        onSubmit={async (args) => {
          const result = await createTask(
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
          ).unwrap();

          await patchTaskDescriptionIfAttachmentsChanged(
            result.task.id,
            args.description,
            args.pendingAttachments,
            (input) => uploadTaskAttachment(input).unwrap(),
            (description) =>
              updateTask({ id: result.task.id, patch: { description } }).unwrap(),
          );

          for (const subtaskTitle of args.subtaskTitles) {
            await createSubtask({
              taskId: result.task.id,
              body: { title: subtaskTitle },
            }).unwrap();
          }

          dispatch(setSelectedTaskId(result.task.id));
          setFlashTaskId(result.task.id);
        }}
      />
    </div>
  );
}
