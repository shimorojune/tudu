import { useMemo } from "react";
import { toast } from "sonner";
import { BUCKETS, type Bucket, type Task } from "@tudu/shared";
import { todayIso } from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";
import { AddTaskRow } from "@/components/tasks/AddTaskRow";
import { BucketSection } from "@/components/tasks/BucketSection";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DayTaskListProps = {
  tasks: Task[];
  selectedDate: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
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

export function DayTaskList({
  tasks,
  selectedDate,
  selectedTaskId,
  onSelectTask,
}: DayTaskListProps) {
  const isToday = selectedDate === todayIso();
  const grouped = useMemo(() => tasksByBucket(tasks), [tasks]);

  const showNowClearPrompt =
    isToday && grouped.now.length === 0 && grouped.next.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {BUCKETS.map((bucket) => (
          <BucketSection
            key={bucket}
            bucket={bucket}
            label={bucketLabel(bucket, isToday)}
            tasks={grouped[bucket]}
            selectedTaskId={selectedTaskId}
            selectedDate={selectedDate}
            onSelectTask={onSelectTask}
            showNowHelper={bucket === "now" && isToday}
            showNowClearPrompt={bucket === "now" && showNowClearPrompt}
            onNowClearPrompt={() => {
              toast("Pull into Now lands in step 4");
            }}
          />
        ))}
      </ScrollArea>
      <AddTaskRow />
    </div>
  );
}
