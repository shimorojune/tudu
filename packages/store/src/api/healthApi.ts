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
  }),
});

export const { useGetHealthQuery, useGetMeQuery } = healthApi;
