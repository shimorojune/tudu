import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { JiraIssue, JiraJqlPreset, Task } from "@tudu/shared";
import {
  jiraApi,
  type AppDispatch,
  useGetJiraComponentsRestQuery,
  useGetJiraConnectionQuery,
  useGetJiraJqlPresetsQuery,
  useCreateJiraJqlPresetMutation,
  useLinkJiraTaskMutation,
  useRefreshJiraComponentsMutation,
  useRefreshJiraIssuesMutation,
  useSearchJiraIssuesQuery,
} from "@tudu/store";
import { ExternalLink, Link2, PencilLine, RefreshCcw } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { JiraIssueListSkeleton } from "@/components/loading/JiraSkeletons";
import { notifyAction } from "@/lib/notifyAction";
import {
  jiraIssueMeta,
  jiraStatusClass,
  jiraStatusLabel,
  jiraStatusStyle,
} from "./jiraFormat";
import { cn } from "@/lib/utils";
import {
  issueTetheredOnDay,
  linkedTasksInSelectedDay,
} from "@/lib/jiraInMyDay";
import { JiraInMyDayLine } from "@/components/jira/JiraInMyDayLine";
import { formatJiraDueDate } from "./jiraFormat";

export type JiraColumnProps = {
  selectedTask: Task | null;
  selectedDate: string;
  dayTasksById?: ReadonlyMap<string, Task>;
  selectedIssueKey?: string | null;
  onPreviewIssue?: (key: string) => void;
  onCreateTask?: (issue: JiraIssue) => void;
};

function connectionCopy(connected: boolean): {
  title: string;
  body: string;
  action: string;
} {
  if (connected) {
    return {
      title: "No Jira issues",
      body: "Assigned Jira issues appear here once they match your filters.",
      action: "Refresh",
    };
  }

  return {
    title: "No JIRA connected",
    body: "Connect Jira Data Center with a personal access token to browse assigned issues.",
    action: "Connect JIRA",
  };
}

function issueContainsSelectedTask(issue: JiraIssue, selectedTask: Task | null): boolean {
  if (!selectedTask) {
    return false;
  }
  return issue.linkedTasks.some((task) => task.taskId === selectedTask.id);
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  return fallback;
}

function JiraEmptyState({
  connected,
  title,
  body,
  onRefresh,
}: {
  connected: boolean;
  title?: string;
  body?: string;
  onRefresh: () => void;
}) {
  const copy = connectionCopy(connected);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[14px] px-[24px] text-center">
      <Link2 size={22} strokeWidth={1.6} className="text-ghost" aria-hidden />
      <div className="text-[14px] font-semibold">{title ?? copy.title}</div>
      <p className="max-w-[250px] text-[12.5px] leading-[1.6] text-muted-foreground">
        {body ?? copy.body}
      </p>
      {connected ? (
        <button
          type="button"
          className="border border-rule px-[12px] py-[7px] text-[12.5px] font-semibold"
          onClick={onRefresh}
        >
          {copy.action}
        </button>
      ) : (
        <a
          href="/settings?section=jira"
          className="bg-primary px-[14px] py-[8px] text-[12.5px] font-bold text-primary-foreground"
        >
          {copy.action}
        </a>
      )}
      <p className="text-[11.5px] text-faint">Tudu works without it</p>
    </div>
  );
}

