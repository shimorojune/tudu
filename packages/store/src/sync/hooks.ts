import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  viewKey,
  type CreateJiraIssueRequest,
  type CreateProjectRequest,
  type CreateSubtaskRequest,
  type CreateTaskRequest,
  type LinkJiraTaskRequest,
  type MoveTaskToSpaceRequest,
  type ReorderRequest,
  type ReorderSubtasksRequest,
  type RolloverRequest,
  type SpawnJiraTaskRequest,
  type TimelineResponse,
  type UpdateCommentRequest,
  type UpdateJiraIssueFieldsRequest,
  type UpdateProjectRequest,
  type UpdateSubtaskRequest,
  type UpdateTaskRequest,
  type UnlinkJiraTaskRequest,
} from "@tudu/shared";
import { getAuthToken, resolveApiUrl } from "../api/baseApi.js";
import type { AppDispatch, RootState } from "../store.js";
import { enqueue, subscribeView } from "./client.js";
import {
  jiraCommentsForIssue,
  jiraComponentsForList,
  jiraIssueFromReplica,
  jiraIssuesForList,
  jiraUsersForList,
  requestsForSpace,
  tasksForDay,
  tasksForProject,
  unscheduledTasks,
} from "./replica.js";
import { selectVisible } from "./slice.js";

type QueryOptions = { skip?: boolean };

function useView(key: string | null) {
  const dispatch = useDispatch<AppDispatch>();
  const status = useSelector((state: RootState) =>
    key ? state.sync.views[key] : undefined,
  );

  useEffect(() => {
    if (!key) {
      return;
    }
    return dispatch(subscribeView(key));
  }, [dispatch, key]);

  return {
    isLoading: Boolean(key) && status !== "ready",
    isError: status === "error",
    isFetching: status === "loading",
  };
}

export function useGetTasksForDayQuery(date: string, options?: QueryOptions) {
  const key = options?.skip || !date ? null : viewKey.day(date);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({ tasks: date ? tasksForDay(replica, date) : [] }),
    [replica, date],
  );
  return { ...query, data };
}

export function useGetUnscheduledTasksQuery(_arg?: void, options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.unscheduled();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(() => ({ tasks: unscheduledTasks(replica) }), [replica]);
  return { ...query, data };
}

export function useGetInboxQuery(_arg?: void, _options?: QueryOptions) {
  return {
    isLoading: false,
    isError: false,
    isFetching: false,
    data: { pending: [], history: [], count: 0 },
  };

}

export function useGetInboxCountQuery(_arg?: void, options?: QueryOptions) {
  const result = useGetInboxQuery(undefined, options);
  return {
    ...result,
    data: { count: result.data.count },
  };
}

export function useLatestPulse() {
  const replica = useSelector(selectVisible);
  return replica.latestPulse;
}

export function useGetNotificationsQuery(_arg?: void, options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.notifications();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({
      notifications: replica.notifications,
      unreadCount: replica.notifications.filter((item) => item.readAt === null).length,
    }),
    [replica],
  );
  return { ...query, data };
}

export function useGetTeamQuery(_date?: string | void, _options?: QueryOptions) {
  return { isLoading: false, isError: false, isFetching: false, data: undefined };
}

export function useGetReportDayQuery(
  _arg: { userId: string; date: string },
  _options?: QueryOptions,
) {
  return { isLoading: false, isError: false, isFetching: false, data: undefined };
}

export function useGetReportUnscheduledQuery(
  _userId: string,
  _options?: QueryOptions,
) {
  return { isLoading: false, isError: false, isFetching: false, data: { tasks: [] } };
}

export function useGetReportInboxQuery(
  _userId: string,
  _options?: QueryOptions,
) {
  return {
    isLoading: false,
    isError: false,
    isFetching: false,
    data: { pending: [], history: [], count: 0 },
  };
}

export function useGetCommentsQuery(taskId: string, options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.taskDetail(taskId);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const comments = replica.commentsByTask[taskId] ?? [];
  const data = useMemo(
    () => ({
      comments: comments.slice().sort((a, b) => {
        if (a.createdAt < b.createdAt) {
          return -1;
        }
        if (a.createdAt > b.createdAt) {
          return 1;
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }),
    }),
    [comments],
  );
  return { ...query, data };
}

export function useGetTimelineQuery(taskId: string, options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.taskDetail(taskId);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const events = replica.timelineByTask[taskId] ?? [];
  const data = useMemo(
    () => ({
      events,
      hasMore: (replica.timelineHasMore[taskId] ?? false) || events.length >= 50,
    }),
    [events, replica.timelineHasMore, taskId],
  );
  return { ...query, data };
}

export function useGetJiraConnectionQuery(options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.jira();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  return { ...query, data: { connection: replica.jiraConnection } };
}

export function useGetJiraIssuesQuery(options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.jira();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({ issues: jiraIssuesForList(replica) }),
    [replica],
  );
  return { ...query, data };
}

