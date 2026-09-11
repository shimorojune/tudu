import type { ProjectRef } from "@tudu/shared";
import { projectColorCss } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type ProjectChipProps = {
  project: ProjectRef;
  compact?: boolean;
  className?: string;
};

export function ProjectChip({
  project,
  compact = false,
  className,
}: ProjectChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] text-[11px] leading-none",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-[8px] shrink-0"
        style={{ backgroundColor: projectColorCss(project.color) }}
      />
      {compact ? (
        <span className="sr-only">{project.name}</span>
      ) : (
        <span className="truncate">{project.name}</span>
      )}
    </span>
  );
}
