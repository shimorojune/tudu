import { useMemo, useState } from "react";
import { type ProjectColor } from "@tudu/shared";
import {
  selectVisible,
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useGetProjectsQuery,
  useUpdateProjectMutation,
} from "@tudu/store";
import { useSelector } from "react-redux";
import { Button } from "@/components/ui/button";
import { FormBusy } from "@/components/forms/FormBusy";
import {
  ProjectColorSwatches,
  ProjectSettingsRow,
} from "@/components/settings/ProjectSettingsRow";
import { notifyAction, mutationResult } from "@/lib/notifyAction";
import { cn } from "@/lib/utils";

function ProjectsSectionHeader({
  title,
  count,
  strongRule,
}: {
  title: string;
  count: number;
  strongRule?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-[10px] pb-[7px]",
        strongRule ? "border-b-2 border-rule" : "border-b border-rule",
      )}
    >
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        {title}
      </div>
      <span className="text-[11.5px] text-faint">{count}</span>
    </div>
  );
}

export function ProjectsSettingsPanel() {
  const { data: projects = [], isLoading } = useGetProjectsQuery();
  const replica = useSelector(selectVisible);
  const [createProject, createState] = useCreateProjectMutation();
  const [updateProject] = useUpdateProjectMutation();
  const [deleteProject, deleteState] = useDeleteProjectMutation();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>("ember");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of Object.values(replica.tasks)) {
      const projectId = task.project?.id;
      if (!projectId) {
        continue;
      }
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
    }
    return counts;
  }, [replica.tasks]);

  const inPickers = useMemo(
    () => projects.filter((project) => project.archivedAt === null),
    [projects],
  );
  const archived = useMemo(
    () => projects.filter((project) => project.archivedAt !== null),
    [projects],
  );

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    try {
      await notifyAction(
        () => mutationResult(createProject({ name: trimmed, color })),
        { success: "Project created", error: "Could not create that project" },
      );
      setName("");
    } catch {
      setError("Could not create that project");
    }
  }

  function finishRename(projectId: string, previousName: string) {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== previousName) {
      void notifyAction(
        () =>
          mutationResult(
            updateProject({
              id: projectId,
              patch: { name: trimmed },
            }),
          ),
        { success: "Project updated", error: "Could not update the project" },
      );
    }
    setEditingId(null);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[22px] px-[30px] py-[26px]">
        <div className="flex flex-col gap-[9px]">
          <div className="h-[12px] w-[80px] bg-hair" />
          <div className="h-[40px] w-full max-w-[480px] bg-hair" />
        </div>
        <div className="h-[100px] w-full border border-hair bg-hair/30" />
        <div className="flex flex-col gap-[8px]">
          <div className="h-[24px] w-[140px] bg-hair" />
          <div className="h-[44px] w-full bg-hair" />
          <div className="h-[44px] w-full bg-hair" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-[22px] overflow-y-auto px-[30px] py-[26px]">
      <div className="flex flex-col gap-[9px]">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          Projects
        </div>
        <p className="max-w-[520px] text-[13px] leading-[1.6] text-muted-foreground">
          A sticker, not a folder: one per task or none. Archiving keeps the chip
          on old tasks; private hides it from your manager.
        </p>
      </div>

      <form
        className="flex flex-col gap-[13px] border border-rule bg-background p-[14px] px-[16px]"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <FormBusy
          busy={Boolean(createState?.isLoading)}
          className="flex flex-col gap-[13px]"
        >
          <div className="flex items-center gap-[10px]">
            <input
              value={name}
              placeholder="New project"
              aria-label="New project name"
              className="min-w-0 flex-1 border border-foreground bg-card px-[11px] py-[8px] text-[13.5px] outline-none"
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              loading={Boolean(createState?.isLoading)}
              disabled={!name.trim()}
              className="h-auto shrink-0 bg-primary px-[16px] py-[9px] text-[12.5px] font-bold text-primary-foreground"
            >
              Create
            </Button>
          </div>
          <ProjectColorSwatches selected={color} onSelect={setColor} />
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        </FormBusy>
      </form>

      <div className="flex flex-col gap-[2px]">
        <ProjectsSectionHeader
          title="In the pickers"
          count={inPickers.length}
          strongRule
        />
        <ul className="flex flex-col">
          {inPickers.map((project) => (
            <ProjectSettingsRow
              key={project.id}
              project={project}
              variant="active"
              taskCount={taskCounts.get(project.id) ?? 0}
              editing={editingId === project.id}
              editName={editName}
              deleteLoading={false}
              onEditNameChange={setEditName}
              onStartRename={() => {
                setEditingId(project.id);
                setEditName(project.name);
              }}
              onFinishRename={() => finishRename(project.id, project.name)}
              onCancelRename={() => setEditingId(null)}
              onUpdate={(patch) => updateProject({ id: project.id, patch })}
              onDelete={() => deleteProject(project.id)}
            />
          ))}
        </ul>
      </div>

      {archived.length > 0 ? (
        <div className="flex flex-col gap-[2px]">
          <ProjectsSectionHeader title="Archived" count={archived.length} />
          <ul className="flex flex-col">
            {archived.map((project) => (
              <ProjectSettingsRow
                key={project.id}
                project={project}
                variant="archived"
                taskCount={taskCounts.get(project.id) ?? 0}
                editing={false}
                editName=""
                deleteLoading={Boolean(deleteState?.isLoading)}
                onEditNameChange={() => {}}
                onStartRename={() => {}}
                onFinishRename={() => {}}
                onCancelRename={() => {}}
                onUpdate={(patch) => updateProject({ id: project.id, patch })}
                onDelete={() => deleteProject(project.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-auto text-[12.5px] leading-[1.6] text-faint">
        Deleting a project strips its chip. The tasks stay. Archive first: only
        archived projects can be deleted.
      </p>
    </div>
  );
}
