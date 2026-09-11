import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useDebouncedCallback } from "use-debounce";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { CSS } from "@dnd-kit/utilities";
import type { Bucket, Subtask, Task } from "@tudu/shared";
import { isSlipping } from "@tudu/shared";
import { Check, X } from "lucide-react";
import { useSlideOnReorder } from "@/hooks/useSlideOnReorder";
import { AUTOSAVE_MS } from "@/lib/autosave";
import { cn } from "@/lib/utils";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { taskMetaSegments } from "@/lib/taskMeta";
import { CarryDots } from "@/components/tasks/CarryDots";
import { SubtaskComposer } from "@/components/tasks/SubtaskComposer";
import { TaskDeleteDialog } from "@/components/tasks/TaskDeleteDialog";
import { LinkifiedText } from "@/components/text/LinkifiedText";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type TaskRowActions = {
  onComplete: (completed: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onToggleInProgress?: () => void;
  onMoveToBucket?: (bucket: Bucket) => void;
  onUnschedule?: () => void;
  onScheduleToToday?: () => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onAddSubtask: (title: string) => void;
  onReorderSubtasks: (subtaskIds: string[]) => void;
};

export type TaskViewer = "owner" | "manager";

export type TaskRowProps = {
  task: Task;
  bucket: Bucket;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
  onCollapse?: () => void;
  menuVariant: "day" | "unscheduled";
  orderKey?: string;
  actions?: TaskRowActions;
  flash?: boolean;
  onFlashComplete?: () => void;
  skipSlide?: boolean;
  viewer?: TaskViewer;
  dimmed?: boolean;
};

function flashElement(element: HTMLElement | null) {
  if (!element) {
    return;
  }
  element.classList.remove("add-task-flash");
  void element.offsetWidth;
  element.classList.add("add-task-flash");
}

function TaskCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  const className = cn(
    "mt-px flex size-[18px] shrink-0 items-center justify-center border-[1.5px] bg-card",
    checked ? "border-foreground bg-foreground text-card" : "border-ghost",
  );

  return (
    <button
      type="button"
      aria-label={checked ? "Mark incomplete" : "Mark complete"}
      className={cn(className, "transition-colors duration-150 ease-out")}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Check
        size={12}
        strokeWidth={3}
        className={cn(
          "transition-opacity duration-150 ease-out",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

function SubtaskCheckbox({
  checked,
  onToggle,
  readOnly = false,
}: {
  checked: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  const className = cn(
    "flex size-[14px] shrink-0 items-center justify-center border-[1.5px]",
    checked
      ? "border-foreground bg-foreground text-card"
      : "border-ghost bg-card",
  );

  if (readOnly) {
    return (
      <span className={className} aria-hidden>
        <Check
          size={10}
          strokeWidth={3}
          className={cn(checked ? "opacity-100" : "opacity-0")}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={checked ? "Mark subtask incomplete" : "Mark subtask complete"}
      className={cn(className, "transition-colors duration-150 ease-out")}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Check
        size={10}
        strokeWidth={3}
        className={cn(
          "transition-opacity duration-150 ease-out",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

function DragHandleDots({
  listeners,
  attributes,
}: {
  listeners?: SyntheticListenerMap;
  attributes?: DraggableAttributes;
}) {
  return (
    <div
      aria-hidden
      className="mt-px grid h-[18px] w-[9px] shrink-0 cursor-grab touch-none grid-cols-2 content-center gap-[3px] text-ghost active:cursor-grabbing"
      {...listeners}
      {...attributes}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="size-[3px] bg-current" />
      ))}
    </div>
  );
}

function SubtaskDragHandle({
  listeners,
  attributes,
}: {
  listeners?: SyntheticListenerMap;
  attributes?: DraggableAttributes;
}) {
  return (
    <div
      aria-hidden
      data-subtask-drag-handle
      className="absolute left-[-20px] top-1/2 grid h-[14px] w-[8px] -translate-y-1/2 cursor-grab touch-none grid-cols-2 content-center gap-[2px] text-ghost opacity-0 transition-opacity group-hover/subtask:opacity-100 focus-visible:opacity-100 active:cursor-grabbing motion-reduce:transition-none"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      {...listeners}
      {...attributes}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="size-[2px] bg-current" />
      ))}
    </div>
  );
}

function SubtaskRemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove subtask"
      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/subtask:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <X size={12} strokeWidth={2} aria-hidden />
    </button>
  );
}

type SortableSubtaskItemProps = {
  subtask: Subtask;
  pending: boolean;
  editing: boolean;
  readOnly: boolean;
  onStartEdit: (event: MouseEvent<HTMLSpanElement>) => void;
  onCommit: (value: string) => void;
  onAutoSave: (value: string) => void;
  onCancel: () => void;
  onToggle: () => void;
  onDelete: () => void;
};

function SortableSubtaskItem({
  subtask,
  pending,
  editing,
  readOnly,
  onStartEdit,
  onCommit,
  onAutoSave,
  onCancel,
  onToggle,
  onDelete,
}: SortableSubtaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id, disabled: pending || readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/subtask relative flex items-center gap-[11px] py-[4px]",
        isDragging && "z-10 bg-foreground/[0.04] [&>*]:invisible",
      )}
    >
      {!pending && !readOnly ? (
        <SubtaskDragHandle listeners={listeners} attributes={attributes} />
      ) : null}
      <SubtaskCheckbox
        checked={subtask.done}
        onToggle={onToggle}
        readOnly={readOnly}
      />
      <span className="min-w-0 flex-1">
        <span className="relative inline-block max-w-full">
          {readOnly ? (
            <span
              className={cn(
                "text-[13.5px] leading-[1.4]",
                subtask.done && "text-faint line-through decoration-[1.5px]",
              )}
            >
              <LinkifiedText text={subtask.title} />
            </span>
          ) : (
            <EditableText
              text={subtask.title}
              editing={editing}
              className={cn(
                "text-[13.5px] leading-[1.4] transition-colors duration-[220ms] ease-out motion-reduce:transition-none",
                subtask.done && "text-faint",
                subtask.done && !editing && "line-through decoration-[1.5px]",
              )}
              ariaLabel="Rename subtask"
              onStartEdit={onStartEdit}
              onCommit={onCommit}
              onAutoSave={onAutoSave}
              onCancel={onCancel}
            />
          )}
        </span>
      </span>
      {!pending && !readOnly ? <SubtaskRemoveButton onRemove={onDelete} /> : null}
    </li>
  );
}

