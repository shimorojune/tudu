import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import type { JiraComponent, JiraIssue, Task } from "@tudu/shared";
import { parseJiraIssueKeyOrUrl } from "@tudu/shared";
import {
  jiraApi,
  type AppDispatch,
  useCreateJiraIssueMutation,
  useGetJiraComponentsRestQuery,
  useGetJiraCreateMetadataQuery,
  useGetJiraStatusRestQuery,
  useLinkJiraTaskMutation,
  useSearchJiraIssuesQuery,
} from "@tudu/store";
import { Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { isCommandPaletteBlocked } from "@/components/chrome/dialogBlocker";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Button } from "@/components/ui/button";
import { FormBusy } from "@/components/forms/FormBusy";
import { notifyAction } from "@/lib/notifyAction";
import { cn } from "@/lib/utils";
import {
  jiraIssueMeta,
  jiraStatusClass,
  jiraStatusLabel,
  jiraStatusStyle,
} from "./jiraFormat";

type LinkJiraPaletteProps = {
  selectedTask: Task | null;
  selectedDate: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function issueMatchesTask(issue: JiraIssue, task: Task): boolean {
  return (
    task.jiraLinks.some((link) => link.issueId === issue.id || link.key === issue.key) ||
    issue.linkedTasks.some((link) => link.taskId === task.id)
  );
}

function componentKey(component: JiraComponent): string {
  return `${component.projectKey}:${component.id}`;
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  return fallback;
}

export function LinkJiraPalette({ selectedTask }: LinkJiraPaletteProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [projectKey, setProjectKey] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [componentSearch, setComponentSearch] = useState("");
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [searchStartAt, setSearchStartAt] = useState(0);
  const [searchIssues, setSearchIssues] = useState<JiraIssue[]>([]);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: statusData } = useGetJiraStatusRestQuery();
  const connection = statusData?.connection;
  const connected = connection?.connected === true;
  const projectKeys = connection?.projectKeys ?? [];
  const projectKeysKey = projectKeys.join("|");
  const searchPageSize = 25;
  const searchQuery = useSearchJiraIssuesQuery(
    {
      q: query,
      jqlPresetId: null,
      jql: "",
      componentIds: [],
      startAt: searchStartAt,
      limit: searchPageSize,
    },
    { skip: !open || !connected || mode !== "search" },
  );
  const firstProjectKey = projectKey || projectKeys[0] || "";
  const metadataQuery = useGetJiraCreateMetadataQuery(
    { projectKey: firstProjectKey },
    { skip: !open || !connected || mode !== "create" || !firstProjectKey },
  );
  const { data: componentsData } = useGetJiraComponentsRestQuery(undefined, {
    skip: !open || !connected || mode !== "create",
  });
  const [linkJiraTask, linkState] = useLinkJiraTaskMutation();
  const [createJiraIssue, createState] = useCreateJiraIssueMutation();
  const issues = searchIssues;
  const searchTotal = searchQuery.data?.total ?? searchIssues.length;
  const searchHasMore = searchQuery.data?.hasMore ?? false;
  const metadata = metadataQuery.data?.metadata;
  const issueTypes = metadata?.issueTypes ?? [];
  const selectedIssueType = issueTypes.find((item) => item.id === issueTypeId) ?? issueTypes[0];
  const components = (componentsData?.components ?? []).filter(
    (component) =>
      !projectKey ||
      component.projectKey === projectKey ||
      component.projectKey === "",
  );
  const visibleComponents = components.filter((component) =>
    component.name.toLowerCase().includes(componentSearch.toLowerCase().trim()),
  );
  const componentRequired = Boolean(
    selectedIssueType?.fields.some((field) => field.id === "components" && field.required),
  );
  const parsedIssueKey = useMemo(() => parseJiraIssueKeyOrUrl(query), [query]);
  const busy = linkState.isLoading || createState.isLoading;

  function refreshJiraRestCaches() {
    dispatch(jiraApi.util.invalidateTags(["JiraIssue"]));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !selectedTask) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== "l") {
        return;
      }
      if (isEditableTarget(event.target) || isCommandPaletteBlocked()) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTask]);

  useEffect(() => {
    setSearchStartAt(0);
    setSearchIssues([]);
    setSearchLoadingMore(false);
  }, [query]);

  useEffect(() => {
    if (!searchQuery.data) {
      return;
    }
    if (searchStartAt === 0) {
      setSearchIssues(searchQuery.data.issues);
      setSearchLoadingMore(false);
      return;
    }
    setSearchIssues((previous) => {
      const existingIds = new Set(previous.map((item) => item.id));
      const appended = searchQuery.data!.issues.filter((item) => !existingIds.has(item.id));
      return [...previous, ...appended];
    });
    setSearchLoadingMore(false);
  }, [searchQuery.data, searchStartAt]);

  useEffect(() => {
    if (!open || !selectedTask) {
      return;
    }
    setMode("search");
    setQuery("");
    setProjectKey(projectKeys[0] ?? "");
    setIssueTypeId("");
    setSummary(selectedTask.title);
    setDescription(selectedTask.description ?? "");
    setComponentSearch("");
    setComponentIds([]);
    setError(null);
  }, [
    open,
    projectKeysKey,
    selectedTask?.description,
    selectedTask?.id,
    selectedTask?.title,
  ]);

  useEffect(() => {
    if (!selectedIssueType) {
      return;
    }
    setIssueTypeId(selectedIssueType.id);
  }, [selectedIssueType?.id]);

  async function linkIssue(issueIdOrKey: string) {
    if (!selectedTask || busy) {
      return;
    }
    setError(null);
    try {
      await notifyAction(
        () =>
          linkJiraTask({
            taskId: selectedTask.id,
            issueIdOrKey,
          }).unwrap(),
        { success: "Linked to Jira", error: "Could not link that Jira issue" },
      );
      refreshJiraRestCaches();
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not link that Jira issue"));
    }
  }

  async function createAndLink(event: FormEvent) {
    event.preventDefault();
    if (!selectedTask || !summary.trim() || !projectKey || !selectedIssueType || busy) {
      return;
    }
    if (componentRequired && componentIds.length === 0) {
      setError("Select a Jira Component first.");
      return;
    }
    setError(null);
    try {
      await notifyAction(
        () =>
          createJiraIssue({
            projectKey,
            issueTypeId: selectedIssueType.id,
            summary: summary.trim(),
            description: description.trim() ? description.trim() : null,
            dueDate: selectedTask.deadline ? selectedTask.deadline.slice(0, 10) : null,
            assignee: null,
            componentIds,
            fields: {},
            linkTaskId: selectedTask.id,
          }).unwrap(),
        { success: "Jira issue created", error: "Could not create the Jira issue" },
      );
      refreshJiraRestCaches();
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not create the Jira issue"));
    }
  }

  if (!selectedTask) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-h-[78vh] translate-y-0 gap-0 border-rule bg-card p-0 sm:max-w-[660px]"
      >
        <div className="border-b border-rule px-[18px] py-[14px]">
          <DialogTitle className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Link selected task to JIRA
          </DialogTitle>
          <DialogDescription className="mt-[6px] text-[12.5px] text-muted-foreground">
            Search Jira, paste a key or URL, or create a Jira issue for{" "}
            <span className="font-semibold text-foreground">{selectedTask.title}</span>.
          </DialogDescription>
        </div>

        {!connected ? (
          <div className="flex flex-col items-center gap-[12px] px-[24px] py-[38px] text-center">
            <Link2 size={22} strokeWidth={1.6} className="text-ghost" aria-hidden />
            <p className="text-[13px] text-muted-foreground">
              Connect Jira before linking tasks.
            </p>
            <a
              href="/settings?section=jira"
              className="bg-primary px-[14px] py-[8px] text-[12.5px] font-bold text-primary-foreground"
            >
              Connect Jira
            </a>
          </div>
        ) : (
          <>
            <div className="flex border-b border-hair">
              <button
                type="button"
                className={cn(
                  "flex-1 px-[14px] py-[10px] text-[12.5px] font-semibold",
                  mode === "search"
                    ? "bg-foreground text-card"
                    : "text-muted-foreground",
                )}
                onClick={() => setMode("search")}
              >
                Search or paste
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 px-[14px] py-[10px] text-[12.5px] font-semibold",
                  mode === "create"
                    ? "bg-foreground text-card"
                    : "text-muted-foreground",
                )}
                onClick={() => setMode("create")}
              >
                Create Jira issue
              </button>
            </div>

            {error ? (
              <p className="mx-[18px] mt-[12px] border border-destructive px-[10px] py-[8px] text-[12.5px] text-destructive">
                {error}
              </p>
            ) : null}

            {mode === "search" ? (
              <div className="min-h-0 px-[18px] py-[14px]">
                <div className="flex gap-[8px]">
                  <input
                    value={query}
                    autoFocus
                    placeholder="Search by key, URL, or text"
                    aria-label="Search by key, URL, or text"
                    className="min-w-0 flex-1 border border-rule bg-transparent px-[10px] py-[8px] text-[13.5px] outline-none placeholder:text-faint"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {parsedIssueKey ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="border border-rule px-[10px] py-[8px] text-[12px] font-semibold disabled:opacity-50"
                      onClick={() => void linkIssue(parsedIssueKey)}
                    >
                      Link {parsedIssueKey}
                    </button>
                  ) : null}
                </div>
                <div className="mt-[12px] max-h-[340px] overflow-y-auto border border-hair">
                  {searchQuery.isLoading || searchQuery.isFetching ? (
                    <p className="border-b border-hair px-[12px] py-[8px] text-[12.5px] text-faint">
                      Searching Jira...
                    </p>
                  ) : null}
                  {issues.length > 0 ? (
                    issues.map((issue) => {
                      const linked = issueMatchesTask(issue, selectedTask);
                      return (
                        <article
                          key={issue.id}
                          className="flex items-start gap-[12px] border-b border-hair px-[12px] py-[11px] last:border-b-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-[7px]">
                              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">
                                {issue.key}
                              </span>
                              <span
                                className={jiraStatusClass(issue)}
                                style={jiraStatusStyle(issue)}
                              >
                                {jiraStatusLabel(issue)}
                              </span>
                            </div>
                            <p className="mt-[4px] text-[13px] leading-snug">
                              {issue.summary}
                            </p>
                            <p className="mt-[4px] text-[11.5px] text-muted-foreground">
                              {jiraIssueMeta(issue)}
                            </p>
                          </div>
                          <a
                            href={issue.browseUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${issue.key} in Jira`}
                            className="border border-hair px-[7px] py-[5px] text-[11.5px] text-muted-foreground"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            disabled={busy || linked}
                            aria-label={`Link selected task to ${issue.key}`}
                            className="border border-rule px-[8px] py-[5px] text-[11.5px] font-semibold disabled:opacity-50"
                            onClick={() => void linkIssue(issue.key)}
                          >
                            {linked ? "Linked" : "Link"}
                          </button>
                        </article>
                      );
                    })
                  ) : searchQuery.isError ? (
                    <p className="px-[12px] py-[12px] text-[12.5px] text-destructive">
                      Could not search Jira issues.
                    </p>
                  ) : searchQuery.isLoading || searchQuery.isFetching ? null : (
                    <p className="px-[12px] py-[12px] text-[12.5px] text-faint">
                      No Jira issues found.
                    </p>
                  )}
                </div>
                {searchTotal > 0 ? (
                  <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                    <p className="text-[11px] text-faint">
                      Showing {issues.length} of {searchTotal}
                    </p>
                    {searchHasMore ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={searchLoadingMore && searchQuery.isFetching}
                        onClick={() => {
                          if (searchLoadingMore || searchQuery.isFetching) {
                            return;
                          }
                          setSearchLoadingMore(true);
                          setSearchStartAt(issues.length);
                        }}
                      >
                        Load more
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <form className="grid gap-[13px] px-[18px] py-[14px]" onSubmit={createAndLink}>
                <FormBusy busy={busy} className="grid gap-[13px]">
                <div className="grid grid-cols-2 gap-[10px]">
                  <label className="flex flex-col gap-[6px]">
                    <span className="text-[12px] text-muted-foreground">Project</span>
                    <select
                      value={projectKey}
                      aria-label="Jira project"
                      className="border border-rule bg-transparent px-[9px] py-[8px] text-[12.5px]"
                      onChange={(event) => {
                        setProjectKey(event.target.value);
                        setComponentIds([]);
                      }}
                    >
                      {projectKeys.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-[6px]">
                    <span className="text-[12px] text-muted-foreground">Issue type</span>
                    <select
                      value={selectedIssueType?.id ?? ""}
                      aria-label="Jira issue type"
                      className="border border-rule bg-transparent px-[9px] py-[8px] text-[12.5px]"
                      onChange={(event) => setIssueTypeId(event.target.value)}
                    >
                      {issueTypes.map((issueType) => (
                        <option key={issueType.id} value={issueType.id}>
                          {issueType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-[6px]">
                  <span className="text-[12px] text-muted-foreground">Jira summary</span>
                  <input
                    value={summary}
                    aria-label="New Jira summary"
                    className="border border-rule bg-transparent px-[10px] py-[8px] text-[13.5px] outline-none"
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-[6px]">
                  <span className="text-[12px] text-muted-foreground">Description</span>
                  <RichTextEditor
                    mode="jiraWiki"
                    value={description}
                    aria-label="New Jira description"
                    onChange={setDescription}
                  />
                </label>

                <section className="border border-hair p-[10px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[12px] font-semibold text-muted-foreground">
                      Components{componentRequired ? " required" : ""}
                    </span>
                    <span className="ml-auto text-[11.5px] text-faint">
                      {componentIds.length} selected
                    </span>
                  </div>
                  <input
                    value={componentSearch}
                    placeholder="Search Components"
                    aria-label="Search Jira Components"
                    className="mt-[8px] w-full border border-rule bg-transparent px-[9px] py-[7px] text-[12.5px] outline-none placeholder:text-faint"
                    onChange={(event) => setComponentSearch(event.target.value)}
                  />
                  <div className="mt-[8px] max-h-[110px] overflow-y-auto">
                    {visibleComponents.length > 0 ? (
                      visibleComponents.map((component) => (
                        <label
                          key={componentKey(component)}
                          className="flex items-center gap-[8px] py-[4px] text-[12.5px]"
                        >
                          <input
                            type="checkbox"
                            checked={componentIds.includes(component.id)}
                            onChange={(event) => {
                              setComponentIds((current) =>
                                event.target.checked
                                  ? [...current, component.id]
                                  : current.filter((id) => id !== component.id),
                              );
                            }}
                          />
                          <span>{component.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-[12px] text-faint">
                        No Components cached for this project.
                      </p>
                    )}
                  </div>
                </section>

                <Button
                  type="submit"
                  loading={busy}
                  disabled={!summary.trim() || !selectedIssueType}
                  className="h-auto justify-self-start bg-primary px-[13px] py-[7px] text-[12.5px] font-bold"
                >
                  Create and link
                </Button>
                </FormBusy>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
