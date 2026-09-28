import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { JiraIssue, JiraUser, Task } from "@tudu/shared";
import {
  jiraApi,
  type AppDispatch,
  useCreateJiraCommentMutation,
  useGetJiraCommentsRestQuery,
  useGetJiraIssueRestQuery,
  useLazySearchJiraUsersQuery,
  useLinkJiraTaskMutation,
  useUnlinkJiraTaskMutation,
  useUpdateJiraIssueFieldsMutation,
} from "@tudu/store";
import { useDispatch } from "react-redux";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  JiraCommentsSkeleton,
  JiraIssuePreviewSkeleton,
} from "@/components/loading/JiraSkeletons";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { FormBusy } from "@/components/forms/FormBusy";
import {
  jiraWikiToDisplayHtml,
  sanitizeJiraRenderedHtml,
} from "@/components/editor/wikiMarkup";
import { notifyAction } from "@/lib/notifyAction";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  formatJiraDueDate,
  formatJiraUpdatedAt,
  jiraComponentLabel,
  jiraStatusClass,
  jiraStatusLabel,
  jiraStatusStyle,
} from "./jiraFormat";
import type { CreatedJiraTask } from "./CreateJiraTaskControls";

type JiraIssueDetailProps = {
  issueIdOrKey: string;
  selectedTask: Task | null;
  selectedDate: string;
  backLabel?: string;
  onBack: () => void;
  onLinked?: () => void;
  onCreateTask?: (issue: JiraIssue) => void;
  onCreatedTask?: (task: CreatedJiraTask) => void;
};

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  return fallback;
}

function linkedSelectedTask(issue: JiraIssue, selectedTask: Task | null): boolean {
  if (!selectedTask) {
    return false;
  }
  return issue.linkedTasks.some((task) => task.taskId === selectedTask.id);
}

function jiraIssueMatchesSelection(issue: JiraIssue, issueIdOrKey: string): boolean {
  return issue.key === issueIdOrKey || issue.id === issueIdOrKey;
}

