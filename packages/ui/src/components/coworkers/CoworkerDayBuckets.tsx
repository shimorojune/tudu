import { BUCKETS, type Bucket, type CoworkerDayTask } from "@tudu/shared";
import { bucketLabel } from "@/lib/buckets";
import { cn } from "@/lib/utils";

export type CoworkerDayBucketsProps = {
  tasks: CoworkerDayTask[];
  nowCount: number;
  nowCap: number;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onProposeChange: (task: CoworkerDayTask, field: "title" | "complete" | "bucket") => void;
};

function tasksInBucket(tasks: CoworkerDayTask[], bucket: Bucket) {
  return tasks.filter(
    (task) => task.bucket === bucket && task.completedAt === null,
  );
}

function completedTasks(tasks: CoworkerDayTask[]) {
  return tasks.filter((task) => task.completedAt !== null);
}

export function CoworkerDayBuckets({
  tasks,
  nowCount,
  nowCap,
  selectedTaskId,
  onSelectTask,
  onProposeChange,
}: CoworkerDayBucketsProps) {
  const completed = completedTasks(tasks);

  return (
    <div className="flex flex-col gap-[28px]">
      {BUCKETS.map((bucket) => {
        const bucketTasks = tasksInBucket(tasks, bucket);
        const label = bucketLabel(bucket, true);
        const capLabel =
          bucket === "now"
            ? ` (${nowCount} / ${nowCap})`
            : "";
        return (
          <section key={bucket}>
            <h2 className="mb-[10px] px-[4px] text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {label}
              {capLabel}
            </h2>
            {bucketTasks.length === 0 ? (
              <p className="px-[4px] text-[12.5px] text-faint">Nothing here</p>
            ) : (
              <ul className="border border-hair">
                {bucketTasks.map((task) => (
                  <li
                    key={task.id}
                    className={cn(
                      "border-b border-hair last:border-b-0",
                      selectedTaskId === task.id && "bg-foreground/[0.04]",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-[16px] py-[12px] text-left"
                      onClick={() => onSelectTask(task.id)}
                    >
                      <span className="min-w-0 flex-1 text-[14px] font-medium">
                        {task.title}
                      </span>
                    </button>
                    <div className="flex flex-wrap gap-2 px-[16px] pb-[10px]">
                      <button
                        type="button"
                        className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground hover:text-foreground"
                        onClick={() => onProposeChange(task, "title")}
                      >
                        Propose retitle
                      </button>
                      <button
                        type="button"
                        className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground hover:text-foreground"
                        onClick={() => onProposeChange(task, "complete")}
                      >
                        Propose complete
                      </button>
                      {bucket !== "now" ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground hover:text-foreground"
                          onClick={() => onProposeChange(task, "bucket")}
                        >
                          Propose move to Now
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {completed.length > 0 ? (
        <section>
          <h2 className="mb-[10px] px-[4px] text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Completed
          </h2>
          <ul className="border border-hair">
            {completed.map((task) => (
              <li key={task.id} className="border-b border-hair last:border-b-0">
                <button
                  type="button"
                  className="w-full px-[16px] py-[12px] text-left text-[14px] text-muted-foreground line-through"
                  onClick={() => onSelectTask(task.id)}
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
