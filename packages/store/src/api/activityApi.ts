import type {
  Comment,
  CommentResponse,
  CommentsResponse,
  TimelineResponse,
  UpdateCommentRequest,
} from "@tudu/shared";
import type { RootState } from "../store.js";
import { baseApi } from "./baseApi.js";
import { healthApi } from "./healthApi.js";
import { patchAllTaskCaches } from "./taskCache.js";

function readState(getState: () => unknown): RootState {
  return getState() as RootState;
}

export const activityApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getComments: builder.query<CommentsResponse, string>({
      query: (taskId) => `/tasks/${taskId}/comments`,
      providesTags: (_result, _error, taskId) => [{ type: "Comment", id: taskId }],
    }),
    createComment: builder.mutation<
      CommentResponse,
      { taskId: string; body: string }
    >({
      query: ({ taskId, body }) => ({
        url: `/tasks/${taskId}/comments`,
        method: "POST",
        body: { body },
      }),
      async onQueryStarted({ taskId, body }, { dispatch, queryFulfilled, getState }) {
        const tempId = crypto.randomUUID();
        const now = new Date().toISOString();
        const me = healthApi.endpoints.getMe.select()(readState(getState)).data;
        let commentPatch: { undo: () => void } | null = null;

        if (me?.id) {
          const optimistic: Comment = {
            id: tempId,
            taskId,
            authorId: me.id,
            body,
            editedAt: null,
            createdAt: now,
            updatedAt: now,
            author: {
              id: me.id,
              name: me.name ?? me.email,
              email: me.email,
            },
          };

          commentPatch = dispatch(
            activityApi.util.updateQueryData("getComments", taskId, (draft) => {
              draft.comments.push(optimistic);
            }),
          );
        }

        const taskPatches = patchAllTaskCaches(
          dispatch,
          () => readState(getState),
          (tasks) =>
            tasks.map((task) =>
              task.id === taskId
                ? { ...task, commentCount: task.commentCount + 1 }
                : task,
            ),
        );

        try {
          await queryFulfilled;
          const { refetchTimelineFirstPage } = await import("./invalidateTimeline.js");
          await refetchTimelineFirstPage(dispatch, taskId);
        } catch {
          commentPatch?.undo();
          for (const patch of taskPatches) {
            patch.undo();
          }
        }
      },
      invalidatesTags: (_result, _error, { taskId }) => [
        { type: "Comment", id: taskId },
        { type: "Timeline", id: taskId },
        "Task",
      ],
    }),
    updateComment: builder.mutation<
      CommentResponse,
      { id: string; taskId: string; patch: UpdateCommentRequest }
    >({
      query: ({ id, patch }) => ({
        url: `/comments/${id}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: (_result, _error, { taskId }) => [
        { type: "Comment", id: taskId },
        { type: "Timeline", id: taskId },
      ],
    }),
    deleteComment: builder.mutation<void, { id: string; taskId: string }>({
      query: ({ id }) => ({ url: `/comments/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, { taskId }) => [
        { type: "Comment", id: taskId },
        { type: "Timeline", id: taskId },
        "Task",
      ],
    }),
    getTimeline: builder.query<TimelineResponse, string>({
      query: (taskId) => ({
        url: `/tasks/${taskId}/timeline`,
        params: { limit: 50 },
      }),
      providesTags: (_result, _error, taskId) => [
        { type: "Timeline", id: taskId },
      ],
    }),
    getTimelineOlder: builder.query<
      TimelineResponse,
      { taskId: string; before: string }
    >({
      query: ({ taskId, before }) => ({
        url: `/tasks/${taskId}/timeline`,
        params: { before, limit: 50 },
      }),
    }),
  }),
});

export const {
  useGetCommentsQuery,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useDeleteCommentMutation,
  useGetTimelineQuery,
  useLazyGetTimelineOlderQuery,
} = activityApi;