export function useGetReportJiraIssuesQuery(
  _userId: string,
  _options?: QueryOptions,
) {
  return { isLoading: false, isError: false, isFetching: false, data: { issues: [] } };
}

export function useGetJiraIssueQuery(
  issueIdOrKey: string,
  options?: QueryOptions,
) {
  const key =
    options?.skip || !issueIdOrKey ? null : viewKey.jiraIssue(issueIdOrKey);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(() => {
    const issue = issueIdOrKey
      ? jiraIssueFromReplica(replica, issueIdOrKey)
      : undefined;
    return issue ? { issue } : undefined;
  }, [replica, issueIdOrKey]);
  return { ...query, data };
}

export function useGetJiraCommentsQuery(
  issueIdOrKey: string,
  options?: QueryOptions,
) {
  const key =
    options?.skip || !issueIdOrKey ? null : viewKey.jiraIssue(issueIdOrKey);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({ comments: issueIdOrKey ? jiraCommentsForIssue(replica, issueIdOrKey) : [] }),
    [replica, issueIdOrKey],
  );
  return { ...query, data };
}

export function useGetJiraComponentsQuery(options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.jiraComponents();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({ components: jiraComponentsForList(replica) }),
    [replica],
  );
  return { ...query, data };
}

export function useGetJiraUsersQuery(options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.jiraUsers();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(() => ({ users: jiraUsersForList(replica) }), [replica]);
  return { ...query, data };
}

export function useLazyGetTimelineOlderQuery() {
  const [isFetching, setFetching] = useState(false);
  const fetchOlder = useCallback(
    (arg: { taskId: string; before: string }) => {
      const promise = (async () => {
        setFetching(true);
        try {
          const token = await getAuthToken();
          const url = new URL(`${resolveApiUrl()}/tasks/${arg.taskId}/timeline`);
          url.searchParams.set("before", arg.before);
          url.searchParams.set("limit", "50");
          const response = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!response.ok) {
            throw new Error("Failed to load timeline");
          }
          return (await response.json()) as TimelineResponse;
        } finally {
          setFetching(false);
        }
      })();
      return Object.assign(promise, {
        unwrap: () => promise,
      });
    },
    [],
  );
  return [fetchOlder, { isFetching }] as const;
}

function withUnwrap<T>(promise: Promise<T>) {
  return Object.assign(promise, { unwrap: () => promise });
}

function useRemovedManagerMutation<TArg = unknown>() {
  const trigger = useCallback((_: TArg) => {
    const promise = Promise.reject<void>(
      new Error("Manager and inbox flows were removed"),
    );
    return withUnwrap(promise);
  }, []);
  return [trigger, { isLoading: false }] as const;
}

function useOp<Arg>(toOp: (arg: Arg) => Parameters<typeof enqueue>[0]) {
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setLoading] = useState(false);
  const toOpRef = useRef(toOp);
  toOpRef.current = toOp;
  const trigger = useCallback(
    (arg: Arg) => {
      const op = toOpRef.current(arg);
      setLoading(true);
      const promise = dispatch(enqueue(op)).finally(() => setLoading(false));
      return withUnwrap(promise);
    },
    [dispatch],
  );
  return [trigger, { isLoading }] as const;
}

export function useCreateTaskMutation() {
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setLoading] = useState(false);
  const trigger = useCallback(
    (body: CreateTaskRequest) => {
      const id = crypto.randomUUID();
      setLoading(true);
      const promise = dispatch(
        enqueue({ type: "task.create", id, body }),
      )
        .then(() => ({ task: { id } }))
        .finally(() => setLoading(false));
      return withUnwrap(promise);
    },
    [dispatch],
  );
  return [trigger, { isLoading }] as const;
}

export function useUpdateTaskMutation() {
  return useOp((arg: { id: string; patch: UpdateTaskRequest }) => ({
    type: "task.update" as const,
    id: arg.id,
    patch: arg.patch,
  }));
}

export function useDeleteTaskMutation() {
  return useOp((id: string) => ({ type: "task.delete" as const, id }));
}

export function useReorderTasksMutation() {
  return useOp((body: ReorderRequest) => ({
    type: "task.reorder" as const,
    body,
  }));
}

export function useMoveTaskToSpaceMutation() {
  return useOp((body: MoveTaskToSpaceRequest) => ({
    type: "task.moveToSpace" as const,
    body,
  }));
}

export function useRolloverMutation() {
  return useOp((body: RolloverRequest) => ({
    type: "task.rollover" as const,
    body,
  }));
}

