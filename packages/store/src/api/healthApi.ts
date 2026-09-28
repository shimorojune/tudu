import type { HealthResponse, MeResponse } from "@tudu/shared";
import { baseApi } from "./baseApi.js";

export const healthApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getHealth: builder.query<HealthResponse, void>({
      query: () => "/health",
      providesTags: ["Health"],
    }),
    getMe: builder.query<MeResponse, void>({
      query: () => "/me",
      providesTags: ["Me"],
    }),
    completeOnboarding: builder.mutation<MeResponse, void>({
      query: () => ({
        url: "/me",
        method: "PATCH",
        body: { completeOnboarding: true },
      }),
      invalidatesTags: ["Me"],
    }),
  }),
});

export const { useGetHealthQuery, useGetMeQuery, useCompleteOnboardingMutation } =
  healthApi;
