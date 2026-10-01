import type { ReactNode } from "react";
import { ProjectFilter } from "@/components/projects/ProjectFilter";
import { cn } from "@/lib/utils";

export type TaskListHeaderProps = {
  children?: ReactNode;
  className?: string;
  "data-panel-id"?: string;
};

export function TaskListHeader({
  children,
  className,
  "data-panel-id": dataPanelId,
}: TaskListHeaderProps) {
  return (
    <div
      data-testid="task-list-header"
      data-panel-id={dataPanelId}
      className={cn(
        "flex shrink-0 items-center justify-between gap-[10px] border-b border-hair px-[18px] py-[10px]",
        "max-xl:sticky max-xl:top-0 max-xl:z-20 max-xl:bg-background",
        className,
      )}
    >
      <ProjectFilter />
      {children ? <div className="ml-auto flex items-center gap-[8px]">{children}</div> : null}
    </div>
  );
}