export function useCreateSubtaskMutation() {
  return useOp((arg: { taskId: string; body: CreateSubtaskRequest }) => ({
    type: "subtask.create" as const,
    id: crypto.randomUUID(),
    taskId: arg.taskId,
    body: arg.body,
  }));
}

export function useUpdateSubtaskMutation() {
  return useOp((arg: { id: string; patch: UpdateSubtaskRequest }) => ({
    type: "subtask.update" as const,
    id: arg.id,
    patch: arg.patch,
  }));
}

export function useDeleteSubtaskMutation() {
  return useOp((id: string) => ({ type: "subtask.delete" as const, id }));
}

export function useReorderSubtasksMutation() {
  return useOp((arg: { taskId: string; body: ReorderSubtasksRequest }) => ({
    type: "subtask.reorder" as const,
    taskId: arg.taskId,
    body: arg.body,
  }));
}

export function useCreateCommentMutation() {
  return useOp((arg: { taskId: string; body: string }) => ({
    type: "comment.create" as const,
    id: crypto.randomUUID(),
    taskId: arg.taskId,
    body: { body: arg.body },
  }));
}

export function useUpdateCommentMutation() {
  return useOp(
    (arg: { id: string; taskId: string; patch: UpdateCommentRequest }) => ({
      type: "comment.update" as const,
      id: arg.id,
      taskId: arg.taskId,
      patch: arg.patch,
    }),
  );
}

export function useDeleteCommentMutation() {
  return useOp((arg: { id: string; taskId: string }) => ({
    type: "comment.delete" as const,
    id: arg.id,
    taskId: arg.taskId,
  }));
}

export function useAcceptInboxItemMutation() {
  return useRemovedManagerMutation();
}


export function useDeclineInboxItemMutation() {
  return useRemovedManagerMutation();
}


export function useCreateTeamInviteMutation() {
  return useRemovedManagerMutation();
}


export function useAcceptTeamInviteMutation() {
  return useRemovedManagerMutation();
}


export function useDeclineTeamInviteMutation() {
  return useRemovedManagerMutation();
}


export function useSendInboxTaskMutation() {
  return useRemovedManagerMutation();
}


export function useReorderReportTasksMutation() {
  return useRemovedManagerMutation();
}


export function useDeleteReportTaskMutation() {
  return useRemovedManagerMutation();
}


export function useReadNotificationMutation() {
  return useOp((id: string) => ({ type: "notification.read" as const, id }));
}

export function useReadAllNotificationsMutation() {
  return useOp((_arg?: void) => ({ type: "notification.readAll" as const }));
}

export function useLinkJiraTaskMutation() {
  return useOp((body: LinkJiraTaskRequest) => ({
    type: "jira.link" as const,
    id: crypto.randomUUID(),
    taskId: body.taskId,
    issueIdOrKey: body.issueIdOrKey,
  }));
}

export function useUnlinkJiraTaskMutation() {
  return useOp((body: UnlinkJiraTaskRequest) => ({
    type: "jira.unlink" as const,
    taskId: body.taskId,
    issueIdOrKey: body.issueIdOrKey,
  }));
}

export function useSpawnJiraTaskMutation() {
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setLoading] = useState(false);
  const trigger = useCallback(
    (body: SpawnJiraTaskRequest) => {
      const id = crypto.randomUUID();
      setLoading(true);
      const promise = dispatch(
        enqueue({ type: "jira.task.spawn" as const, id, body }),
      )
        .then(() => ({ task: { id } }))
        .finally(() => setLoading(false));
      return withUnwrap(promise);
    },
    [dispatch],
  );
  return [trigger, { isLoading }] as const;
}

export function useSpawnReportJiraTaskMutation() {
  return useRemovedManagerMutation();
}


export function useCreateJiraIssueMutation() {
  return useOp((body: CreateJiraIssueRequest) => ({
    type: "jira.issue.create" as const,
    id: crypto.randomUUID(),
    body,
  }));
}

export function useUpdateJiraIssueFieldsMutation() {
  return useOp((body: UpdateJiraIssueFieldsRequest) => ({
    type: "jira.issue.updateFields" as const,
    body,
  }));
}

export function useUpdateJiraIssueDueDateMutation() {
  return useOp((arg: { issueIdOrKey: string; dueDate: string | null }) => ({
    type: "jira.issue.updateDueDate" as const,
    issueIdOrKey: arg.issueIdOrKey,
    dueDate: arg.dueDate,
  }));
}

export function useUpdateJiraIssueAssigneeMutation() {
  return useOp((arg: { issueIdOrKey: string; assignee: unknown | null }) => ({
    type: "jira.issue.updateAssignee" as const,
    issueIdOrKey: arg.issueIdOrKey,
    assignee: arg.assignee,
  }));
}

