import { useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSelector } from "react-redux";
import { filterProjectsForSpace } from "@tudu/shared";
import { useGetProjectsQuery, type RootState } from "@tudu/store";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { useProjectFilterId } from "@/hooks/useProjectFilterId";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ProjectFilter() {
  const navigate = useNavigate();
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const selectedId = useProjectFilterId();
  const space = useSelector((state: RootState) => state.space.current);
  const { data: projects = [] } = useGetProjectsQuery();
  const scoped = useMemo(
    () => filterProjectsForSpace(projects, space),
    [projects, space],
  );
  const selected = scoped.find((project) => project.id === selectedId) ?? null;
  const options = scoped.filter((project) => {
    if (project.archivedAt === null) {
      return true;
    }
    return project.id === selectedId;
  });

  function setProject(projectId: string | undefined) {
    const next = { ...search, project: projectId };
    if (!projectId) {
      delete next.project;
    }
    void navigate({
      search: next as never,
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          "flex h-[30px] max-w-[180px] items-center gap-[6px] border border-rule bg-card px-[10px] text-[12px] font-medium text-foreground",
          !selected && "text-muted-foreground",
        )}
      >
        {selected ? (
          <ProjectChip project={selected} compact />
        ) : (
          <span>All projects</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-[6px]">
        <button
          type="button"
          className="flex w-full px-[8px] py-[6px] text-left text-[12.5px] hover:bg-hair"
          onClick={() => setProject(undefined)}
        >
          All projects
        </button>
        {options.map((project) => (
          <button
            key={project.id}
            type="button"
            className="flex w-full px-[8px] py-[6px] text-left hover:bg-hair"
            onClick={() => setProject(project.id)}
          >
            <ProjectChip project={project} compact />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
