import { useRef } from "react";
import { Plus } from "lucide-react";
import { useAddTaskShortcut } from "@/hooks/useAddTaskShortcut";

export type AddTaskRowProps = {
  onSubmit: (title: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

function flashRow(row: HTMLDivElement | null) {
  if (!row) {
    return;
  }
  row.classList.remove("add-task-flash");
  void row.offsetWidth;
  row.classList.add("add-task-flash");
}

export function AddTaskRow({ onSubmit, inputRef: externalRef }: AddTaskRowProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = externalRef ?? internalRef;

  useAddTaskShortcut(inputRef, () => flashRow(rowRef.current));

  return (
    <div
      ref={rowRef}
      className="mt-auto flex cursor-text items-center gap-[12px] border-t border-hair px-[28px] py-[16px]"
      onClick={() => inputRef.current?.focus()}
      onAnimationEnd={(event) => {
        if (event.animationName === "add-task-flash") {
          event.currentTarget.classList.remove("add-task-flash");
        }
      }}
    >
      <Plus size={15} strokeWidth={1.8} className="text-ghost" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        placeholder="Add a task, or paste a JIRA key to link one"
        className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const title = event.currentTarget.value.trim();
            if (title) {
              onSubmit(title);
              event.currentTarget.value = "";
            }
          }
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
      />
      <span className="ml-auto font-mono text-[11.5px] text-ghost">⌘N</span>
    </div>
  );
}
