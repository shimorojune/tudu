import type { TaskOrgBadge } from "@/components/tasks/TaskRow";

export type TaskOrgChipProps = {
  badge: TaskOrgBadge;
};

export function TaskOrgChip({ badge }: TaskOrgChipProps) {
  return (
    <span
      className="inline-flex max-w-[140px] shrink-0 items-center gap-[5px] border border-hair px-[6px] py-[2px] text-[10.5px] font-bold leading-[1.2] text-foreground"
      title={badge.name}
    >
      <span
        className="size-[8px] shrink-0"
        style={{ backgroundColor: badge.color }}
        aria-hidden
      />
      <span className="truncate">{badge.name}</span>
    </span>
  );
}
