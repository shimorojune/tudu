import { format, parseISO } from "date-fns";
import { useState } from "react";
import { useDispatch } from "react-redux";
import type {
  CreateProjectRequest,
  Project,
  Task,
  TimelineEvent,
} from "@tudu/shared";
import { BUCKETS, type Bucket } from "@tudu/shared";
import {
  jiraApi,
  type AppDispatch,
  useGetMeQuery,
  useUnlinkJiraTaskMutation,
  useUpdateTaskMutation,
} from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";
import {
  formatJiraDueDate,
  jiraStatusClass,
  jiraStatusStyle,
} from "@/components/jira/jiraFormat";
import { personFirstName } from "@/lib/person";
import {
  formatTimelineEvent,
  withSyntheticCreated,
} from "@/lib/timelineCopy";
import { TimelineEventRow } from "@/components/inspector/TimelineEventRow";
import { ProjectPicker } from "@/components/projects/ProjectPicker";
import { TaskDescriptionField } from "@/components/inspector/TaskDescriptionField";
import { cn } from "@/lib/utils";

export type DetailsTabProps = {
  task: Task;
  selectedDate: string;
  isToday: boolean;
  timelineEvents: TimelineEvent[];
  onJumpToTimeline: () => void;
  readOnly?: boolean;
  canAssignProject?: boolean;
  projects?: Project[];
  onCreateProject?: (
    body: CreateProjectRequest,
  ) => Promise<{ project: { id: string } }>;
  sharedWithName?: string | null;
};

function formatFieldDate(isoDate: string | null) {
  if (!isoDate) {
    return "-";
  }
  return format(new Date(`${isoDate}T12:00:00`), "EEE d MMM");
}

function formatDeadline(deadline: string | null, selectedDate: string) {
  if (!deadline) {
    return "-";
  }
  const date = parseISO(deadline);
  const today = new Date(`${selectedDate}T12:00:00`);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return `Today, ${format(date, "HH:mm")}`;
  }
  return format(date, "EEE d MMM, HH:mm");
}

function formatCarried(task: Task) {
  if (task.carriedDays <= 0) {
    return "-";
  }
  const dayWord = task.carriedDays === 1 ? "day" : "days";
  const since = task.carriedSince
    ? `, since ${format(new Date(`${task.carriedSince}T12:00:00`), "d MMM")}`
    : "";
  return `${task.carriedDays} ${dayWord}${since}`;
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  return fallback;
}

function BucketReadOnly({
  activeBucket,
  isToday,
}: {
  activeBucket: Bucket | null;
  isToday: boolean;
}) {
  if (!activeBucket) {
    return <span>-</span>;
  }

  return (
    <div className="inline-flex w-max border border-rule">
      {BUCKETS.map((bucket, index) => {
        const active = bucket === activeBucket;
        return (
          <span
            key={bucket}
            className={cn(
              "px-[14px] py-[4px] text-[11.5px]",
              index > 0 && "border-l border-rule",
              active
                ? "bg-foreground font-bold text-card"
                : "text-muted-foreground",
            )}
          >
            {bucketLabel(bucket, isToday)}
          </span>
        );
      })}
    </div>
  );
}

