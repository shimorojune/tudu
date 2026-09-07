import type { LinkPreview } from "@tudu/shared";
import { baseApi } from "./baseApi.js";

export const linkPreviewApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLinkPreview: builder.query<LinkPreview, string>({
      query: (url) => ({
        url: "/link-preview",
        params: { url },
      }),
      keepUnusedDataFor: 60 * 60,
    }),
  }),
});

export const { useGetLinkPreviewQuery } = linkPreviewApi;
