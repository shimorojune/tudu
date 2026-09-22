import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Bucket, Task } from "@tudu/shared";
import { BUCKETS } from "@tudu/shared";
import {
  useDeleteReportTaskMutation,
  useDeleteTaskMutation,
  useReorderReportTasksMutation,
  useReorderTasksMutation,
  useUpdateTaskMutation,
  setSelectedDate,
  setSelectedTaskId,
} from "@tudu/store";
import { taskLinkSearch } from "@/lib/daySearch";
import type { WeekViewer } from "@/lib/week";
import { useDispatch } from "react-redux";
import { bucketLabel } from "@/lib/buckets";
import { moveTaskToBucketLanes } from "@/lib/reorder";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TaskDeleteDialog } from "@/components/tasks/TaskDeleteDialog";

export type WeekCardPopoverProps = {
  task: Task;
  scheduledDate: string;
  isToday: boolean;
  dayTasks: Task[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  viewer?: WeekViewer;
  reportUserId?: string;
};

export function WeekCardPopover({
  task,
  scheduledDate,
  isToday,
  dayTasks,
  open,
  onOpenChange,
  children,
  viewer = "self",
  reportUserId,
}: WeekCardPopoverProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [deleteReportTask] = useDeleteReportTaskMutation();
  const [reorderTasks] = useReorderTasksMutation();
  const [reorderReportTasks] = useReorderReportTasksMutation();
  const isManager = viewer === "manager";

  function moveToBucket(bucket: Bucket) {
    const lanes = moveTaskToBucketLanes(dayTasks, task.id, bucket, scheduledDate);
    if (lanes.length > 0) {
      if (isManager && reportUserId) {
        reorderReportTasks({ userId: reportUserId, lanes });
      } else {
        reorderTasks({ lanes });
      }
    }
    onOpenChange(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align="start" className="w-[240px] p-0">
          <div className="border-b border-hair px-[14px] py-[10px]">
            <p className="text-[13px] font-semibold leading-snug">{task.title}</p>
          </div>
          <div className="flex flex-col py-[4px]">
            {BUCKETS.filter((bucket) => bucket !== task.bucket).map((bucket) => (
              <button
                key={bucket}
                type="button"
                className="px-[14px] py-[8px] text-left text-[13px] hover:bg-foreground/[0.03]"
                onClick={() => moveToBucket(bucket)}
              >
                Move to {bucketLabel(bucket, isToday)}
              </button>
            ))}
            {!isManager ? (
              <button
                type="button"
                className="px-[14px] py-[8px] text-left text-[13px] hover:bg-foreground/[0.03]"
                onClick={() => {
                  updateTask({
                    id: task.id,
                    patch: { completed: task.completedAt === null },
                  });
                  onOpenChange(false);
                }}
              >
                {task.completedAt ? "Mark incomplete" : "Mark complete"}
              </button>
            ) : null}
            <button
              type="button"
              className="px-[14px] py-[8px] text-left text-[13px] text-destructive hover:bg-foreground/[0.03]"
              onClick={() => {
                onOpenChange(false);
                setDeleteOpen(true);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="mt-[4px] border-t border-hair px-[14px] py-[10px] text-left text-[13px] font-semibold hover:bg-foreground/[0.03]"
              onClick={() => {
                dispatch(setSelectedDate(scheduledDate));
                dispatch(setSelectedTaskId(task.id));
                onOpenChange(false);
                if (isManager && reportUserId) {
                  void navigate({
                    to: "/team/$userId",
                    params: { userId: reportUserId },
                    search: taskLinkSearch({
                      date: scheduledDate,
                      taskId: task.id,
                      extra: { send: false },
                    }),
                  });
                  return;
                }
                void navigate({
                  to: "/",
                  search: taskLinkSearch({
                    date: scheduledDate,
                    taskId: task.id,
                  }),
                });
              }}
            >
              Open day
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <TaskDeleteDialog
        open={deleteOpen}
        title={task.title}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          if (isManager && reportUserId) {
            deleteReportTask({ userId: reportUserId, taskId: task.id });
          } else {
            deleteTask(task.id);
          }
          setDeleteOpen(false);
        }}
      />
    </>
  );
}
