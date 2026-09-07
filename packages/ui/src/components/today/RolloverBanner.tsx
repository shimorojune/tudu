import { DEFAULT_NOW_SOFT_CAP, type Task } from "@tudu/shared";
import { X } from "lucide-react";
import { isRecapDismissed } from "@/lib/rolloverState";

export type RolloverBannerProps = {
  tasks: Task[];
  effectiveDay: string;
  nowSoftCap?: number;
  onPushAllToLater: () => void;
  onDismiss: () => void;
};

function recapCopy(args: {
  carriedCount: number;
  nowCount: number;
  nowSoftCap: number;
  overCap: boolean;
  allOneDay: boolean;
}): string {
  const taskWord = args.carriedCount === 1 ? "task" : "tasks";
  const fromPhrase = args.allOneDay ? "from yesterday" : "from earlier days";
  const base = `${args.carriedCount} ${taskWord} came with you ${fromPhrase}, so Now holds ${args.nowCount} of ${args.nowSoftCap}.`;

  if (args.overCap) {
    return `${base} Something here will slip. Decide which now, not at 17:00.`;
  }

  return base;
}

export function RolloverBanner({
  tasks,
  effectiveDay,
  nowSoftCap = DEFAULT_NOW_SOFT_CAP,
  onPushAllToLater,
  onDismiss,
}: RolloverBannerProps) {
  const carriedTasks = tasks.filter((task) => task.carriedDays > 0);
  const carriedCount = carriedTasks.length;

  if (carriedCount === 0 || isRecapDismissed(effectiveDay)) {
    return null;
  }

  const nowCount = tasks.filter(
    (task) => task.bucket === "now" && task.completedAt === null,
  ).length;
  const overCap = nowCount > nowSoftCap;
  const allOneDay = carriedTasks.every((task) => task.carriedDays === 1);
  const copy = recapCopy({
    carriedCount,
    nowCount,
    nowSoftCap,
    overCap,
    allOneDay,
  });

  const carriedNowCount = carriedTasks.filter(
    (task) => task.bucket === "now",
  ).length;

  return (
    <div
      className="flex items-center gap-[16px] border-b border-hair bg-[#f6f4f3] px-[28px] py-[13px]"
      role="status"
    >
      <span className="inline-flex shrink-0 gap-[3px]" aria-hidden>
        <span
          className="size-[5px] bg-foreground"
          style={{ borderRadius: "50%" }}
        />
        <span
          className="size-[5px] bg-foreground"
          style={{ borderRadius: "50%" }}
        />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-[1.45] text-muted-foreground">
        {copy.split(/(\d+ of \d+)/).map((part, index) =>
          /^\d+ of \d+$/.test(part) ? (
            <span key={index} className="font-bold text-foreground">
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </p>
      {overCap && carriedNowCount > 0 ? (
        <div className="flex shrink-0 items-center gap-[8px]">
          <button
            type="button"
            className="bg-primary px-[12px] py-[6px] text-[12.5px] font-bold text-primary-foreground"
            onClick={onPushAllToLater}
          >
            Push all to Later
          </button>
          <button
            type="button"
            className="border border-rule px-[12px] py-[5px] text-[12.5px] text-muted-foreground"
            onClick={onDismiss}
          >
            Keep {nowCount}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="shrink-0 text-ghost"
        aria-label="Dismiss rollover recap"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
