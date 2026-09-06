import type {
  CreateSubtaskRequest,
  CreateTaskRequest,
  ReorderRequest,
  ReorderSubtasksRequest,
  TaskResponse,
  TasksResponse,
  UpdateSubtaskRequest,
  UpdateTaskRequest,
} from "@tudu/shared";
import type { RootState } from "../store.js";
import { baseApi } from "./baseApi.js";
import {
  appendOptimisticSubtask,
  applyReorderOptimistic,
  createOptimisticTask,
  mergeTaskPatch,
  patchAllTaskCaches,
  removeTaskFromCaches,
  reorderSubtasksInTask,
  replaceTaskInCaches,
  upsertTaskInCaches,
} from "./taskCache.js";

function readState(getState: () => unknown): RootState {
  return getState() as RootState;
}

export const tasksApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTasksForDay: builder.query<TasksResponse, string>({
      query: (date) => ({ url: "/tasks", params: { date } }),
      providesTags: ["Task"],
    }),
    getUnscheduledTasks: builder.query<TasksResponse, void>({
      query: () => "/tasks/unscheduled",
      providesTags: ["Task"],
    }),
    createTask: builder.mutation<TaskResponse, CreateTaskRequest>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      async onQueryStarted(body, { dispatch, queryFulfilled, getState }) {
        const tempId = crypto.randomUUID();
        const optimistic = createOptimisticTask(body, tempId);
        const patches = upsertTaskInCaches(dispatch, () => readState(getState), optimistic);

        try {
          const { data } = await queryFulfilled;
          for (const patch of patches) {
            patch.undo();
          }
          upsertTaskInCaches(dispatch, () => readState(getState), data.task);
        } catch {
          for (const patch of patches) {
            patch.undo();
          }
        }
      },
    }),
    updateTask: builder.mutation<
      TaskResponse,
      { id: string; patch: UpdateTaskRequest }
    >({
      query: ({ id, patch }) => ({
        url: `/tasks/${id}`,
        method: "PATCH",
        body: patch,
      }),
      async onQueryStarted({ id, patch }, { dispatch, queryFulfilled, getState }) {
        const patches = patchAllTaskCaches(dispatch, () => readState(getState), (tasks) =>
          tasks.map((task) => (task.id === id ? mergeTaskPatch(task, patch) : task)),
        );

        try {
          const { data } = await queryFulfilled;
          for (const entry of patches) {
            entry.undo();
          }
          replaceTaskInCaches(dispatch, () => readState(getState), data.task);
          const { refetchTimelineFirstPage } = await import("./invalidateTimeline.js");
          await refetchTimelineFirstPage(dispatch, id);
        } catch {
          for (const entry of patches) {
            entry.undo();
          }
        }
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: "Timeline", id }],
    }),
    deleteTask: builder.mutation<void, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: "DELETE" }),
      async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
        const patches = removeTaskFromCaches(dispatch, () => readState(getState), id);

        try {
          await queryFulfilled;
        } catch {
          for (const patch of patches) {
            patch.undo();
          }
        }
      },
    }),
    reorderTasks: builder.mutation<void, ReorderRequest>({
      query: (body) => ({ url: "/tasks/reorder", method: "PATCH", body }),
      async onQueryStarted(body, { dispatch, queryFulfilled, getState }) {
        const patches = applyReorderOptimistic(dispatch, () => readState(getState), body.lanes);

        try {
          await queryFulfilled;
          const { refetchTimelineFirstPages } = await import("./invalidateTimeline.js");
          await refetchTimelineFirstPages(
            dispatch,
            body.lanes.flatMap((lane) => lane.taskIds),
          );
        } catch {
          for (const patch of patches) {
            patch.undo();
          }
        }
      },
      invalidatesTags: (_result, _error, { lanes }) =>
        [...new Set(lanes.flatMap((lane) => lane.taskIds))].map((id) => ({
          type: "Timeline" as const,
          id,
        })),
    }),
    createSubtask: builder.mutation<
      TaskResponse,
      { taskId: string; body: CreateSubtaskRequest }
    >({
      query: ({ taskId, body }) => ({
        url: `/tasks/${taskId}/subtasks`,
        method: "POST",
        body,
      }),
      async onQueryStarted({ taskId, body }, { dispatch, queryFulfilled, getState }) {
        const tempId = crypto.randomUUID();
        const patches = patchAllTaskCaches(dispatch, () => readState(getState), (tasks) =>
          tasks.map((task) =>
            task.id === taskId ? appendOptimisticSubtask(task, body, tempId) : task,
          ),
        );

        try {
          const { data } = await queryFulfilled;
          for (const patch of patches) {
            patch.undo();
          }
          replaceTaskInCaches(dispatch, () => readState(getState), data.task);
        } catch {
          for (const patch of patches) {
            patch.undo();
          }
        }
      },
    }),
    updateSubtask: builder.mutation<
      TaskResponse,
      { id: string; patch: UpdateSubtaskRequest }
    >({
      query: ({ id, patch }) => ({
        url: `/subtasks/${id}`,
        method: "PATCH",
        body: patch,
      }),
      async onQueryStarted({ id, patch }, { dispatch, queryFulfilled, getState }) {
        const patches = patchAllTaskCaches(dispatch, () => readState(getState), (tasks) =>
          tasks.map((task) => ({
            ...task,
            subtasks: task.subtasks.map((subtask) =>
              subtask.id === id ? { ...subtask, ...patch } : subtask,
            ),
          })),
        );

        try {
          const { data } = await queryFulfilled;
          for (const entry of patches) {
            entry.undo();
          }
          replaceTaskInCaches(dispatch, () => readState(getState), data.task);
        } catch {
          for (const entry of patches) {
            entry.undo();
          }
        }
      },
    }),
    deleteSubtask: builder.mutation<void, string>({
      query: (id) => ({ url: `/subtasks/${id}`, method: "DELETE" }),
      async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
        const patches = patchAllTaskCaches(dispatch, () => readState(getState), (tasks) =>
          tasks.map((task) => ({
            ...task,
            subtasks: task.subtasks.filter((subtask) => subtask.id !== id),
          })),
        );

        try {
          await queryFulfilled;
        } catch {
          for (const patch of patches) {
            patch.undo();
          }
        }
      },
    }),
    reorderSubtasks: builder.mutation<
      TaskResponse,
      { taskId: string; body: ReorderSubtasksRequest }
    >({
      query: ({ taskId, body }) => ({
        url: `/tasks/${taskId}/subtasks/reorder`,
        method: "PATCH",
        body,
      }),
      async onQueryStarted({ taskId, body }, { dispatch, queryFulfilled, getState }) {
        const patches = patchAllTaskCaches(dispatch, () => readState(getState), (tasks) =>
          tasks.map((task) =>
            task.id === taskId
              ? reorderSubtasksInTask(task, body.subtaskIds)
              : task,
          ),
        );

        try {
          const { data } = await queryFulfilled;
          for (const patch of patches) {
            patch.undo();
          }
          replaceTaskInCaches(dispatch, () => readState(getState), data.task);
        } catch {
          for (const patch of patches) {
            patch.undo();
          }
        }
      },
    }),
  }),
});

export const {
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useReorderTasksMutation,
  useCreateSubtaskMutation,
  useUpdateSubtaskMutation,
  useDeleteSubtaskMutation,
  useReorderSubtasksMutation,
} = tasksApi;