type SubtaskListProps = {
  subtasks: Subtask[];
  pendingIds: Set<string>;
  editingSubtaskId: string | null;
  setEditingSubtaskId: (id: string | null) => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onReorderSubtasks: (subtaskIds: string[]) => void;
  readOnly?: boolean;
};

function SubtaskDragPreview({ subtask }: { subtask: Subtask }) {
  return (
    <div className="flex items-center gap-[11px] bg-card py-[4px] pl-[20px] shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
      <SubtaskCheckbox checked={subtask.done} onToggle={() => {}} />
      <span
        className={cn(
          "text-[13.5px] leading-[1.4]",
          subtask.done && "text-faint",
        )}
      >
        {subtask.title}
      </span>
    </div>
  );
}

function SubtaskList({
  subtasks,
  pendingIds,
  editingSubtaskId,
  setEditingSubtaskId,
  onToggleSubtask,
  onRenameSubtask,
  onDeleteSubtask,
  onReorderSubtasks,
  readOnly = false,
}: SubtaskListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const persisted = useMemo(
    () => subtasks.filter((subtask) => !pendingIds.has(subtask.id)),
    [pendingIds, subtasks],
  );
  const pending = useMemo(
    () => subtasks.filter((subtask) => pendingIds.has(subtask.id)),
    [pendingIds, subtasks],
  );

  const [orderedPersisted, setOrderedPersisted] = useState(persisted);
  const [activeId, setActiveId] = useState<string | null>(null);
  const orderedRef = useRef(orderedPersisted);
  orderedRef.current = orderedPersisted;

  useEffect(() => {
    if (!activeId) {
      setOrderedPersisted(persisted);
    }
  }, [activeId, persisted]);

  const displaySubtasks = useMemo(
    () => [...orderedPersisted, ...pending],
    [orderedPersisted, pending],
  );

  const sortableIds = useMemo(
    () => orderedPersisted.map((subtask) => subtask.id),
    [orderedPersisted],
  );

  const activeSubtask = activeId
    ? orderedPersisted.find((subtask) => subtask.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setOrderedPersisted((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) {
        return items;
      }
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function handleDragEnd(_event: DragEndEvent) {
    setActiveId(null);
    const finalIds = orderedRef.current.map((subtask) => subtask.id);
    const originalIds = persisted.map((subtask) => subtask.id);
    if (finalIds.join(",") !== originalIds.join(",")) {
      onReorderSubtasks(finalIds);
    }
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setActiveId(null);
    setOrderedPersisted(persisted);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-[4px]">
          {displaySubtasks.map((subtask) => (
            <SortableSubtaskItem
              key={subtask.id}
              subtask={subtask}
              pending={pendingIds.has(subtask.id)}
              editing={editingSubtaskId === subtask.id}
              readOnly={readOnly}
              onStartEdit={(event) => {
                event.stopPropagation();
                setEditingSubtaskId(subtask.id);
              }}
              onCommit={(value) => {
                onRenameSubtask(subtask.id, value);
                setEditingSubtaskId(null);
              }}
              onAutoSave={(value) => {
                onRenameSubtask(subtask.id, value);
              }}
              onCancel={() => setEditingSubtaskId(null)}
              onToggle={() => onToggleSubtask(subtask.id, !subtask.done)}
              onDelete={() => onDeleteSubtask(subtask.id)}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeSubtask ? <SubtaskDragPreview subtask={activeSubtask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function titleClass(bucket: Bucket, isCompleted: boolean, editing: boolean) {
  const base =
    bucket === "now"
      ? "text-[15.5px] font-semibold leading-[1.42]"
      : bucket === "later"
        ? "text-[14.5px] text-muted-foreground"
        : "text-[15px] leading-[1.42]";

  return cn(
    base,
    "transition-colors duration-[220ms] ease-out motion-reduce:transition-none",
    isCompleted && "text-faint",
    isCompleted && !editing && "line-through decoration-[1.5px]",
  );
}

type EditableTextProps = {
  text: string;
  editing: boolean;
  className?: string;
  ariaLabel: string;
  onStartEdit: (event: MouseEvent<HTMLSpanElement>) => void;
  onCommit: (value: string) => void;
  onAutoSave?: (value: string) => void;
  onCancel: () => void;
};

function EditableText({
  text,
  editing,
  className,
  ariaLabel,
  onStartEdit,
  onCommit,
  onAutoSave,
  onCancel,
}: EditableTextProps) {
  const nodeRef = useRef<HTMLSpanElement | null>(null);
  const snapshot = useRef(text);
  const lastSaved = useRef(text);

  const debouncedSave = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === lastSaved.current) {
      return;
    }
    lastSaved.current = trimmed;
    snapshot.current = trimmed;
    onAutoSave?.(trimmed);
  }, AUTOSAVE_MS);

  useLayoutEffect(() => {
    if (!editing) {
      debouncedSave.cancel();
      return;
    }

    const node = nodeRef.current;
    if (!node) {
      return;
    }

    snapshot.current = text;
    lastSaved.current = text;
    node.textContent = text;
    node.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Only when entering edit. Autosave updates `text` and must not reset the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [editing]);

  function commit() {
    debouncedSave.cancel();
    const node = nodeRef.current;
    if (!node) {
      return;
    }

    const next = (node.textContent ?? "").trim();
    if (!next) {
      node.textContent = snapshot.current;
      onCancel();
      return;
    }

    if (next !== text) {
      onCommit(next);
      return;
    }

    onCancel();
  }

  function cancelEdit() {
    debouncedSave.cancel();
    const node = nodeRef.current;
    if (node) {
      node.textContent = snapshot.current;
    }
    onCancel();
  }

  return editing ? (
    <span
      key="edit"
      ref={nodeRef}
      className={cn(
        "cursor-text outline-none whitespace-pre-wrap break-words empty:min-w-[1ch]",
        className,
      )}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      onInput={() => {
        debouncedSave(nodeRef.current?.textContent ?? "");
      }}
      onBlur={() => {
        commit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelEdit();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const plain = event.clipboardData.getData("text/plain").replace(/\n/g, " ");
        if (document.queryCommandSupported?.("insertText")) {
          document.execCommand("insertText", false, plain);
          return;
        }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return;
        }
        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(plain));
        selection.collapseToEnd();
      }}
    />
  ) : (
    <span
      key="view"
      className={cn(
        "cursor-text outline-none whitespace-pre-wrap break-words empty:min-w-[1ch]",
        className,
      )}
      onClick={onStartEdit}
    >
      <LinkifiedText text={text} />
    </span>
  );
}

export function TaskRow({
  task,
  bucket,
  selected,
  selectedDate,
  onSelect,
  onCollapse,
  menuVariant,
  orderKey = "",
  actions,
  flash = false,
  onFlashComplete,
  skipSlide = false,
  viewer = "owner",
  dimmed = false,
}: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [pendingSubtasks, setPendingSubtasks] = useState<
    { id: string; title: string }[]
  >([]);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [panelClipOpen, setPanelClipOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: task.id });

  const rowNodeRef = useRef<HTMLDivElement | null>(null);
  const isCompleted = task.completedAt !== null;
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowNodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  useSlideOnReorder(
    rowNodeRef,
    !isDragging && !skipSlide && !isCompleted,
    orderKey,
  );

  useEffect(() => {
    if (isDragging && isEditing) {
      setIsEditing(false);
    }
  }, [isDragging, isEditing]);

  useEffect(() => {
    setPendingSubtasks((current) =>
      current.filter(
        (pending) =>
          editingSubtaskId === pending.id ||
          !task.subtasks.some((subtask) => subtask.title === pending.title),
      ),
    );
  }, [editingSubtaskId, task.subtasks]);

  useLayoutEffect(() => {
    if (!flash) {
      return;
    }
    const node = rowNodeRef.current;
    if (!node) {
      return;
    }
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    flashElement(node);
  }, [flash]);

  const segments = selectedDate
    ? taskMetaSegments(task, selectedDate)
    : taskMetaSegments(task, task.scheduledDate ?? "");
  const isLater = bucket === "later";
  const visibleSubtasks = useMemo(() => {
    const knownTitles = new Set(task.subtasks.map((subtask) => subtask.title));
    const extras = pendingSubtasks.filter(
      (pending) => !knownTitles.has(pending.title),
    );
    return [
      ...task.subtasks,
      ...extras.map((pending) => ({
        id: pending.id,
        taskId: task.id,
        title: pending.title,
        done: false,
        position: task.subtasks.length,
        createdAt: "",
        updatedAt: "",
      })),
    ];
  }, [pendingSubtasks, task.id, task.subtasks]);

  const expanded =
    selected &&
    !isDragging &&
    (task.subtasks.length > 0 || pendingSubtasks.length > 0 || addingSubtask);
  const inProgress = task.inProgress && !isCompleted;
  const isManager = viewer === "manager";

  useEffect(() => {
    if (!expanded) {
      setPanelClipOpen(false);
    }
  }, [expanded]);

  function handleRowClick() {
    if (selected && expanded) {
      onCollapse?.();
      return;
    }
    onSelect();
  }
  const pendingIds = useMemo(
    () => new Set(pendingSubtasks.map((pending) => pending.id)),
    [pendingSubtasks],
  );

  const row = (
    <div
      ref={setRowRef}
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest("[data-subtask-drag-handle]")
        ) {
          return;
        }
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleRowClick();
        }
      }}
      onAnimationEnd={(event) => {
        if (event.animationName === "add-task-flash") {
          event.currentTarget.classList.remove("add-task-flash");
          onFlashComplete?.();
        }
      }}
      className={cn(
        "relative grid cursor-default border-b border-hair outline-none",
        "grid-cols-[13px_19px_minmax(0,1fr)_auto] gap-x-[12px] px-[28px]",
        "transition-[padding-top,padding-bottom,opacity] duration-200 ease-out motion-reduce:transition-none",
        isDragging && "bg-foreground/[0.04] [&>*]:invisible",
        expanded
          ? "bg-foreground/[0.03] py-[14px] before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-foreground"
          : cn(
              isLater && "items-center py-[12px]",
              !isLater && "py-[15px]",
              !isDragging && "hover:bg-foreground/[0.02]",
              inProgress &&
                "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-primary",
            ),
        isCompleted && !isDragging && "opacity-70",
        dimmed && !isDragging && "opacity-35",
      )}
    >
      <DragHandleDots listeners={listeners} attributes={attributes} />
      {isManager ? (
        <span aria-hidden className="mt-px size-[18px]" />
      ) : (
        <TaskCheckbox
          checked={isCompleted}
          onToggle={() => actions?.onComplete(!isCompleted)}
        />
      )}
      <div className="min-w-0">
        <div
          className={cn(
            isLater && task.startDate
              ? "flex items-baseline gap-[10px]"
              : undefined,
          )}
        >
          <span className="relative inline-block max-w-full">
            {isManager ? (
              <span className={titleClass(bucket, isCompleted, false)}>
                <LinkifiedText text={task.title} />
              </span>
            ) : (
              <EditableText
                text={task.title}
                editing={isEditing}
                className={titleClass(bucket, isCompleted, isEditing)}
                ariaLabel="Rename task"
                onStartEdit={(event) => {
                  event.stopPropagation();
                  onSelect();
                  setIsEditing(true);
                }}
                onCommit={(value) => {
                  actions?.onRename(value);
                  setIsEditing(false);
                }}
                onAutoSave={(value) => {
                  actions?.onRename(value);
                }}
                onCancel={() => setIsEditing(false)}
              />
            )}
          </span>
          {isLater && task.startDate ? (
            <span className="text-[12px] tabular-nums text-faint">
              starts{" "}
              {new Date(`${task.startDate}T12:00:00`).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "short" },
              )}
            </span>
          ) : null}
        </div>
        {task.description && !isEditing ? (
          <p className="mt-[4px] line-clamp-1 text-[12.5px] text-faint">
            <LinkifiedText text={task.description} />
          </p>
        ) : null}
        {segments.length > 0 || task.project ? (
          <div className="mt-[4px] flex flex-wrap items-center gap-[9px] text-[12.5px] tabular-nums text-muted-foreground">
            {task.project ? <ProjectChip project={task.project} /> : null}
            {task.project && segments.length > 0 ? (
              <span className="text-ghost">·</span>
            ) : null}
            {segments.map((segment, index) =>
              segment.kind === "dot" ? (
                <span key={`dot-${index}`} className="text-ghost">
                  ·
                </span>
              ) : (
                <span
                  key={`text-${index}`}
                  className={cn(
                    segment.emphasis && "font-bold text-foreground",
                    segment.accent && "font-bold text-primary",
                  )}
                >
                  {segment.text}
                </span>
              ),
            )}
          </div>
        ) : null}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          onTransitionEnd={(event) => {
            if (
              event.propertyName === "grid-template-rows" &&
              expanded &&
              event.currentTarget === event.target
            ) {
              setPanelClipOpen(true);
            }
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={cn(
              "min-h-0 -ml-[20px] pl-[20px]",
              panelClipOpen && expanded ? "overflow-visible" : "overflow-hidden",
            )}
          >
            <div className="mt-[10px]">
              {visibleSubtasks.length > 0 && actions ? (
                <SubtaskList
                  subtasks={visibleSubtasks}
                  pendingIds={pendingIds}
                  editingSubtaskId={editingSubtaskId}
                  setEditingSubtaskId={setEditingSubtaskId}
                  onToggleSubtask={actions.onToggleSubtask}
                  onRenameSubtask={actions.onRenameSubtask}
                  onDeleteSubtask={actions.onDeleteSubtask}
                  onReorderSubtasks={actions.onReorderSubtasks}
                  readOnly={isManager}
                />
              ) : visibleSubtasks.length > 0 ? (
                <ul className="flex flex-col gap-[4px]">
                  {visibleSubtasks.map((subtask) => (
                    <li
                      key={subtask.id}
                      className="group/subtask flex items-center gap-[11px] py-[4px]"
                    >
                      <SubtaskCheckbox
                        checked={subtask.done}
                        onToggle={() =>
                          actions?.onToggleSubtask(subtask.id, !subtask.done)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="relative inline-block max-w-full">
                          <EditableText
                            text={subtask.title}
                            editing={editingSubtaskId === subtask.id}
                            className={cn(
                              "text-[13.5px] leading-[1.4] transition-colors duration-[220ms] ease-out motion-reduce:transition-none",
                              subtask.done && "text-faint",
                              subtask.done &&
                                editingSubtaskId !== subtask.id &&
                                "line-through decoration-[1.5px]",
                            )}
                            ariaLabel="Rename subtask"
                            onStartEdit={(event) => {
                              event.stopPropagation();
                              setEditingSubtaskId(subtask.id);
                            }}
                            onCommit={(value) => {
                              actions?.onRenameSubtask(subtask.id, value);
                              setEditingSubtaskId(null);
                            }}
                            onAutoSave={(value) => {
                              actions?.onRenameSubtask(subtask.id, value);
                            }}
                            onCancel={() => setEditingSubtaskId(null)}
                          />
                        </span>
                      </span>
                      {!pendingIds.has(subtask.id) ? (
                        <SubtaskRemoveButton
                          onRemove={() => actions?.onDeleteSubtask(subtask.id)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {isManager ? null : addingSubtask ? (
                <SubtaskComposer
                  autoFocus
                  className="mt-[6px]"
                  onAdd={(title) => {
                    setPendingSubtasks((current) => [
                      ...current,
                      { id: crypto.randomUUID(), title },
                    ]);
                    actions?.onAddSubtask(title);
                  }}
                  onEnd={() => setAddingSubtask(false)}
                />
              ) : (
                <button
                  type="button"
                  className="mt-[6px] text-[13px] text-faint hover:text-muted-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAddingSubtask(true);
                  }}
                >
                  Add a subtask
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <CarryDots
        carriedDays={task.carriedDays}
        slipping={isSlipping({
          carriedDays: task.carriedDays,
          deadline: task.deadline,
        })}
      />
    </div>
  );

  if (!actions) {
    return row;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          {isManager ? null : (
            <>
              <ContextMenuItem onSelect={() => setIsEditing(true)}>
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  onSelect();
                  setAddingSubtask(true);
                }}
              >
                Add a subtask
              </ContextMenuItem>
              {!isCompleted && actions.onToggleInProgress ? (
                <ContextMenuItem onSelect={() => actions.onToggleInProgress?.()}>
                  {task.inProgress ? "Clear in progress" : "Mark in progress"}
                </ContextMenuItem>
              ) : null}
            </>
          )}
          {menuVariant === "day" ? (
            <>
              {isManager ? null : <ContextMenuSeparator />}
              {(["now", "next", "later"] as const).map((targetBucket) => (
                <ContextMenuItem
                  key={targetBucket}
                  disabled={targetBucket === bucket}
                  onSelect={() => actions.onMoveToBucket?.(targetBucket)}
                >
                  Move to{" "}
                  {targetBucket === "now"
                    ? "Now"
                    : targetBucket === "next"
                      ? "Next"
                      : "Later"}
                </ContextMenuItem>
              ))}
              <ContextMenuItem onSelect={() => actions.onUnschedule?.()}>
                Unschedule
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => actions.onScheduleToToday?.()}>
                Schedule to today
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <TaskDeleteDialog
        open={deleteOpen}
        title={task.title}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          actions.onDelete();
          setDeleteOpen(false);
        }}
      />
    </>
  );
}
