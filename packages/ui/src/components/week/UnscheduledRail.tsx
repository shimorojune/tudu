import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { useSelector } from "react-redux";
import type { Task } from "@tudu/shared";
import { selectVisible } from "@tudu/store";
import { containerDroppableId } from "@/lib/dragSort";
import { UNSCHEDULED_CONTAINER } from "@/lib/week";
import { SortableWeekCard } from "@/components/week/SortableWeekCard";
import { cn } from "@/lib/utils";
import { noSortingStrategy } from "@/lib/dragSort";

export type UnscheduledRailProps = {
  tasks: Task[];
  dropActive: boolean;
};

export function UnscheduledRail({
  tasks,
  dropActive,
}: UnscheduledRailProps) {
  const remoteMovedTaskIds = useSelector(selectVisible).remoteMovedTaskIds;
  const { setNodeRef } = useDroppable({
    id: containerDroppableId(UNSCHEDULED_CONTAINER),
  });

  return (
    <div className="flex min-h-0 flex-col border-r border-hair bg-card">
      <div className="border-b border-hair px-[14px] py-[12px]">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Unscheduled
        </div>
        <div className="mt-[4px] text-[11.5px] tabular-nums text-faint">
          {tasks.length}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-[10px] py-[10px]",
          dropActive && "bg-foreground/[0.03]",
        )}
      >
        {tasks.length === 0 ? (
          <p className="px-[4px] py-[8px] text-[12px] leading-snug text-faint">
            Drag a task here to remove its day.
          </p>
        ) : (
          <SortableContext
            items={tasks.map((task) => task.id)}
            strategy={noSortingStrategy}
          >
            <div className="flex flex-col gap-[8px]">
              {tasks.map((task, index) => (
                <SortableWeekCard
                  key={task.id}
                  task={task}
                  scheduledDate=""
                  isToday={false}
                  orderKey={`unscheduled:${index}`}
                  skipSlide={remoteMovedTaskIds.includes(task.id)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
