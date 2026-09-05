import type {
  CreateSubtaskRequest,
  CreateTaskRequest,
  ReorderRequest,
  TaskResponse,
  TasksResponse,
  UpdateSubtaskRequest,
  UpdateTaskRequest,
} from "@tudu/shared";
import { baseApi } from "./baseApi.js";

/** A single drag can move a task between a day and the backlog, so every mutation
    invalidates the whole Task tag rather than trying to be surgical. Step 4 replaces
    this with optimistic updates. */
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
      invalidatesTags: ["Task"],
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
      invalidatesTags: ["Task"],
    }),
    deleteTask: builder.mutation<void, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: "DELETE" }),
      invalidatesTags: ["Task"],
    }),
    reorderTasks: builder.mutation<void, ReorderRequest>({
      query: (body) => ({ url: "/tasks/reorder", method: "PATCH", body }),
      invalidatesTags: ["Task"],
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
      invalidatesTags: ["Task"],
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
      invalidatesTags: ["Task"],
    }),
    deleteSubtask: builder.mutation<void, string>({
      query: (id) => ({ url: `/subtasks/${id}`, method: "DELETE" }),
      invalidatesTags: ["Task"],
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
} = tasksApi;
