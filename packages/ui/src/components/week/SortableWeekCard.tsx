import { forwardRef, useCallback, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import type { Task } from "@tudu/shared";
import { useSlideOnReorder } from "@/hooks/useSlideOnReorder";
import { WeekCard, type WeekCardProps } from "@/components/week/WeekCard";

export type SortableWeekCardProps = Omit<WeekCardProps, "dragging"> & {
  task: Task;
  orderKey?: string;
  skipSlide?: boolean;
};

export const SortableWeekCard = forwardRef<HTMLButtonElement, SortableWeekCardProps>(
  function SortableWeekCard(
    { task, scheduledDate, isToday, orderKey = "", skipSlide = false, ...rest },
    ref,
  ) {
    const { attributes, listeners, setNodeRef, isDragging } = useSortable({
      id: task.id,
    });

    const nodeRef = useRef<HTMLButtonElement | null>(null);
    const setRef = useCallback(
      (node: HTMLButtonElement | null) => {
        nodeRef.current = node;
        setNodeRef(node);
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [setNodeRef, ref],
    );

    useSlideOnReorder(
      nodeRef,
      !isDragging && !skipSlide && task.completedAt === null,
      orderKey,
    );

    return (
      <WeekCard
        ref={setRef}
        task={task}
        scheduledDate={scheduledDate}
        isToday={isToday}
        dragging={isDragging}
        {...attributes}
        {...listeners}
        {...rest}
      />
    );
  },
);
