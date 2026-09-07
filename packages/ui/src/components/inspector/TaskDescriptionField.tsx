import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useUpdateTaskMutation } from "@tudu/store";
import { cn } from "@/lib/utils";

export type TaskDescriptionFieldProps = {
  taskId: string;
  description: string | null;
};

export function TaskDescriptionField({
  taskId,
  description,
}: TaskDescriptionFieldProps) {
  const [value, setValue] = useState(description ?? "");
  const lastSaved = useRef(description ?? "");
  const [updateTask] = useUpdateTaskMutation();

  useEffect(() => {
    const next = description ?? "";
    setValue(next);
    lastSaved.current = next;
  }, [description, taskId]);

  const debouncedSave = useDebouncedCallback((next: string) => {
    const trimmed = next.trim();
    const normalized = trimmed.length > 0 ? trimmed : null;
    if (normalized === (lastSaved.current.trim() || null)) {
      return;
    }
    lastSaved.current = normalized ?? "";
    void updateTask({ id: taskId, patch: { description: normalized } });
  }, 600);

  return (
    <textarea
      value={value}
      rows={3}
      placeholder="Add a description..."
      aria-label="Task description"
      className={cn(
        "mt-[14px] w-full resize-y border border-hair bg-transparent px-[12px] py-[10px]",
        "text-[13.5px] leading-[1.55] text-muted-foreground outline-none",
        "placeholder:text-faint focus:border-foreground focus:text-foreground",
      )}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        debouncedSave(next);
      }}
      onBlur={() => {
        debouncedSave.flush();
      }}
    />
  );
}
