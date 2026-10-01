import { useEffect, useState } from "react";
import type { Bucket, Task } from "@tudu/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  resolveScheduledDate,
  TaskScheduleFields,
  type NewTaskDayChoice,
} from "@/components/tasks/TaskScheduleFields";
import { dayChoiceFromTask } from "@/lib/taskScheduleState";
import { todayIso } from "@tudu/store";

export type ScheduleTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  initialScheduledDate: string | null;
  initialBucket: Bucket | null;
  nowCount: number;
  onConfirm: (args: { scheduledDate: string; bucket: Bucket }) => void;
};

export function ScheduleTaskDialog({
  open,
  onOpenChange,
  taskTitle,
  initialScheduledDate,
  initialBucket,
  nowCount,
  onConfirm,
}: ScheduleTaskDialogProps) {
  const today = todayIso();
  const [dayChoice, setDayChoice] = useState<NewTaskDayChoice>("today");
  const [pickedDate, setPickedDate] = useState(today);
  const [bucket, setBucket] = useState<Bucket>("later");

  useEffect(() => {
    if (!open) {
      return;
    }
    if (initialScheduledDate) {
      const stub = {
        scheduledDate: initialScheduledDate,
        bucket: initialBucket,
      } as Task;
      const fromTask = dayChoiceFromTask(stub, today);
      setDayChoice(fromTask.dayChoice);
      setPickedDate(fromTask.pickedDate);
      setBucket(initialBucket ?? "later");
      return;
    }
    setDayChoice("today");
    setPickedDate(today);
    setBucket("later");
  }, [open, initialScheduledDate, initialBucket, today]);

  function handleConfirm() {
    const scheduledDate = resolveScheduledDate(dayChoice, pickedDate, today);
    if (!scheduledDate) {
      return;
    }
    onConfirm({ scheduledDate, bucket });
    onOpenChange(false);
  }

  const scheduledPreview = resolveScheduledDate(dayChoice, pickedDate, today);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] gap-0 p-0">
        <DialogHeader className="gap-[5px] border-b border-rule px-5 py-[18px] pb-[14px]">
          <DialogTitle className="text-[15.5px] font-bold tracking-[-0.01em]">
            Schedule task
          </DialogTitle>
          <p className="text-[12.5px] text-muted-foreground line-clamp-2">
            {taskTitle}
          </p>
        </DialogHeader>
        <div className="px-5 py-[16px]">
          <TaskScheduleFields
            dayChoice={dayChoice}
            bucket={bucket}
            pickedDate={pickedDate}
            nowCount={nowCount}
            compact
            onDayChoiceChange={setDayChoice}
            onBucketChange={setBucket}
            onPickedDateChange={setPickedDate}
          />
        </div>
        <DialogFooter className="gap-3 border-t border-hair px-5 py-[13px] sm:justify-start">
          <Button
            type="button"
            disabled={!scheduledPreview}
            onClick={handleConfirm}
          >
            Schedule
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
