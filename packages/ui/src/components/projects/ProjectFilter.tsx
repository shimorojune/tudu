import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSelector } from "react-redux";
import {
  todayIso,
  useGetProjectsQuery,
  useGetReportDayQuery,
  useGetReportProjectsQuery,
  type RootState,
} from "@tudu/store";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { useProjectFilterId } from "@/hooks/useProjectFilterId";
import { mergeReportFilterProjects } from "@/lib/projectFilter";
import { reportUserIdFromPath } from "@/lib/reportPath";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ProjectFilter() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const selectedId = useProjectFilterId();
  const reportUserId = reportUserIdFromPath(pathname);
  const selectedDate =
    useSelector((state: RootState) => state.day.selectedDate) || todayIso();
  const { data: ownProjects = [] } = useGetProjectsQuery({
    skip: Boolean(reportUserId),
  });
  const { data: reportProjects = [] } = useGetReportProjectsQuery(
    reportUserId ?? "",
    { skip: !reportUserId },
  );
  const { data: reportDay } = useGetReportDayQuery(
    { userId: reportUserId ?? "", date: selectedDate },
    { skip: !reportUserId },
  );
  const projects = reportUserId
    ? mergeReportFilterProjects(reportProjects, reportDay?.tasks ?? [])
    : ownProjects;
  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const options = reportUserId
    ? projects
    : projects.filter((project) => {
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
      to: pathname,
      search: next,
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={selected ? `Filter: ${selected.name}` : "All projects"}
        className="inline-flex max-w-[140px] shrink-0 items-center gap-[6px] border border-hair px-[8px] py-[5px] text-[12px] text-muted-foreground hover:border-foreground hover:text-foreground xl:max-w-[180px]"
      >
        {selected ? (
          <>
            <span className="xl:hidden">
              <ProjectChip project={selected} compact />
            </span>
            <span className="hidden xl:inline">
              <ProjectChip project={selected} />
            </span>
          </>
        ) : (
          <>
            <span className="xl:hidden">All</span>
            <span className="hidden xl:inline">All projects</span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[200px] border-rule bg-card p-0 shadow-none"
      >
        <div className="flex flex-col py-[4px]">
          <button
            type="button"
            className={cn(
              "px-[12px] py-[7px] text-left text-[13px]",
              !selectedId && "font-semibold",
            )}
            onClick={() => setProject(undefined)}
          >
            All projects
          </button>
          {options.map((project) => (
            <button
              key={project.id}
              type="button"
              className={cn(
                "px-[12px] py-[7px] text-left",
                project.id === selectedId && "font-semibold",
              )}
              onClick={() => setProject(project.id)}
            >
              <ProjectChip project={project} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
