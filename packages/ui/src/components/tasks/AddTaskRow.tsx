import { Plus } from "lucide-react";

export function AddTaskRow() {
  return (
    <div className="mt-auto flex items-center gap-[12px] border-t border-hair px-[28px] py-[16px]">
      <Plus size={15} strokeWidth={1.8} className="text-ghost" aria-hidden />
      <span className="text-[14px] text-faint">
        Add a task, or paste a JIRA key to link one
      </span>
      <span className="ml-auto font-mono text-[11.5px] text-ghost">⌘N</span>
    </div>
  );
}
