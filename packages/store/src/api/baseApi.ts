import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const defaultBaseUrl = "http://localhost:3456";

let getAuthToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter;
}

function resolveBaseUrl() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return defaultBaseUrl;
}

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: resolveBaseUrl(),
    prepareHeaders: async (headers) => {
      if (getAuthToken) {
        const token = await getAuthToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      }
      return headers;
    },
  }),
  endpoints: () => ({}),
  tagTypes: ["Health", "Me"],
});
