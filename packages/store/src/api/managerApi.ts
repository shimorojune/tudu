import type {
  AcceptInboxRequest,
  CreateInviteRequest,
  DeclineInboxRequest,
  InboxCountResponse,
  InboxResponse,
  Lane,
  ReportDayResponse,
  ReorderRequest,
  SendInboxTaskRequest,
  TeamResponse,
} from "@tudu/shared";
import { baseApi } from "./baseApi.js";

function applyLanesToReportTasks(
  tasks: ReportDayResponse["tasks"],
  lanes: Lane[],
  date: string,
): ReportDayResponse["tasks"] {
  const placementById = new Map<
    string,
    { scheduledDate: string | null; bucket: Lane["bucket"]; position: number }
  >();

  for (const lane of lanes) {
    lane.taskIds.forEach((taskId, index) => {
      placementById.set(taskId, {
        scheduledDate: lane.scheduledDate,
        bucket: lane.bucket,
        position: index,
      });
    });
  }

  return tasks
    .map((task) => {
      const placement = placementById.get(task.id);
      if (!placement) {
        return task;
      }
      return {
        ...task,
        scheduledDate: placement.scheduledDate,
        bucket: placement.bucket,
        position: placement.position,
      };
    })
    .filter((task) => task.scheduledDate === date)
    .sort((a, b) => a.position - b.position);
}

export const managerApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInbox: builder.query<InboxResponse, void>({
      query: () => "/inbox",
      providesTags: ["Inbox"],
    }),
    getInboxCount: builder.query<InboxCountResponse, void>({
      query: () => "/inbox/count",
      providesTags: ["Inbox"],
    }),
    acceptInboxItem: builder.mutation<void, { id: string } & AcceptInboxRequest>(
      {
        query: ({ id, bucket, scheduledDate }) => ({
          url: `/inbox/${id}/accept`,
          method: "POST",
          body: { bucket, scheduledDate },
        }),
        invalidatesTags: ["Inbox", "Task", "Team"],
      },
    ),
    declineInboxItem: builder.mutation<
      void,
      { id: string } & DeclineInboxRequest
    >({
      query: ({ id, reason }) => ({
        url: `/inbox/${id}/decline`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["Inbox", "Task", "Team"],
    }),
    getTeam: builder.query<TeamResponse, string | void>({
      query: (date) =>
        date ? { url: "/team", params: { date } } : "/team",
      providesTags: ["Team"],
    }),
    createTeamInvite: builder.mutation<{ id: string; email: string }, CreateInviteRequest>(
      {
        query: (body) => ({
          url: "/team/invites",
          method: "POST",
          body,
        }),
        invalidatesTags: ["Team"],
      },
    ),
    acceptTeamInvite: builder.mutation<void, string>({
      query: (id) => ({
        url: `/team/invites/${id}/accept`,
        method: "POST",
      }),
      invalidatesTags: ["Team"],
    }),
    declineTeamInvite: builder.mutation<void, string>({
      query: (id) => ({
        url: `/team/invites/${id}/decline`,
        method: "POST",
      }),
      invalidatesTags: ["Team"],
    }),
    getReportDay: builder.query<
      ReportDayResponse,
      { userId: string; date: string }
    >({
      query: ({ userId, date }) => ({
        url: `/team/${userId}/day`,
        params: { date },
      }),
      providesTags: (_result, _error, arg) => [
        { type: "Team", id: `${arg.userId}:${arg.date}` },
        "Team",
        "Task",
      ],
    }),
    sendInboxTask: builder.mutation<
      { taskId: string; inboxItemId: string },
      { userId: string } & SendInboxTaskRequest
    >({
      query: ({ userId, ...body }) => ({
        url: `/team/${userId}/tasks`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Inbox", "Team"],
    }),
    reorderReportTasks: builder.mutation<
      void,
      { userId: string } & ReorderRequest
    >({
      query: ({ userId, lanes }) => ({
        url: `/team/${userId}/reorder`,
        method: "PATCH",
        body: { lanes },
      }),
      async onQueryStarted({ userId, lanes }, { dispatch, queryFulfilled }) {
        const dates = [
          ...new Set(
            lanes
              .map((lane) => lane.scheduledDate)
              .filter((value): value is string => value !== null),
          ),
        ];
        const patches = dates.map((date) =>
          dispatch(
            managerApi.util.updateQueryData(
              "getReportDay",
              { userId, date },
              (draft) => {
                draft.tasks = applyLanesToReportTasks(draft.tasks, lanes, date);
              },
            ),
          ),
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
    deleteReportTask: builder.mutation<
      void,
      { userId: string; taskId: string }
    >({
      query: ({ userId, taskId }) => ({
        url: `/team/${userId}/tasks/${taskId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Task", "Team", "Inbox"],
    }),
  }),
});

export const {
  useGetInboxQuery,
  useGetInboxCountQuery,
  useAcceptInboxItemMutation,
  useDeclineInboxItemMutation,
  useGetTeamQuery,
  useCreateTeamInviteMutation,
  useAcceptTeamInviteMutation,
  useDeclineTeamInviteMutation,
  useGetReportDayQuery,
  useSendInboxTaskMutation,
  useReorderReportTasksMutation,
  useDeleteReportTaskMutation,
} = managerApi;