export function DetailsTab({
  task,
  selectedDate,
  isToday,
  timelineEvents,
  onJumpToTimeline,
  readOnly = false,
  canAssignProject = false,
  projects,
  onCreateProject,
  sharedWithName = null,
}: DetailsTabProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { data: me } = useGetMeQuery();
  const [updateTask] = useUpdateTaskMutation();
  const [unlinkJiraTask] = useUnlinkJiraTaskMutation();
  const [jiraError, setJiraError] = useState<string | null>(null);

  const viewerName = me?.name?.trim() || "You";
  const isOpen = task.completedAt === null;
  const events = withSyntheticCreated(task.id, task.createdAt, timelineEvents);
  const latest = events.slice(0, 2);

  async function unlinkJira(issueKey: string) {
    setJiraError(null);
    try {
      await unlinkJiraTask({
        taskId: task.id,
        issueIdOrKey: issueKey,
      }).unwrap();
      dispatch(jiraApi.util.invalidateTags(["JiraIssue"]));
    } catch (caught) {
      setJiraError(errorMessage(caught, "Could not unlink that Jira issue"));
    }
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[22px]"
      data-ph-mask="true"
    >
      <h2 className="text-[19px] font-extrabold leading-[1.3] tracking-[-0.018em]">
        {task.title}
      </h2>

      <TaskDescriptionField
        taskId={task.id}
        description={task.description}
        readOnly={readOnly || !isOpen}
      />

      <dl className="mt-[22px] grid grid-cols-[78px_minmax(0,1fr)] items-center gap-x-[16px] gap-y-[13px] text-[13px]">
        <dt className="text-muted-foreground">Project</dt>
        <dd>
          <ProjectPicker
            value={task.project?.id ?? null}
            readOnly={readOnly && !canAssignProject}
            projects={projects}
            onCreate={onCreateProject}
            fallback={task.project}
            onChange={(projectId) => {
              updateTask({ id: task.id, patch: { projectId } });
            }}
          />
        </dd>

        <dt className="text-muted-foreground">Bucket</dt>
        <dd>
          <BucketReadOnly activeBucket={task.bucket} isToday={isToday} />
        </dd>

        <dt className="text-muted-foreground">Start</dt>
        <dd className="tabular-nums">{formatFieldDate(task.startDate)}</dd>

        <dt className="text-muted-foreground">Deadline</dt>
        <dd className="tabular-nums">
          {formatDeadline(task.deadline, selectedDate)}
        </dd>

        <dt className="text-muted-foreground">Carried</dt>
        <dd className="tabular-nums">{formatCarried(task)}</dd>

        {isOpen && !readOnly ? (
          <>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <button
                type="button"
                className={cn(
                  "border px-[10px] py-[4px] text-[12px] font-semibold",
                  task.inProgress
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-hair text-muted-foreground hover:border-foreground",
                )}
                onClick={() => {
                  updateTask({
                    id: task.id,
                    patch: { inProgress: !task.inProgress },
                  });
                }}
              >
                {task.inProgress ? "In progress" : "Not in progress"}
              </button>
            </dd>
          </>
        ) : null}

        {sharedWithName && !task.isPrivate ? (
          <>
            <dt className="text-muted-foreground">Shared with</dt>
            <dd>{personFirstName(sharedWithName)}</dd>
          </>
        ) : null}

        {task.isPrivate ? (
          <>
            <dt className="text-muted-foreground">Visibility</dt>
            <dd>
              <span className="border border-hair px-[6px] py-px text-[11px]">
                Private
              </span>
            </dd>
          </>
        ) : null}

        {task.jiraLinks.length > 0 ? (
          <>
            <dt className="self-start pt-[4px] text-muted-foreground">Jira</dt>
            <dd className="flex flex-col gap-[8px]">
              {task.jiraLinks.map((link) => (
                <div
                  key={link.issueId}
                  className="flex min-w-0 flex-col gap-[6px] border border-hair px-[10px] py-[8px]"
                >
                  <div className="flex items-center gap-[8px]">
                    <a
                      href={link.browseUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${link.key} in Jira`}
                      className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-foreground hover:underline"
                    >
                      {link.key}
                    </a>
                    <span
                      className={jiraStatusClass(link)}
                      style={jiraStatusStyle(link)}
                    >
                      {link.statusName}
                    </span>
                    {!readOnly ? (
                      <button
                        type="button"
                        className="ml-auto text-[11.5px] text-muted-foreground hover:text-foreground"
                        onClick={() => void unlinkJira(link.key)}
                      >
                        Unlink
                      </button>
                    ) : null}
                  </div>
                  <p className="text-[12.5px] leading-[1.45] text-muted-foreground">
                    {link.summary}
                  </p>
                  <span className="text-[11.5px] tabular-nums text-faint">
                    Due {formatJiraDueDate(link.dueDate)}
                  </span>
                </div>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
      {jiraError ? (
        <p className="mt-[10px] text-[12px] text-destructive">{jiraError}</p>
      ) : null}

      <div className="mt-[22px] border-t border-hair pt-[18px]">
        <div className="flex items-center">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Latest
          </span>
          <button
            type="button"
            className="ml-auto text-[11.5px] text-muted-foreground"
            onClick={onJumpToTimeline}
          >
            Full timeline
          </button>
        </div>
        <div className="mt-[8px]">
          {latest.map((event, index) => {
            const copy = formatTimelineEvent(event, {
              viewerName,
              viewerId: me?.id,
              isToday,
              selectedDate,
            });
            return (
              <TimelineEventRow
                key={event.id}
                timeLabel={copy.timeLabel}
                isSystem={copy.isSystem}
                parts={copy.parts}
                isLast={index === latest.length - 1}
                compact
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
