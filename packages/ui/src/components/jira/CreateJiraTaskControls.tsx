import { useEffect, useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import type { JiraIssue } from "@tudu/shared";
import {
  jiraApi,
  type AppDispatch,
  useCreateSubtaskMutation,
  useSpawnJiraTaskMutation,
  useSpawnReportJiraTaskMutation,
} from "@tudu/store";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { FormBusy } from "@/components/forms/FormBusy";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { jiraWikiToDisplayHtml } from "@/components/editor/wikiMarkup";
import { notifyAction } from "@/lib/notifyAction";

function jiraIssueDescriptionForTask(issue: JiraIssue): string {
  return jiraWikiToDisplayHtml(issue.description ?? "", issue.renderedDescription);
}

export type CreatedJiraTask = {
  id: string;
  scheduledDate: string | null;
};

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  return fallback;
}

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

export function SendJiraInboxDialog({
  issue,
  reportUserId,
  reportName,
  onOpenChange,
  onSent,
}: {
  issue: JiraIssue | null;
  reportUserId: string;
  reportName?: string;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [spawnReportTask, { isLoading: submitting }] =
    useSpawnReportJiraTaskMutation();
  const [error, setError] = useState<string | null>(null);
  const first = reportName?.split(" ")[0];

  useEffect(() => {
    if (!issue) {
      return;
    }
    setTitle(issue.summary);
    setDescription(jiraIssueDescriptionForTask(issue));
    setError(null);
  }, [issue]);

  async function sendToInbox(event: FormEvent) {
    event.preventDefault();
    if (!issue) {
      return;
    }
    const trimmed = title.trim();
    if (!trimmed || submitting) {
      return;
    }
    setError(null);
    try {
      await notifyAction(
        () =>
          spawnReportTask({
            issueId: issue.id,
            title: trimmed,
            description: description.trim() ? description.trim() : null,
            scheduledDate: null,
            bucket: null,
            startDate: null,
            deadline: deadlineIso(issue.dueDate),
            projectId: null,
            reportUserId,
          }).unwrap(),
        {
          success: `Sent to ${first ? `${first}'s` : "their"} inbox`,
          error: "Could not create the linked task",
        },
      );
      dispatch(jiraApi.util.invalidateTags(["JiraIssue"]));
      onSent?.();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not create the linked task"));
    }
  }

  return (
    <Dialog open={issue !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[420px] gap-0 border-rule bg-card p-0"
      >
        <div className="border-b border-rule px-[20px] py-[14px]">
          <DialogTitle className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Send to inbox
          </DialogTitle>
        </div>
        <form className="space-y-[12px] px-[20px] py-[16px]" onSubmit={(event) => void sendToInbox(event)}>
          <FormBusy busy={submitting} className="space-y-[12px]">
          <p className="text-[12.5px] text-muted-foreground">
            Sends a linked task to {reportName || "this report"}'s Inbox.
          </p>
          <input
            value={title}
            aria-label="New task title"
            className="w-full border border-rule bg-transparent px-[9px] py-[7px] text-[12.5px] outline-none"
            onChange={(event) => setTitle(event.target.value)}
          />
          <RichTextEditor
            mode="html"
            value={description}
            placeholder="Optional task note"
            aria-label="New task description"
            readOnly={submitting}
            onChange={setDescription}
          />
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          <div className="flex items-center justify-end gap-[10px] pt-[4px]">
            <button
              type="button"
              className="border border-rule px-[13px] py-[7px] text-[12.5px] text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <Button
              type="submit"
              loading={submitting}
              disabled={!title.trim()}
              className="h-auto bg-primary px-[11px] py-[6px] text-[12px] font-bold"
            >
              Send to inbox
            </Button>
          </div>
          </FormBusy>
        </form>
      </DialogContent>
    </Dialog>
  );
}
