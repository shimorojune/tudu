import { useEffect } from "react";
import type { Task } from "@tudu/shared";
import { copyTaskKeyToClipboard } from "@/lib/copyTaskKey";

export function useCopyTaskKeyShortcut(task: Task | null | undefined) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!task) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "c") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.closest("[data-task-key-shortcut-ignore]"))
      ) {
        return;
      }
      event.preventDefault();
      void copyTaskKeyToClipboard(task.taskKey);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [task]);
}