function JiraIssueRow({
  issue,
  selected,
  selectedTask,
  selectedDate,
  dayTasksById,
  onPreview,
  onCreateTask,
  onLinkSelected,
  linking,
}: {
  issue: JiraIssue;
  selected: boolean;
  selectedTask: Task | null;
  selectedDate: string;
  dayTasksById: ReadonlyMap<string, Task>;
  onPreview: () => void;
  onCreateTask?: () => void;
  onLinkSelected: () => void;
  linking: boolean;
}) {
  const selectedLinked = issueContainsSelectedTask(issue, selectedTask);
  const canLinkSelected = Boolean(selectedTask && !selectedLinked);
  const tethered = issueTetheredOnDay(issue, selectedDate, dayTasksById);
  const tasksInDay = linkedTasksInSelectedDay(
    issue,
    selectedDate,
    dayTasksById,
  );
  const dueTodayExtra =
    issue.dueDate === selectedDate
      ? "due today"
      : issue.dueDate
        ? `due ${formatJiraDueDate(issue.dueDate)}`
        : undefined;

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(issue.key);
    } catch {
      // Clipboard can be blocked in some test or browser contexts.
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <article
          className={cn(
            "border-b border-hair px-[18px] py-[14px]",
            selected && "bg-foreground/[0.03]",
            tethered &&
              "bg-foreground/[0.03] shadow-[inset_3px_0_0_0_var(--primary)]",
          )}
        >
          <button
            type="button"
            aria-label={`Open Jira issue ${issue.key}`}
            aria-current={selected ? "true" : undefined}
            className="w-full text-left"
            onClick={onPreview}
          >
            <div className="flex items-center gap-[8px]">
              <span className="font-mono text-[11.5px] tracking-[-0.01em] text-muted-foreground">
                {issue.key}
              </span>
              <span
                className={jiraStatusClass(issue)}
                style={jiraStatusStyle(issue)}
              >
                {jiraStatusLabel(issue)}
              </span>
              <a
                href={issue.browseUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${issue.key} in Jira`}
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
              </a>
            </div>
            <h3 className="mt-[5px] text-[14px] font-semibold leading-[1.35] tracking-[-0.01em]">
              {issue.summary}
            </h3>
            <p className="mt-[5px] text-[11.5px] leading-[1.45] text-muted-foreground">
              {jiraIssueMeta(issue)}
            </p>
          </button>

          {tethered ? (
            <JiraInMyDayLine
              tasks={tasksInDay}
              selectedDate={selectedDate}
              extra={dueTodayExtra}
            />
          ) : issue.linkedTasks.length > 0 ? (
            <div className="mt-[8px] flex flex-wrap gap-[6px]">
              {issue.linkedTasks.map((task) => (
                <span
                  key={task.taskId}
                  className="max-w-full truncate border border-hair px-[7px] py-[3px] text-[11.5px] text-muted-foreground"
                >
                  {task.title}
                </span>
              ))}
            </div>
          ) : null}
          {selectedLinked && !tethered ? (
            <p className="mt-[8px] text-[11.5px] font-semibold text-primary-text">
              Selected task linked
            </p>
          ) : null}
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onPreview}>Preview</ContextMenuItem>
        <ContextMenuItem asChild>
          <a href={issue.browseUrl} target="_blank" rel="noreferrer">
            Open in Jira
          </a>
        </ContextMenuItem>
        {canLinkSelected ? (
          <ContextMenuItem
            disabled={linking}
            onSelect={onLinkSelected}
          >
            Link selected task
          </ContextMenuItem>
        ) : null}
        {onCreateTask ? (
          <ContextMenuItem onSelect={onCreateTask}>
            Create task
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void copyKey()}>Copy key</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const DEFAULT_JQL_PRESET_VALUE = "__default__";
const CUSTOM_JQL_PRESET_VALUE = "__custom__";

function JiraJqlFilter({
  jqlPresetId,
  customJql,
  presets,
  onSelectPreset,
  onApplyCustomJql,
  onClearFilters,
  onSaveAsPreset,
  savingPreset,
}: {
  jqlPresetId: string | null;
  customJql: string;
  presets: JiraJqlPreset[];
  onSelectPreset: (value: string | null) => void;
  onApplyCustomJql: (value: string) => void;
  onClearFilters: () => void;
  onSaveAsPreset: (name: string, jql: string) => Promise<void>;
  savingPreset: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [presetName, setPresetName] = useState("");
  const trimmedCustom = customJql.trim();
  const selectValue = trimmedCustom
    ? CUSTOM_JQL_PRESET_VALUE
    : (jqlPresetId ?? DEFAULT_JQL_PRESET_VALUE);

  function openCustomDialog() {
    setDraft(trimmedCustom);
    setPresetName("");
    setCustomOpen(true);
  }

  async function saveAsPreset() {
    const name = presetName.trim();
    const jql = draft.trim();
    if (!name || !jql || savingPreset) {
      return;
    }
    await onSaveAsPreset(name, jql);
    setCustomOpen(false);
    setPresetName("");
  }

  function applyCustomJql() {
    const next = draft.trim();
    if (!next) {
      return;
    }
    onApplyCustomJql(next);
    setCustomOpen(false);
  }

  return (
    <>
      <Select
        value={selectValue}
        onValueChange={(value) => {
          if (value === DEFAULT_JQL_PRESET_VALUE) {
            onClearFilters();
            return;
          }
          if (value === CUSTOM_JQL_PRESET_VALUE) {
            openCustomDialog();
            return;
          }
          onSelectPreset(value);
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="JQL preset"
          className="min-w-0 flex-1 border-hair bg-transparent shadow-none"
        >
          <SelectValue placeholder="Assigned unresolved issues" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_JQL_PRESET_VALUE}>
            Assigned unresolved issues
          </SelectItem>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.name}
              {preset.isDefault ? " (default)" : ""}
            </SelectItem>
          ))}
          {trimmedCustom ? (
            <SelectItem value={CUSTOM_JQL_PRESET_VALUE}>Custom JQL</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Custom JQL"
        className="border-hair bg-transparent shadow-none"
        onClick={openCustomDialog}
      >
        <PencilLine size={14} strokeWidth={1.8} aria-hidden />
      </Button>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-h-[min(520px,85dvh)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-rule bg-card p-0 sm:max-w-[560px]">
          <DialogHeader className="border-b border-hair px-[18px] py-[14px] text-left">
            <DialogTitle className="text-[13px] font-semibold">Custom JQL</DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              Enter a full Jira query. It replaces the assigned list filter.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-[18px] py-[14px]">
            <Textarea
              value={draft}
              aria-label="Custom JQL"
              placeholder='status = "In Progress" AND assignee = currentUser()'
              className="max-h-[220px] min-h-[120px] resize-y overflow-y-auto text-[12.5px] field-sizing-fixed"
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="mt-[14px] space-y-[8px] border-t border-hair pt-[14px]">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
                Save as preset
              </p>
              <Input
                value={presetName}
                aria-label="JQL preset name"
                placeholder="Preset name"
                className="h-auto border-rule bg-transparent px-[9px] py-[7px] text-[12.5px] shadow-none"
                onChange={(event) => setPresetName(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="border-t border-hair px-[18px] py-[12px] sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              loading={savingPreset}
              disabled={!draft.trim() || !presetName.trim()}
              onClick={() => void saveAsPreset()}
            >
              Save preset
            </Button>
            <Button type="button" disabled={!draft.trim()} onClick={applyCustomJql}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function JiraColumn({
  selectedTask,
  selectedDate,
  dayTasksById = new Map(),
  selectedIssueKey = null,
  onPreviewIssue,
  onCreateTask,
}: JiraColumnProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [query, setQuery] = useState("");
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [jqlPresetId, setJqlPresetId] = useState<string | null>(null);
  const [customJql, setCustomJql] = useState("");
  const [startAt, setStartAt] = useState(0);
  const [accumulatedIssues, setAccumulatedIssues] = useState<JiraIssue[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const componentRefreshKey = useRef<string | null>(null);
  const listHadDataRef = useRef(false);
  const pageSize = 50;
  const { data: connectionData, isLoading: connectionLoading } =
    useGetJiraConnectionQuery();
  const connection = connectionData?.connection;
  const connected = connection?.connected === true;
  const projectKeys = connection?.projectKeys ?? [];
  const projectKeysKey = projectKeys.join("|");
  const componentQuery = useGetJiraComponentsRestQuery(undefined, { skip: !connected });
  const { data: componentData } = componentQuery;
  const components = componentData?.components ?? [];
  const { data: presetData } = useGetJiraJqlPresetsQuery(undefined, { skip: !connected });
  const presets = presetData?.presets ?? [];
  const defaultPresetId = presets.find((preset) => preset.isDefault)?.id ?? null;
  const effectiveJqlPresetId = customJql.trim()
    ? null
    : (jqlPresetId ?? defaultPresetId);
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        query,
        jqlPresetId: effectiveJqlPresetId,
        customJql,
        componentIds,
      }),
    [componentIds, customJql, effectiveJqlPresetId, query],
  );
  const [appliedFilterKey, setAppliedFilterKey] = useState(filterKey);
  const [refreshComponents, componentRefreshState] = useRefreshJiraComponentsMutation();
  const filters = useMemo(
    () => ({
      q: query,
      jqlPresetId: effectiveJqlPresetId,
      jql: customJql,
      componentIds,
      startAt,
      limit: pageSize,
    }),
    [componentIds, customJql, effectiveJqlPresetId, query, startAt],
  );
  const issueQuery = useSearchJiraIssuesQuery(filters, {
    skip: !connected,
  });
  const total = issueQuery.data?.total ?? accumulatedIssues.length;
  const hasMore = issueQuery.data?.hasMore ?? false;
  const listSynced = appliedFilterKey === filterKey;
  const awaitingFilterResults =
    !listSynced &&
    listHadDataRef.current &&
    (issueQuery.isFetching || issueQuery.isLoading);
  const issues = awaitingFilterResults ? [] : accumulatedIssues;
  const emptyReason = issueQuery.data?.reason;
  const [refreshIssues, refreshState] = useRefreshJiraIssuesMutation();
  const [createJqlPreset, createPresetState] = useCreateJiraJqlPresetMutation();
  const [linkJiraTask, { isLoading: linking }] = useLinkJiraTaskMutation();
  const loadingMorePage =
    startAt > 0 && issueQuery.isFetching && accumulatedIssues.length > 0;
  const refreshing =
    refreshState.isLoading || (issueQuery.isFetching && !loadingMorePage);
  const showFullListSkeleton =
    !loadingMore &&
    startAt === 0 &&
    connected &&
    !issueQuery.isError &&
    emptyReason !== "no-jira-user" &&
    (connectionLoading ||
      awaitingFilterResults ||
      (issues.length === 0 && (issueQuery.isFetching || issueQuery.isLoading)));
  const componentRefreshing = componentRefreshState.isLoading || componentQuery.isFetching;

  useEffect(() => {
    setStartAt(0);
    setAccumulatedIssues([]);
    setLoadingMore(false);
  }, [filterKey]);

  useEffect(() => {
    if (!issueQuery.data) {
      return;
    }
    if (issueQuery.isFetching && startAt > 0) {
      return;
    }
    if (startAt === 0) {
      if (!listSynced && issueQuery.isFetching) {
        return;
      }
      setAccumulatedIssues(issueQuery.data.issues);
      setAppliedFilterKey(filterKey);
      if (issueQuery.data.issues.length > 0) {
        listHadDataRef.current = true;
      }
      setLoadingMore(false);
      return;
    }
    setAccumulatedIssues((previous) => {
      const existingIds = new Set(previous.map((item) => item.id));
      const appended = issueQuery.data!.issues.filter((item) => !existingIds.has(item.id));
      return [...previous, ...appended];
    });
    setLoadingMore(false);
  }, [filterKey, issueQuery.data, issueQuery.isFetching, startAt]);

  function loadMore() {
    if (!hasMore || loadingMore || issueQuery.isFetching) {
      return;
    }
    setLoadingMore(true);
    setStartAt(accumulatedIssues.length);
  }

  useEffect(() => {
    if (!connected || presets.length === 0 || jqlPresetId !== null || customJql.trim()) {
      return;
    }
    const defaultPreset = presets.find((preset) => preset.isDefault);
    if (defaultPreset) {
      setJqlPresetId(defaultPreset.id);
    }
  }, [connected, customJql, jqlPresetId, presets]);

  useEffect(() => {
    if (
      !connected ||
      projectKeys.length === 0 ||
      components.length > 0 ||
      componentRefreshing ||
      componentRefreshKey.current === projectKeysKey
    ) {
      return;
    }
    componentRefreshKey.current = projectKeysKey;
    void refreshComponents().unwrap().catch(() => {
      componentRefreshKey.current = null;
    });
  }, [
    componentRefreshing,
    components.length,
    connected,
    projectKeys.length,
    projectKeysKey,
    refreshComponents,
  ]);

  async function saveCustomJqlAsPreset(name: string, jql: string) {
    const result = await notifyAction(
      () => createJqlPreset({ name, jql, isDefault: false }).unwrap(),
      {
        success: "JQL preset saved",
        error: "Could not save JQL preset",
      },
    );
    setCustomJql("");
    setJqlPresetId(result.preset.id);
  }

  async function refresh() {
    if (!connected) {
      return;
    }
    setListError(null);
    await refreshIssues().unwrap();
    await issueQuery.refetch();
  }

  async function linkSelected(issue: JiraIssue) {
    if (!selectedTask) {
      return;
    }
    setListError(null);
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
      await issueQuery.refetch();
    } catch (caught) {
      setListError(errorMessage(caught, "Could not link the selected task"));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-hair px-[18px] pb-[12px] pt-[20px]">
        <div className="flex items-center gap-[8px]">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            JIRA
          </span>
          <span className="text-[11.5px] text-muted-foreground">assigned to me</span>
          {connected ? (
            <button
              type="button"
              disabled={refreshing}
              aria-label="Refresh Jira issues"
              className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() => void refresh()}
            >
              <RefreshCcw
                size={14}
                strokeWidth={1.9}
                aria-hidden
                className={cn(refreshing && "animate-spin")}
              />
            </button>
          ) : null}
        </div>

        {connected ? (
          <div className="mt-[13px] space-y-[9px]">
            <div className="flex gap-[9px]">
              <input
                value={query}
                placeholder="Search Jira issues"
                aria-label="Search Jira issues"
                className="min-w-0 flex-1 border border-hair bg-transparent px-[9px] py-[7px] text-[12.5px] outline-none placeholder:text-faint"
                onChange={(event) => setQuery(event.target.value)}
              />
              <MultiSelect
                aria-label="Filter by Component"
                values={componentIds}
                onChange={setComponentIds}
                placeholder="All Components"
                searchPlaceholder="Search Components"
                emptyText={componentRefreshing ? "Refreshing Components" : "No Components"}
                className="w-[180px] shrink-0"
                size="sm"
                options={components.map((component) => ({
                  value: component.id,
                  label: component.name,
                }))}
              />
            </div>
            <div className="flex items-stretch gap-[9px]">
              <JiraJqlFilter
                jqlPresetId={jqlPresetId}
                customJql={customJql}
                presets={presets}
                onSelectPreset={setJqlPresetId}
                onApplyCustomJql={(value) => {
                  setJqlPresetId(null);
                  setCustomJql(value);
                }}
                onClearFilters={() => {
                  setJqlPresetId(null);
                  setCustomJql("");
                }}
                onSaveAsPreset={saveCustomJqlAsPreset}
                savingPreset={createPresetState.isLoading}
              />
            </div>
          </div>
        ) : null}
      </header>
      {listError ? (
        <p className="border-b border-hair px-[18px] py-[10px] text-[12px] text-destructive">
          {listError}
        </p>
      ) : null}

      <div
        className="relative flex min-h-0 flex-1 flex-col"
        aria-busy={refreshing || undefined}
      >
        {showFullListSkeleton ? (
          <JiraIssueListSkeleton />
        ) : !connected ? (
          <JiraEmptyState connected={false} onRefresh={() => void refresh()} />
        ) : issueQuery.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-[12px] px-[24px] text-center">
            <p className="text-[13px] text-destructive">Could not load Jira issues.</p>
            <button
              type="button"
              className="border border-rule px-[10px] py-[6px] text-[12px] font-semibold"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        ) : emptyReason === "no-jira-user" ? (
          <JiraEmptyState
            connected
            title="No matching Jira user"
            body="This report has no matching Jira user."
            onRefresh={() => void refresh()}
          />
        ) : issues.length === 0 && !refreshing && !awaitingFilterResults ? (
          <JiraEmptyState connected onRefresh={() => void refresh()} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {issues.map((issue) => (
                <JiraIssueRow
                  key={issue.id}
                  issue={issue}
                  selected={selectedIssueKey === issue.key}
                  selectedTask={selectedTask}
                  selectedDate={selectedDate}
                  dayTasksById={dayTasksById}
                  linking={linking}
                  onPreview={() => onPreviewIssue?.(issue.key)}
                  onCreateTask={onCreateTask ? () => onCreateTask(issue) : undefined}
                  onLinkSelected={() => void linkSelected(issue)}
                />
              ))}
            </div>
            {total > 0 ? (
              <div className="flex shrink-0 items-center justify-between gap-[10px] border-t border-hair px-[18px] py-[10px]">
                <p className="text-[11px] text-faint">
                  Showing {issues.length} of {total}
                </p>
                {hasMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={loadingMore || loadingMorePage}
                    onClick={() => loadMore()}
                  >
                    Load more
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
