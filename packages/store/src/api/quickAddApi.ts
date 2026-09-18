import type {
  QuickAddSuggestRequest,
  QuickAddSuggestResponse,
} from "@tudu/shared";
import { baseApi } from "./baseApi.js";

export const quickAddApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    quickAddSuggest: builder.mutation<
      QuickAddSuggestResponse,
      QuickAddSuggestRequest
    >({
      query: (body) => ({
        url: "/quick-add/suggest",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const { useQuickAddSuggestMutation } = quickAddApi;
