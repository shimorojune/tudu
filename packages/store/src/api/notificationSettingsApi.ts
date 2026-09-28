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
    getSpacePrefixSettings: builder.query<
      { personalKeyPrefix: string; prefixLocked: boolean },
      void
    >({
      query: () => "/settings/space-prefix",
      providesTags: ["SpacePrefixSettings"],
    }),
    updateSpacePrefixSettings: builder.mutation<
      { personalKeyPrefix: string; prefixLocked: boolean },
      { keyPrefix: string }
    >({
      query: (body) => ({
        url: "/settings/space-prefix",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["SpacePrefixSettings", "OrgSpaces"],
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
  useGetSpacePrefixSettingsQuery,
  useUpdateSpacePrefixSettingsMutation,
  useReportClientVersionMutation,
} = notificationSettingsApi;
