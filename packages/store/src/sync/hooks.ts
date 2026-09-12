import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  effectiveDayIso,
  isSlipping,
  viewKey,
  type AcceptInboxRequest,
  type CreateInviteRequest,
  type CreateProjectRequest,
  type CreateSubtaskRequest,
  type CreateTaskRequest,
  type DeclineInboxRequest,
  type ReorderRequest,
  type ReorderSubtasksRequest,
  type RolloverRequest,
  type SendInboxTaskRequest,
  type TimelineResponse,
  type UpdateCommentRequest,
  type UpdateProjectRequest,
  type UpdateSubtaskRequest,
  type UpdateTaskRequest,
} from "@tudu/shared";
import { getAuthToken, resolveApiUrl } from "../api/baseApi.js";
import type { AppDispatch, RootState } from "../store.js";
import { enqueue, subscribeView } from "./client.js";
import {
  reportDayKey,
  tasksForDay,
  tasksForProject,
  unscheduledForOwner,
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

export function useGetInboxQuery(_arg?: void, options?: QueryOptions) {
  const key = options?.skip ? null : viewKey.inbox();
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({
      pending: replica.inboxPending,
      history: replica.inboxHistory,
      count: replica.inboxPending.length,
    }),
    [replica],
  );
  return { ...query, data };
}

export function useGetInboxCountQuery(_arg?: void, options?: QueryOptions) {
  const result = useGetInboxQuery(undefined, options);
  return {
    ...result,
    data: { count: result.data.count },
  };
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

export function useGetTeamQuery(date?: string | void, options?: QueryOptions) {
  const resolved = date || effectiveDayIso();
  const key = options?.skip ? null : viewKey.team(resolved);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = replica.teamByDate[resolved];
  return { ...query, data };
}

export function useGetReportDayQuery(
  arg: { userId: string; date: string },
  options?: QueryOptions,
) {
  const key = options?.skip ? null : viewKey.reportDay(arg.userId, arg.date);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const stored = replica.reportDays[reportDayKey(arg.userId, arg.date)];
  const data = useMemo(() => {
    if (stored) {
      return stored;
    }
    const tasks = Object.values(replica.tasks).filter(
      (task) =>
        replica.owners[task.id] === arg.userId && task.scheduledDate === arg.date,
    );
    if (tasks.length === 0) {
      return undefined;
    }
    return {
      report: { id: arg.userId, name: "", email: "" },
      date: arg.date,
      tasks,
      slippingCount: tasks.filter((task) =>
        isSlipping({
          carriedDays: task.carriedDays,
          deadline: task.deadline,
        }),
      ).length,
    };
  }, [stored, replica, arg.userId, arg.date]);
  return { ...query, data };
}

export function useGetReportUnscheduledQuery(
  userId: string,
  options?: QueryOptions,
) {
  const key = options?.skip || !userId ? null : viewKey.reportUnscheduled(userId);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(
    () => ({ tasks: userId ? unscheduledForOwner(replica, userId) : [] }),
    [replica, userId],
  );
  return { ...query, data };
}

export function useGetReportInboxQuery(
  userId: string,
  options?: QueryOptions,
) {
  const key = options?.skip || !userId ? null : viewKey.reportInbox(userId);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(() => {
    const bucket = userId ? replica.reportInbox[userId] : undefined;
    const pending = bucket?.pending ?? [];
    return {
      report: bucket?.report,
      pending,
      history: bucket?.history ?? [],
      count: pending.length,
    };
  }, [replica, userId]);
  return { ...query, data };
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
  return useOp((arg: { id: string } & AcceptInboxRequest) => ({
    type: "inbox.accept" as const,
    id: arg.id,
    body: {
      bucket: arg.bucket,
      ...(arg.scheduledDate ? { scheduledDate: arg.scheduledDate } : {}),
    },
  }));
}

export function useDeclineInboxItemMutation() {
  return useOp((arg: { id: string } & DeclineInboxRequest) => ({
    type: "inbox.decline" as const,
    id: arg.id,
    body: { reason: arg.reason },
  }));
}

export function useCreateTeamInviteMutation() {
  return useOp((body: CreateInviteRequest) => ({
    type: "team.invite.create" as const,
    body,
  }));
}

export function useAcceptTeamInviteMutation() {
  return useOp((id: string) => ({ type: "team.invite.accept" as const, id }));
}

export function useDeclineTeamInviteMutation() {
  return useOp((id: string) => ({ type: "team.invite.decline" as const, id }));
}

export function useSendInboxTaskMutation() {
  return useOp((arg: { userId: string } & SendInboxTaskRequest) => ({
    type: "team.task.send" as const,
    id: crypto.randomUUID(),
    userId: arg.userId,
    body: {
      title: arg.title,
      description: arg.description,
      startDate: arg.startDate,
      deadline: arg.deadline,
      projectId: arg.projectId,
    },
  }));
}

export function useReorderReportTasksMutation() {
  return useOp((arg: { userId: string } & ReorderRequest) => ({
    type: "team.task.reorder" as const,
    userId: arg.userId,
    body: { lanes: arg.lanes },
  }));
}

export function useDeleteReportTaskMutation() {
  return useOp((arg: { userId: string; taskId: string }) => ({
    type: "team.task.delete" as const,
    userId: arg.userId,
    taskId: arg.taskId,
  }));
}

export function useReadNotificationMutation() {
  return useOp((id: string) => ({ type: "notification.read" as const, id }));
}

export function useReadAllNotificationsMutation() {
  return useOp((_arg?: void) => ({ type: "notification.readAll" as const }));
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
  userId: string,
  options?: QueryOptions,
) {
  const key = options?.skip || !userId ? null : viewKey.reportProjects(userId);
  const query = useView(key);
  const replica = useSelector(selectVisible);
  const data = useMemo(() => {
    const bucket = replica.reportProjects[userId] ?? {};
    return Object.values(bucket).sort((a, b) => {
      if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) {
        return a.archivedAt ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [replica.reportProjects, userId]);
  return { ...query, data };
}

export function useCreateReportProjectMutation() {
  const dispatch = useDispatch<AppDispatch>();
  const [isLoading, setLoading] = useState(false);
  const trigger = useCallback(
    (arg: { userId: string; body: CreateProjectRequest }) => {
      const id = crypto.randomUUID();
      setLoading(true);
      const promise = dispatch(
        enqueue({
          type: "team.project.create",
          id,
          userId: arg.userId,
          body: arg.body,
        }),
      )
        .then(() => ({ project: { id } }))
        .finally(() => setLoading(false));
      return withUnwrap(promise);
    },
    [dispatch],
  );
  return [trigger, { isLoading }] as const;
}
