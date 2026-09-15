import { useCallback, useState } from "react";
import type { CreatedJiraTask } from "@/components/jira/CreateJiraTaskControls";

export function useJiraPreview() {
  const [previewIssueKey, setPreviewIssueKey] = useState<string | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [jiraSheetOpen, setJiraSheetOpen] = useState(false);

  const clearPreview = useCallback(() => {
    setPreviewIssueKey(null);
  }, []);

  const openJiraSheet = useCallback(() => {
    setJiraSheetOpen(true);
  }, []);

  const closeJiraSheet = useCallback(() => {
    setJiraSheetOpen(false);
    setPreviewIssueKey(null);
  }, []);

  const handleCreatedTask = useCallback(
    (
      task: CreatedJiraTask,
      args: {
        selectedDate: string;
        onSelectDate: (date: string) => void;
        onSelectTask: (id: string) => void;
      },
    ) => {
      if (!task.id) {
        return;
      }
      if (task.scheduledDate && task.scheduledDate !== args.selectedDate) {
        args.onSelectDate(task.scheduledDate);
      }
      args.onSelectTask(task.id);
      setHighlightTaskId(task.id);
      setPreviewIssueKey(null);
    },
    [],
  );

  return {
    previewIssueKey,
    setPreviewIssueKey,
    highlightTaskId,
    jiraSheetOpen,
    clearPreview,
    openJiraSheet,
    closeJiraSheet,
    handleCreatedTask,
  };
}
