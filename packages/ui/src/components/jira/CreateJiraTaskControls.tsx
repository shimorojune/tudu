import type { JiraIssue } from "@tudu/shared";
import {
  useCreateSubtaskMutation,
  useUpdateTaskMutation,
  useUploadTaskAttachmentMutation,
  useSpawnJiraTaskMutation,
} from "@tudu/store";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { jiraWikiToDisplayHtml } from "@/components/editor/wikiMarkup";
import { patchTaskDescriptionIfAttachmentsChanged } from "@/lib/afterCreateTaskDescription";
import { notifyAction } from "@/lib/notifyAction";

function jiraIssueDescriptionForTask(issue: JiraIssue): string {
  return jiraWikiToDisplayHtml(issue.description ?? "", issue.renderedDescription);
}

export type CreatedJiraTask = {
  id: string;
  scheduledDate: string | null;
};

function deadlineIso(date: string | null): string | null {
  return date ? `${date}T18:00:00.000Z` : null;
}

export function SpawnJiraTaskDialog({
  issue,
  selectedDate,
  nowCount,
  onOpenChange,
  onCreated,
}: {
  issue: JiraIssue | null;
  selectedDate: string;
  nowCount: number;
  onOpenChange: (open: boolean) => void;
  onCreated: (task: CreatedJiraTask) => void;
}) {
  const [spawnTask] = useSpawnJiraTaskMutation();
  const [createSubtask] = useCreateSubtaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();

  return (
    <NewTaskDialog
      open={issue !== null}
      initialBucket="later"
      initialDate={selectedDate}
      initialTitle={issue?.summary ?? ""}
      initialDescription={issue ? jiraIssueDescriptionForTask(issue) : ""}
      nowCount={nowCount}
      onOpenChange={onOpenChange}
      onSubmit={async (args) => {
        if (!issue) {
          return;
        }
        const result = await notifyAction(
          () =>
            spawnTask({
              issueId: issue.id,
              title: args.title,
              description: args.description,
              scheduledDate: args.scheduledDate,
              bucket: args.scheduledDate === null ? null : args.bucket,
              startDate: null,
              deadline: deadlineIso(issue.dueDate),
              projectId: args.projectId,
            }).unwrap(),
          {
            success: "Task created",
            error: "Could not create the linked task",
          },
        );
        await patchTaskDescriptionIfAttachmentsChanged(
          result.task.id,
          args.description,
          args.pendingAttachments,
          (input) => uploadTaskAttachment(input).unwrap(),
          (description) =>
            updateTask({ id: result.task.id, patch: { description } }).unwrap(),
        );
        for (const subtaskTitle of args.subtaskTitles) {
          await createSubtask({
            taskId: result.task.id,
            body: { title: subtaskTitle },
          }).unwrap();
        }
        onCreated({
          id: result.task.id,
          scheduledDate: args.scheduledDate,
        });
      }}
    />
  );
}