export function useCreateJiraCommentMutation() {
  return useOp((arg: { issueIdOrKey: string; reportUserId?: string; body: string }) => ({
    type: "jira.comment.create" as const,
    id: crypto.randomUUID(),
    issueIdOrKey: arg.issueIdOrKey,
    ...(arg.reportUserId ? { reportUserId: arg.reportUserId } : {}),
    body: arg.body,
  }));
}

export function useGetProjectsQuery(options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.projects();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () =>
      Object.values(replica.projects).sort((a, b) => {
        if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) {
          return a.archivedAt ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      }),
    [replica.projects],
  );
  return { ...query, data };
}

export function useGetProjectQuery(projectId: string, options?: QueryOptions) {
  const key = options?.skip || !projectId ? null : viewKey.project(projectId);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const project = replica.projects[projectId];
  const tasks = useMemo(
    () => (projectId ? tasksForProject(replica, projectId) : []),
    [replica, projectId],
  );
  return { ...query, data: project ? { project, tasks } : undefined };
}

export function useCreateProjectMutation() {
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setLoading] = useState(false);
  const trigger = useCallback(
    (body: CreateProjectRequest) => {
      const id = crypto.randomUUID();
      setLoading(true);
      const promise = dispatch(enqueue({ type: "project.create", id, body }))
        .then(() => ({ project: { id } }))
        .finally(() => setLoading(false));
      return withUnwrap(promise);
    },
    [dispatch],
  );
  return [trigger, { isLoading }] as const;
}

export function useUpdateProjectMutation() {
  return useOp((arg: { id: string; patch: UpdateProjectRequest }) => ({
    type: "project.update" as const,
    id: arg.id,
    patch: arg.patch,
  }));
}

export function useDeleteProjectMutation() {
  return useOp((id: string) => ({ type: "project.delete" as const, id }));
}

export function useGetReportProjectsQuery(
  _userId: string,
  _options?: QueryOptions,
) {
  return { isLoading: false, isError: false, isFetching: false, data: [] };
}

export function useCreateReportProjectMutation() {
  return useRemovedManagerMutation();
}

export function useGetRequestsQuery(space: string, options?: QueryOptions) {
  const key = options?.skip || !space ? null : viewKey.requests(space);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const viewerId = replica.viewerId;
  const data = useMemo(() => {
    const requests = requestsForSpace(replica, space, viewerId);
    const incoming = requests.filter(
      (row) => row.status === "pending" && row.to.id === viewerId,
    );
    const sent = requests.filter(
      (row) => row.status === "pending" && row.from.id === viewerId,
    );
    const recent = requests.filter((row) => row.status !== "pending");
    const returned = requests.filter(
      (row) =>
        row.kind === "new_task" &&
        row.status === "declined" &&
        row.from.id === viewerId,
    );
    return { requests, incoming, sent, recent, returned };
  }, [replica, space, viewerId]);
  return { ...query, data };
}

export function useRequestSendMutation() {
  return useOp((body: import("@tudu/shared").RequestSendBody) => ({
    type: "request.send" as const,
    id: crypto.randomUUID(),
    body,
  }));
}

export function useRequestReassignMutation() {
  return useOp((body: import("@tudu/shared").RequestReassignBody) => ({
    type: "request.reassign" as const,
    id: crypto.randomUUID(),
    body,
  }));
}

export function useRequestProposeMutation() {
  return useOp((body: import("@tudu/shared").RequestProposeBody) => ({
    type: "request.propose" as const,
    id: crypto.randomUUID(),
    body,
  }));
}

export function useRequestAcceptMutation() {
  return useOp((body: import("@tudu/shared").RequestAcceptBody) => ({
    type: "request.accept" as const,
    body,
  }));
}

export function useRequestDeclineMutation() {
  return useOp((body: import("@tudu/shared").RequestDeclineBody) => ({
    type: "request.decline" as const,
    body,
  }));
}

export function useRequestWithdrawMutation() {
  return useOp((requestId: string) => ({
    type: "request.withdraw" as const,
    body: { requestId },
  }));
}

export function useRequestReturnedTakeMutation() {
  return useOp((body: import("@tudu/shared").RequestReturnedTakeBody) => ({
    type: "request.returned.take" as const,
    body,
  }));
}

export function useRequestReturnedResendMutation() {
  return useOp(
    (body: import("@tudu/shared").RequestReturnedResendBody & { newRequestId?: string }) => ({
      type: "request.returned.resend" as const,
      id: body.newRequestId ?? crypto.randomUUID(),
      body: { requestId: body.requestId, toUserId: body.toUserId },
    }),
  );
}

export function useRequestReturnedDiscardMutation() {
  return useOp((requestId: string) => ({
    type: "request.returned.discard" as const,
    body: { requestId },
  }));
}

