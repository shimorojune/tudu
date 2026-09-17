import { resolveApiUrlFromOptions } from "@tudu/shared";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  authTokenGetter = getter;
}

export function resolveApiUrl() {
  const viteApiUrl = import.meta.env?.VITE_API_URL;
  const hostname =
    typeof globalThis.location?.hostname === "string"
      ? globalThis.location.hostname
      : undefined;
  const isTauri = import.meta.env?.TAURI_ENV_PLATFORM !== undefined;

  return resolveApiUrlFromOptions({
    viteApiUrl,
    isTauri,
    webHostname: hostname,
  });
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
  tagTypes: [
    "Health",
    "Me",
    "Task",
    "Comment",
    "Timeline",
    "Inbox",
    "Team",
    "JiraConnection",
    "JiraIssue",
    "JiraComment",
    "JiraComponent",
    "JiraProject",
    "JiraJqlPreset",
    "JiraUser",
  ],
});
