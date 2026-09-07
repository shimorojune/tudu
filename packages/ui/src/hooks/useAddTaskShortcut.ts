import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@tudu/store";

export function useAddTaskShortcut(
  inputRef: React.RefObject<HTMLInputElement | null>,
  onSummon?: () => void,
) {
  const addTaskRequest = useSelector((s: RootState) => s.day.addTaskRequest);
  const initialRequest = useRef(addTaskRequest);
  const onSummonRef = useRef(onSummon);
  onSummonRef.current = onSummon;

  useEffect(() => {
    if (addTaskRequest !== initialRequest.current) {
      inputRef.current?.focus();
      onSummonRef.current?.();
    }
  }, [addTaskRequest, inputRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "n") {
        event.preventDefault();
        inputRef.current?.focus();
        onSummonRef.current?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputRef]);
}
