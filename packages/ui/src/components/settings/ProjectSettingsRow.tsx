import { useState } from "react";
import { type Project, type ProjectColor } from "@tudu/shared";
import {
  ColourPicker,
  type ColourClash,
} from "@/components/ui-custom/ColourPicker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { projectColorCss } from "@/lib/brand";
import { notifyAction, mutationResult } from "@/lib/notifyAction";
import { cn } from "@/lib/utils";

type ProjectSettingsRowProps = {
  project: Project;
  variant: "active" | "archived";
  taskCount: number;
  editing: boolean;
  editName: string;
  deleteLoading: boolean;
  onEditNameChange: (value: string) => void;
  onStartRename: () => void;
  onFinishRename: () => void;
  onCancelRename: () => void;
  onUpdate: (patch: {
    name?: string;
    color?: ProjectColor;
    archived?: boolean;
    isPrivate?: boolean;
  }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  colourClashes?: ColourClash[];
};

function taskCountLabel(count: number): string {
  return count === 1 ? "1 task" : `${count} tasks`;
}

export function ProjectSettingsRow({
  project,
  variant,
  taskCount,
  editing,
  editName,
  deleteLoading,
  onEditNameChange,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onUpdate,
  onDelete,
  colourClashes = [],
}: ProjectSettingsRowProps) {
  const [colourOpen, setColourOpen] = useState(false);
  const archived = variant === "archived";

  return (
    <li
      className={cn(
        "group flex items-center gap-[11px] border-b border-hair px-[2px] py-[11px]",
        !archived && "hover:bg-tint hover:px-[8px] hover:-mx-[6px] focus-within:bg-tint focus-within:px-[8px] focus-within:-mx-[6px]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-[9px] shrink-0",
          archived && "opacity-45",
        )}
        style={{ backgroundColor: projectColorCss(project.color) }}
      />
      {editing ? (
        <input
          value={editName}
          aria-label={`Rename ${project.name}`}
          className="min-w-0 flex-1 border border-foreground bg-card px-[11px] py-[8px] text-[13.5px] outline-none"
          autoFocus
          onChange={(event) => onEditNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onFinishRename();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            }
          }}
          onBlur={() => onFinishRename()}
        />
      ) : (
        <span
          className={cn(
            "text-[14px] font-semibold whitespace-nowrap",
            archived && "text-muted-foreground",
          )}
        >
          {project.name}
        </span>
      )}
      {!archived && project.isPrivate ? (
        <span className="text-[12px] text-faint whitespace-nowrap">Private</span>
      ) : null}

      {archived ? (
        <div className="ml-auto flex items-center gap-[14px] text-[12px] text-muted-foreground">
          <span className="text-faint tabular-nums whitespace-nowrap">
            {taskCountLabel(taskCount)}
          </span>
          <button
            type="button"
            className="whitespace-nowrap hover:text-foreground"
            onClick={() => {
              void onUpdate({ archived: false });
            }}
          >
            Unarchive
          </button>
          <Button
            type="button"
            variant="ghost"
            loading={deleteLoading}
            className="h-auto px-0 text-[12px] font-normal text-primary-text hover:text-primary-text"
            onClick={() => {
              void notifyAction(
                () => mutationResult(onDelete()),
                {
                  success: "Project deleted",
                  error: "Could not delete the project",
                },
              );
            }}
          >
            Delete
          </Button>
        </div>
      ) : (
        <div className="ml-auto flex min-h-[18px] items-center">
          <span
            className={cn(
              "text-[12.5px] text-faint tabular-nums whitespace-nowrap group-hover:hidden group-focus-within:hidden max-md:hidden",
              editing && "hidden",
            )}
          >
            {taskCountLabel(taskCount)}
          </span>
          {!editing ? (
            <div
              className="hidden max-md:flex items-center gap-[14px] text-[12px] text-muted-foreground group-hover:flex group-focus-within:flex"
            >
              <button
                type="button"
                className="whitespace-nowrap hover:text-foreground"
                onClick={onStartRename}
              >
                Rename
              </button>
              <Popover open={colourOpen} onOpenChange={setColourOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="whitespace-nowrap hover:text-foreground"
                  >
                    Colour
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto border-0 bg-transparent p-0 shadow-none">
                  <ColourPicker
                    compact
                    label="Colour"
                    value={project.color}
                    clashes={colourClashes}
                    onChange={(key) => {
                      void onUpdate({ color: key });
                      setColourOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                className="whitespace-nowrap hover:text-foreground"
                onClick={() => {
                  void onUpdate({ isPrivate: !project.isPrivate });
                }}
              >
                {project.isPrivate ? "Make public" : "Make private"}
              </button>
              <button
                type="button"
                className="whitespace-nowrap hover:text-foreground"
                onClick={() => {
                  void onUpdate({ archived: true });
                }}
              >
                Archive
              </button>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

