import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PROJECT_COLORS, type ProjectColor } from "@tudu/shared";
import {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useGetProjectsQuery,
  useUpdateProjectMutation,
} from "@tudu/store";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { projectColorCss } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function ProjectsSettingsPanel() {
  const { data: projects = [], isLoading } = useGetProjectsQuery();
  const [createProject] = useCreateProjectMutation();
  const [updateProject] = useUpdateProjectMutation();
  const [deleteProject] = useDeleteProjectMutation();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>("ember");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    try {
      await createProject({ name: trimmed, color }).unwrap();
      setName("");
    } catch {
      setError("Could not create that project");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[10px] px-[30px] py-[26px]">
        <div className="h-[12px] w-[80px] bg-hair" />
        <div className="h-[28px] w-full bg-hair" />
        <div className="h-[28px] w-full bg-hair" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[30px] py-[26px]">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        Projects
      </div>
      <p className="mt-[10px] max-w-[420px] text-[13px] text-muted-foreground">
        A project is a sticker on a task. One or none. Archive hides it from
        pickers. Old chips stay. Private hides the chip from your manager.
      </p>

      <form
        className="mt-[22px] flex flex-col gap-[10px] border border-hair p-[14px]"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <input
          value={name}
          placeholder="New project"
          aria-label="New project name"
          className="border border-rule bg-transparent px-[10px] py-[7px] text-[14px] outline-none"
          onChange={(event) => setName(event.target.value)}
        />
        <div className="flex flex-wrap gap-[6px]">
          {PROJECT_COLORS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              className={cn(
                "size-[16px]",
                color === key && "outline outline-2 outline-foreground outline-offset-2",
              )}
              style={{ backgroundColor: projectColorCss(key) }}
              onClick={() => setColor(key)}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={!name.trim()}
          className="self-start bg-foreground px-[12px] py-[6px] text-[12.5px] font-bold text-card disabled:opacity-50"
        >
          Create
        </button>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      </form>

      <ul className="mt-[22px] flex flex-col">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center gap-[12px] border-b border-hair py-[12px]"
          >
            <ProjectChip project={project} />
            {project.archivedAt ? (
              <span className="text-[11px] text-faint">Archived</span>
            ) : null}
            {project.isPrivate ? (
              <span className="text-[11px] text-faint">Private</span>
            ) : (
              <span className="text-[11px] text-faint">Public</span>
            )}
            {editingId === project.id ? (
              <input
                value={editName}
                aria-label={`Rename ${project.name}`}
                className="min-w-0 flex-1 border border-rule px-[8px] py-[4px] text-[13px] outline-none"
                onChange={(event) => setEditName(event.target.value)}
              />
            ) : (
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="ml-auto text-[12px] text-muted-foreground hover:text-foreground"
              >
                Open
              </Link>
            )}
            {editingId === project.id ? (
              <button
                type="button"
                className="text-[12px] font-semibold"
                onClick={() => {
                  const trimmed = editName.trim();
                  if (trimmed && trimmed !== project.name) {
                    void updateProject({
                      id: project.id,
                      patch: { name: trimmed },
                    });
                  }
                  setEditingId(null);
                }}
              >
                Save
              </button>
            ) : (
              <button
                type="button"
                className="text-[12px] text-muted-foreground"
                onClick={() => {
                  setEditingId(project.id);
                  setEditName(project.name);
                }}
              >
                Rename
              </button>
            )}
            <div className="flex gap-[4px]">
              {PROJECT_COLORS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`Color ${project.name} ${key}`}
                  className={cn(
                    "size-[12px]",
                    project.color === key &&
                      "outline outline-1 outline-foreground outline-offset-1",
                  )}
                  style={{ backgroundColor: projectColorCss(key) }}
                  onClick={() => {
                    void updateProject({
                      id: project.id,
                      patch: { color: key },
                    });
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="text-[12px] text-muted-foreground"
              onClick={() => {
                void updateProject({
                  id: project.id,
                  patch: { archived: project.archivedAt === null },
                });
              }}
            >
              {project.archivedAt ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              className="text-[12px] text-muted-foreground"
              onClick={() => {
                void updateProject({
                  id: project.id,
                  patch: { isPrivate: !project.isPrivate },
                });
              }}
            >
              {project.isPrivate ? "Make public" : "Make private"}
            </button>
            {confirmingDeleteId === project.id ? (
              <div className="flex items-center gap-[8px]">
                <span className="text-[12px] text-muted-foreground">
                  Tasks stay. The chip comes off.
                </span>
                <button
                  type="button"
                  className="text-[12px] font-semibold text-destructive"
                  onClick={() => {
                    void deleteProject(project.id);
                    setConfirmingDeleteId(null);
                  }}
                >
                  Delete project
                </button>
                <button
                  type="button"
                  className="text-[12px] text-muted-foreground"
                  onClick={() => setConfirmingDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-[12px] text-muted-foreground"
                onClick={() => setConfirmingDeleteId(project.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