function JiraUserSearch({
  issue,
  disabled,
  onSelect,
}: {
  issue: JiraIssue;
  disabled: boolean;
  onSelect: (user: JiraUser | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchUsers, { isFetching }] = useLazySearchJiraUsersQuery();
  const [results, setResults] = useState<JiraUser[]>([]);
  const canSearch = !disabled && query.trim().length > 0;

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchUsers({
        q: query.trim(),
        issueKey: issue.key,
        limit: 10,
      })
        .unwrap()
        .then((response) => {
          if (!cancelled) {
            setResults(response.users);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearch, issue.key, query, searchUsers]);

  return (
    <div className="space-y-[8px]">
      <div className="flex items-center gap-[8px]">
        <input
          value={query}
          disabled={disabled}
          placeholder="Search assignee"
          aria-label="Search Jira assignee"
          className="min-w-0 flex-1 border border-rule bg-transparent px-[9px] py-[6px] text-[12.5px] outline-none placeholder:text-faint disabled:opacity-50"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled}
          className="border border-rule px-[9px] py-[6px] text-[12px] text-muted-foreground disabled:opacity-50"
          onClick={() => onSelect(null)}
        >
          Clear
        </button>
      </div>
      {isFetching ? (
        <p className="text-[12px] text-faint">Searching Jira users...</p>
      ) : null}
      {results.length > 0 ? (
        <div className="max-h-[132px] overflow-y-auto border border-hair">
          {results.map((user) => (
            <button
              key={user.accountId ?? user.name ?? user.key ?? user.displayName}
              type="button"
              className="flex w-full flex-col gap-[2px] border-b border-hair px-[10px] py-[7px] text-left last:border-b-0 hover:bg-foreground/[0.03]"
              onClick={() => {
                onSelect(user);
                setQuery("");
                setResults([]);
              }}
            >
              <span className="text-[12.5px] font-semibold">{user.displayName}</span>
              {user.emailAddress ? (
                <span className="text-[11.5px] text-faint">{user.emailAddress}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JiraIssueDetail({
  issueIdOrKey,
  selectedTask,
  onBack,
  onLinked,
  onCreateTask,
}: JiraIssueDetailProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { data, isError, refetch: refetchIssue } = useGetJiraIssueRestQuery({
    issueIdOrKey,
  });
  const issue = data?.issue;
  const issueReady =
    issue != null && jiraIssueMatchesSelection(issue, issueIdOrKey);
  const commentsQuery = useGetJiraCommentsRestQuery(
    { issueIdOrKey },
    { skip: !issueReady },
  );
  const comments = commentsQuery.data?.comments ?? [];
  const [linkJiraTask, { isLoading: isLinking }] = useLinkJiraTaskMutation();
  const [unlinkJiraTask, { isLoading: isUnlinking }] = useUnlinkJiraTaskMutation();
  const [updateFields, { isLoading: isSaving }] = useUpdateJiraIssueFieldsMutation();
  const [createComment, { isLoading: isCommenting }] = useCreateJiraCommentMutation();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<JiraUser | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!issue) {
      return;
    }
    setSummary(issue.summary);
    setDescription(issue.description ?? "");
    setDueDate(issue.dueDate ?? "");
    setAssignee(issue.assignee);
    setError(null);
    setCommentBody("");
  }, [issue]);

  const editable = useMemo(() => new Set(issue?.editableFields ?? []), [issue]);
  const canEditSummary = editable.has("summary");
  const canEditDescription = editable.has("description");
  const canEditDueDate = editable.has("duedate");
  const canEditAssignee = editable.has("assignee");
  const canComment = true;
  const canSpawnTask = true;
  const selectedAlreadyLinked = issue ? linkedSelectedTask(issue, selectedTask) : false;
  const renderedDescription = useMemo(
    () => (issue?.renderedDescription ? sanitizeJiraRenderedHtml(issue.renderedDescription) : null),
    [issue?.renderedDescription],
  );
  const assigneeChanged =
    (assignee?.accountId ?? assignee?.name ?? assignee?.key ?? null) !==
    (issue?.assignee?.accountId ?? issue?.assignee?.name ?? issue?.assignee?.key ?? null);
  const dirty =
    Boolean(issue) &&
    ((canEditSummary && summary.trim() !== issue?.summary) ||
      (canEditDescription && description.trim() !== (issue?.description ?? "")) ||
      (canEditDueDate && (dueDate || null) !== issue?.dueDate) ||
      (canEditAssignee && assigneeChanged));

  async function linkSelectedTask() {
    if (!issue || !selectedTask || isLinking) {
      return;
    }
    setError(null);
    try {
      await notifyAction(
        () =>
          linkJiraTask({
            taskId: selectedTask.id,
            issueIdOrKey: issue.key,
          }).unwrap(),
        {
          success: `Linked to ${issue.key}`,
          error: "Could not link the selected task",
        },
      );
      dispatch(jiraApi.util.invalidateTags(["JiraIssue"]));
      refetchIssue();
      onLinked?.();
    } catch (caught) {
      setError(errorMessage(caught, "Could not link the selected task"));
    }
  }

  async function unlinkTask(taskId: string) {
    if (!issue || isUnlinking) {
      return;
    }
    setError(null);
    try {
      await notifyAction(
        () =>
          unlinkJiraTask({ taskId, issueIdOrKey: issue.key }).unwrap(),
        {
          success: "Unlinked task",
          error: "Could not unlink the task",
        },
      );
      dispatch(jiraApi.util.invalidateTags(["JiraIssue"]));
      refetchIssue();
      onLinked?.();
    } catch (caught) {
      setError(errorMessage(caught, "Could not unlink the task"));
    }
  }

  async function saveFields() {
    if (!issue || isSaving || !dirty) {
      return;
    }
    const body: {
      issueIdOrKey: string;
      summary?: string;
      description?: string | null;
      dueDate?: string | null;
      assignee?: JiraUser | null;
    } = {
      issueIdOrKey: issue.key,
    };
    if (canEditSummary && summary.trim() !== issue.summary) {
      body.summary = summary.trim();
    }
    if (canEditDescription && description.trim() !== (issue.description ?? "")) {
      body.description = description.trim() ? description.trim() : null;
    }
    if (canEditDueDate && (dueDate || null) !== issue.dueDate) {
      body.dueDate = dueDate || null;
    }
    if (canEditAssignee && assigneeChanged) {
      body.assignee = assignee;
    }
    if (
      !("summary" in body) &&
      !("description" in body) &&
      !("dueDate" in body) &&
      !("assignee" in body)
    ) {
      return;
    }

    setError(null);
    try {
      await notifyAction(() => updateFields(body).unwrap(), {
        success: "Jira fields saved",
        error: "Could not save Jira fields",
      });
      refetchIssue();
      onLinked?.();
    } catch (caught) {
      setError(errorMessage(caught, "Could not save Jira fields"));
    }
  }

  async function sendComment() {
    const trimmed = commentBody.trim();
    if (!issue || !trimmed || isCommenting) {
      return;
    }
    setError(null);
    setCommentBody("");
    try {
      await notifyAction(
        () =>
          createComment({
            issueIdOrKey: issue.key,
            body: trimmed,
          }).unwrap(),
        {
          success: "Comment added",
          error: "Could not add the Jira comment",
        },
      );
      commentsQuery.refetch();
    } catch (caught) {
      setCommentBody(trimmed);
      setError(errorMessage(caught, "Could not add the Jira comment"));
    }
  }

  if (isError && !issueReady) {
    return (
      <div className="flex h-full flex-col bg-card">
        <JiraPreviewHeader onBack={onBack} />
        <p className="px-[18px] py-[24px] text-[13px] text-destructive">
          Could not load this Jira issue.
        </p>
      </div>
    );
  }

  if (!issueReady) {
    return (
      <div className="flex h-full flex-col bg-card">
        <JiraPreviewHeader onBack={onBack}>
          <div className="flex min-w-0 items-center gap-[8px]">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-faint">
              {issueIdOrKey}
            </span>
            <Spinner className="size-3.5 text-muted-foreground" aria-hidden />
          </div>
        </JiraPreviewHeader>
        <JiraIssuePreviewSkeleton />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <JiraPreviewHeader onBack={onBack}>
        <div className="flex min-w-0 flex-1 items-center gap-[8px]">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-faint">
            {issue.key}
          </span>
          <span className={jiraStatusClass(issue)} style={jiraStatusStyle(issue)}>
            {jiraStatusLabel(issue)}
          </span>
          {canSpawnTask && onCreateTask ? (
            <Button
              type="button"
              className="ml-auto h-auto bg-primary px-[11px] py-[6px] text-[12px] font-bold"
              onClick={() => onCreateTask(issue)}
            >
              Create task
            </Button>
          ) : null}
          <a
            href={issue.browseUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${issue.key} in Jira`}
            className={cn(
              "text-[11.5px] font-semibold text-muted-foreground hover:text-foreground",
              !(canSpawnTask && onCreateTask) && "ml-auto",
            )}
          >
            Open Jira
          </a>
        </div>
      </JiraPreviewHeader>

      <FormBusy
        busy={isSaving || isCommenting}
        className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[16px]"
      >
        {error ? (
          <p className="mb-[12px] border border-destructive px-[10px] py-[8px] text-[12.5px] text-destructive">
            {error}
          </p>
        ) : null}

        <textarea
          value={summary}
          readOnly={!canEditSummary || isSaving}
          rows={1}
          aria-label="Jira summary"
          className={cn(
            "field-sizing-content w-full resize-none bg-transparent text-[16px] font-semibold leading-[1.35] tracking-[-0.02em] whitespace-pre-wrap outline-none",
            !canEditSummary && "cursor-default",
          )}
          onChange={(event) => setSummary(event.target.value)}
        />

        <div className="mt-[10px] flex flex-wrap items-center gap-[6px]">
          <span className="border border-hair px-[7px] py-[3px] text-[11.5px] text-muted-foreground">
            Assignee: {assignee?.displayName ?? "Unassigned"}
          </span>
          {canEditDueDate ? (
            <div className="border border-hair px-[7px] py-[3px] text-[11.5px] text-muted-foreground">
              <DateField
                value={dueDate}
                onChange={setDueDate}
                aria-label="Jira due date"
                labelPrefix="Due: "
                className="w-auto border-0 bg-transparent p-0 text-[11.5px]"
              />
            </div>
          ) : (
            <span className="border border-hair px-[7px] py-[3px] text-[11.5px] text-muted-foreground">
              Due: {formatJiraDueDate(issue.dueDate)}
            </span>
          )}
          <span className="border border-hair px-[7px] py-[3px] text-[11.5px] text-muted-foreground">
            {jiraComponentLabel(issue.components.map((component) => component.name))}
          </span>
        </div>

        {canEditAssignee ? (
          <div className="mt-[10px]">
            <JiraUserSearch
              issue={issue}
              disabled={isSaving}
              onSelect={(next) => setAssignee(next)}
            />
          </div>
        ) : null}

        {!canEditDescription && renderedDescription ? (
          <div
            className="mt-[14px] border border-rule px-[10px] py-[8px] text-[12.5px] leading-[1.55] text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: renderedDescription }}
          />
        ) : (
          <RichTextEditor
            mode="jiraWiki"
            value={description}
            readOnly={!canEditDescription || isSaving}
            aria-label="Jira description"
            className="mt-[14px]"
            onChange={setDescription}
          />
        )}

        {dirty ? (
          <Button
            type="button"
            loading={isSaving}
            disabled={!summary.trim()}
            className="mt-[10px] h-auto bg-foreground px-[12px] py-[7px] text-[12.5px] font-bold text-card"
            onClick={() => void saveFields()}
          >
            Save Jira fields
          </Button>
        ) : null}

        <section className="mt-[22px] border-t border-hair pt-[16px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Linked Tudu Tasks
            </span>
            {selectedTask && !selectedAlreadyLinked ? (
              <Button
                type="button"
                variant="outline"
                loading={isLinking}
                className="ml-auto h-auto border-rule px-[8px] py-[4px] text-[11.5px] font-semibold"
                onClick={() => void linkSelectedTask()}
              >
                Link selected task
              </Button>
            ) : null}
          </div>
          <div className="mt-[8px] space-y-[7px]">
            {issue.linkedTasks.length > 0 ? (
              issue.linkedTasks.map((task) => (
                <div
                  key={task.taskId}
                  className="flex items-center gap-[8px] border border-hair px-[9px] py-[7px]"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">
                    {task.title}
                  </span>
                  {task.isPrivate ? (
                    <span className="text-[11px] text-faint">Private</span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    loading={isUnlinking}
                    className="h-auto px-[6px] py-[2px] text-[11.5px] text-muted-foreground"
                    onClick={() => void unlinkTask(task.taskId)}
                  >
                    Unlink
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-[12.5px] text-faint">No linked Tudu tasks yet.</p>
            )}
          </div>
        </section>

        <section className="mt-[22px] border-t border-hair pt-[16px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Jira Comments
          </div>
          {canComment ? (
            <>
              <RichTextEditor
                mode="jiraWiki"
                value={commentBody}
                placeholder="Add a Jira comment..."
                aria-label="Jira comment"
                className="mt-[10px]"
                readOnly={isCommenting}
                onChange={setCommentBody}
              />
              <Button
                type="button"
                loading={isCommenting}
                disabled={!commentBody.trim()}
                className="mt-[8px] h-auto bg-primary px-[11px] py-[6px] text-[12px] font-bold"
                onClick={() => void sendComment()}
              >
                Add Jira comment
              </Button>
            </>
          ) : (
            <p className="mt-[10px] text-[12px] text-muted-foreground">
              You cannot comment on Jira for this report.
            </p>
          )}
          {commentsQuery.isLoading ? (
            <div className="mt-[8px]">
              <JiraCommentsSkeleton />
            </div>
          ) : (
            <div className="mt-[8px] divide-y divide-hair border border-hair">
            {commentsQuery.isError ? (
              <p className="px-[10px] py-[10px] text-[12.5px] text-destructive">
                Could not load Jira comments.
              </p>
            ) : comments.length > 0 ? (
              comments.map((comment) => (
                <article key={comment.id} className="px-[10px] py-[9px]">
                  <div className="flex items-center gap-[8px] text-[11.5px] text-faint">
                    <span className="font-semibold text-muted-foreground">
                      {comment.author.displayName}
                    </span>
                    <span>{formatJiraUpdatedAt(comment.createdAt)}</span>
                  </div>
                  <div
                    className="mt-[5px] text-[12.5px] leading-[1.55]"
                    dangerouslySetInnerHTML={{
                      __html: jiraWikiToDisplayHtml(comment.body, comment.renderedBody),
                    }}
                  />
                </article>
              ))
            ) : (
              <p className="px-[10px] py-[10px] text-[12.5px] text-faint">
                No Jira comments yet.
              </p>
            )}
            </div>
          )}
        </section>
      </FormBusy>
    </div>
  );
}

function JiraPreviewHeader({
  onBack,
  children,
}: {
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="flex h-[44px] shrink-0 items-center gap-[12px] border-b border-hair px-[18px] text-[12.5px]">
      {children}
      <button
        type="button"
        className="ml-auto flex size-[15px] items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Close Jira preview"
        onClick={onBack}
      >
        <X size={15} strokeWidth={2} aria-hidden />
      </button>
    </header>
  );
}
