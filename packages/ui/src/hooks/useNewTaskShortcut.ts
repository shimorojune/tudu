import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@tudu/store";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

function isDialogOpen(): boolean {
  return (
    document.querySelector("[role='dialog'],[role='alertdialog']") !== null
  );
}

type UseNewTaskShortcutOptions = {
  enabled?: boolean;
};

export function useNewTaskShortcut(
  onOpen: () => void,
  { enabled = true }: UseNewTaskShortcutOptions = {},
) {
  const addTaskRequest = useSelector((s: RootState) => s.day.addTaskRequest);
  const initialRequest = useRef(addTaskRequest);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (addTaskRequest !== initialRequest.current) {
      onOpenRef.current();
    }
  }, [addTaskRequest, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "n" && event.key !== "N") {
        return;
      }
      if (isTypingTarget(event.target) || isDialogOpen()) {
        return;
      }
      event.preventDefault();
      onOpenRef.current();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
