import { useMemo, useState } from "react";
import {
  filterProjectsForSpace,
  nextFreeColor,
  type CreateProjectRequest,
  type Project,
  type ProjectColor,
  type ProjectRef,
  type ProjectSpaceFilter,
} from "@tudu/shared";
import { ColourPicker, type ColourClash } from "@/components/ui-custom/ColourPicker";
import { useCreateProjectMutation, useGetProjectsQuery } from "@tudu/store";
import { useProjectSpaceScope } from "@/hooks/useProjectSpaceScope";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ProjectPickerProps = {
  value: string | null;
  onChange: (projectId: string | null) => void;
  readOnly?: boolean;
  id?: string;
  triggerClassName?: string;
  /** Tight chip trigger and in-panel menu (Quick Add window). */
  compact?: boolean;
  projects?: Project[];
  onCreate?: (
    body: CreateProjectRequest,
  ) => Promise<{ project: { id: string } }>;
  fallback?: ProjectRef | null;
  spaceScope?: ProjectSpaceFilter;
};

export function ProjectPicker({
  value,
  onChange,
  readOnly = false,
  id,
  triggerClassName,
  compact = false,
  projects: projectsProp,
  onCreate,
  fallback = null,
  spaceScope,
}: ProjectPickerProps) {
  const { data: ownProjects = [] } = useGetProjectsQuery({
    skip: projectsProp !== undefined,
  });
  const space = useProjectSpaceScope(spaceScope);
  const scopedProjects = useMemo(
    () => filterProjectsForSpace(projectsProp ?? ownProjects, space),
    [projectsProp, ownProjects, space],
  );
  const projects = scopedProjects;
  const [createProject, { isLoading }] = useCreateProjectMutation();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>("vermilion");

  const live = useMemo(
    () => projects.filter((project) => project.archivedAt === null),
    [projects],
  );
  const colourClashes = useMemo((): ColourClash[] => {
    const seen = new Set<ProjectColor>();
    const clashes: ColourClash[] = [];
    for (const project of live) {
      if (seen.has(project.color)) {
        continue;
      }
      seen.add(project.color);
      clashes.push({
        color: project.color,
        shortCode: project.name.slice(0, 3).toUpperCase(),
      });
    }
    return clashes;
  }, [live]);
  const selected =
    live.find((project) => project.id === value) ??
    projects.find((project) => project.id === value) ??
    (fallback && fallback.id === value ? fallback : null);

  if (readOnly) {
    return selected ? <ProjectChip project={selected} /> : <span>None</span>;
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || isLoading) {
      return;
    }
    const body: CreateProjectRequest = {
      name: trimmed,
      color,
      orgId: space.kind === "org" ? space.orgId : null,
    };
    const result = onCreate
      ? await onCreate(body)
      : await createProject(body).unwrap();
    onChange(result.project.id);
    setCreating(false);
    setName("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreating(false);
        }
      }}
    >
      <PopoverTrigger
        id={id}
        type="button"
        className={cn(
          "inline-flex items-center gap-[8px] border border-hair px-[10px] py-[5px] text-[12.5px] hover:border-foreground",
          compact
            ? "max-w-[200px] truncate"
            : "max-w-full",
          triggerClassName,
        )}
        aria-label="Project"
      >
        {selected ? (
          <ProjectChip project={selected} />
        ) : compact ? (
          "No project"
        ) : (
          "None"
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={compact ? "top" : "bottom"}
        collisionPadding={8}
        portalled={!compact}
        className={cn(
          "w-[240px] border-rule bg-card p-0 shadow-none",
          compact && "max-h-[min(180px,40vh)] overflow-y-auto",
        )}
      >
        {creating ? (
          <div className="flex flex-col gap-[10px] p-[12px]">
            <input
              autoFocus
              value={name}
              placeholder="Project name"
              aria-label="New project name"
              className="border border-rule bg-transparent px-[8px] py-[6px] text-[13px] outline-none"
              onChange={(event) => setName(event.target.value)}
            />
            <ColourPicker
              compact
              label="Colour"
              value={color}
              clashes={colourClashes}
              onChange={setColor}
            />
            <div className="flex gap-[8px]">
              <button
                type="button"
                className="text-[12px] text-muted-foreground"
                onClick={() => setCreating(false)}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!name.trim() || isLoading}
                className="ml-auto bg-foreground px-[10px] py-[5px] text-[12px] font-bold text-card disabled:opacity-50"
                onClick={() => {
                  void handleCreate();
                }}
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col py-[4px]">
            <button
              type="button"
              className={cn(
                "px-[12px] py-[7px] text-left text-[13px]",
                value === null && "font-semibold",
              )}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              None
            </button>
            {live.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(
                  "px-[12px] py-[7px] text-left",
                  project.id === value && "font-semibold",
                )}
                onClick={() => {
                  onChange(project.id);
                  setOpen(false);
                }}
              >
                <ProjectChip project={project} />
              </button>
            ))}
            <button
              type="button"
              className="border-t border-hair px-[12px] py-[8px] text-left text-[12.5px] text-muted-foreground"
              onClick={() => {
                setColor(nextFreeColor(live.map((project) => project.color)));
                setCreating(true);
              }}
            >
              New project
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
