import { Link2 } from "lucide-react";
import type { Task } from "@tudu/shared";
import { formatInMyDayPlacement } from "@/lib/jiraInMyDay";

export type JiraInMyDayLineProps = {
  tasks: Task[];
  selectedDate: string;
  extra?: string;
};

export function JiraInMyDayLine({
  tasks,
  selectedDate,
  extra,
}: JiraInMyDayLineProps) {
  const primary = tasks[0];
  if (!primary) {
    return null;
  }
  const placement = formatInMyDayPlacement(primary, selectedDate);
  if (!placement) {
    return null;
  }

  return (
    <p className="mt-[8px] flex flex-wrap items-center gap-[6px] text-[11.5px] text-primary-text">
      <span className="inline-flex items-center gap-[6px]">
        <Link2 size={12} strokeWidth={2} aria-hidden />
        <span>{placement}</span>
      </span>
      {extra ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{extra}</span>
        </>
      ) : null}
    </p>
  );
}
