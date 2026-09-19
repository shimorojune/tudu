import type { NotificationPreferencesResponse } from "@tudu/shared";
import { baseApi } from "./baseApi.js";

export const notificationSettingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotificationSettings: builder.query<NotificationPreferencesResponse, void>(
      {
        query: () => "/settings/notifications",
        providesTags: ["NotificationSettings"],
      },
    ),
    updateNotificationSettings: builder.mutation<
      NotificationPreferencesResponse,
      Partial<NotificationPreferencesResponse>
    >({
      query: (body) => ({
        url: "/settings/notifications",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["NotificationSettings"],
    }),
    reportClientVersion: builder.mutation<{ ok: boolean }, { version: string }>({
      query: (body) => ({
        url: "/settings/client-version",
        method: "PUT",
        body,
      }),
    }),
  }),
});

export const {
  useGetNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
  useReportClientVersionMutation,
} = notificationSettingsApi;
