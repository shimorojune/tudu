import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const defaultBaseUrl = "http://localhost:3456";

let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  authTokenGetter = getter;
}

export function resolveApiUrl() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return defaultBaseUrl;
}

export function getAuthToken(): Promise<string | null> {
  return authTokenGetter ? authTokenGetter() : Promise.resolve(null);
}

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: resolveApiUrl(),
    prepareHeaders: async (headers) => {
      const token = await getAuthToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  }),
  endpoints: () => ({}),
  tagTypes: ["Health", "Me", "Task", "Comment", "Timeline", "Inbox", "Team"],
});
