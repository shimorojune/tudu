import { forwardRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import type { Task } from "@tudu/shared";
import { WeekCard, type WeekCardProps } from "@/components/week/WeekCard";

export type SortableWeekCardProps = Omit<WeekCardProps, "dragging"> & {
  task: Task;
};

export const SortableWeekCard = forwardRef<HTMLButtonElement, SortableWeekCardProps>(
  function SortableWeekCard({ task, scheduledDate, isToday, ...rest }, ref) {
    const { attributes, listeners, setNodeRef, isDragging } = useSortable({
      id: task.id,
    });

    const setRef = useCallback(
      (node: HTMLButtonElement | null) => {
        setNodeRef(node);
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [setNodeRef, ref],
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
