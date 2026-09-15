import type {
  JiraComponentsResponse,
  JiraConnectRequest,
  JiraConnectionResponse,
  JiraCommentsResponse,
  JiraCreateMetadataResponse,
  JiraIssueResponse,
  JiraIssueSearchQuery,
  JiraIssueUrlResponse,
  JiraIssuesResponse,
  JiraJqlPresetCreateRequest,
  JiraJqlPresetResponse,
  JiraJqlPresetsResponse,
  JiraJqlPresetUpdateRequest,
  JiraProjectKeysRequest,
  JiraProjectsResponse,
  JiraUserSearchQuery,
  JiraUsersResponse,
} from "@tudu/shared";
import { baseApi } from "./baseApi.js";

export const jiraApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getJiraStatus: builder.query<JiraConnectionResponse, void>({
      query: () => "/jira/status",
      providesTags: ["JiraConnection"],
    }),
    connectJira: builder.mutation<JiraConnectionResponse, JiraConnectRequest>({
      query: (body) => ({ url: "/jira/connect", method: "POST", body }),
      invalidatesTags: ["JiraConnection", "JiraProject", "JiraComponent", "JiraIssue"],
    }),
    disconnectJira: builder.mutation<JiraConnectionResponse, void>({
      query: () => ({ url: "/jira/disconnect", method: "POST" }),
      invalidatesTags: ["JiraConnection", "JiraProject", "JiraComponent", "JiraIssue"],
    }),
    getJiraProjects: builder.query<JiraProjectsResponse, void>({
      query: () => "/jira/projects",
      providesTags: ["JiraProject"],
    }),
    getJiraJqlPresets: builder.query<JiraJqlPresetsResponse, void>({
      query: () => "/jira/jql-presets",
      providesTags: ["JiraJqlPreset"],
    }),
    createJiraJqlPreset: builder.mutation<
      JiraJqlPresetResponse,
      JiraJqlPresetCreateRequest
    >({
      query: (body) => ({ url: "/jira/jql-presets", method: "POST", body }),
      invalidatesTags: ["JiraJqlPreset", "JiraIssue"],
    }),
    updateJiraJqlPreset: builder.mutation<
      JiraJqlPresetResponse,
      { id: string; patch: JiraJqlPresetUpdateRequest }
    >({
      query: ({ id, patch }) => ({
        url: `/jira/jql-presets/${id}`,
        method: "PUT",
        body: patch,
      }),
      invalidatesTags: ["JiraJqlPreset", "JiraIssue"],
    }),
    deleteJiraJqlPreset: builder.mutation<{ ok: true }, { id: string }>({
      query: ({ id }) => ({ url: `/jira/jql-presets/${id}`, method: "DELETE" }),
      invalidatesTags: ["JiraJqlPreset", "JiraIssue"],
    }),
    updateJiraProjectKeys: builder.mutation<
      JiraConnectionResponse,
      JiraProjectKeysRequest
    >({
      query: (body) => ({ url: "/jira/projects", method: "PUT", body }),
      invalidatesTags: ["JiraConnection", "JiraProject", "JiraComponent", "JiraIssue"],
    }),
    getJiraComponents: builder.query<JiraComponentsResponse, void>({
      query: () => "/jira/components",
      providesTags: ["JiraComponent"],
    }),
    refreshJiraComponents: builder.mutation<JiraComponentsResponse, void>({
      query: () => ({ url: "/jira/components/refresh", method: "POST" }),
      invalidatesTags: ["JiraComponent"],
    }),
    searchJiraUsers: builder.query<JiraUsersResponse, JiraUserSearchQuery>({
      query: (params) => ({ url: "/jira/users", params }),
      providesTags: ["JiraUser"],
    }),
    searchJiraIssues: builder.query<JiraIssuesResponse, JiraIssueSearchQuery>({
      query: (params) => ({ url: "/jira/issues", params }),
      providesTags: ["JiraIssue"],
    }),
    refreshJiraIssues: builder.mutation<JiraIssuesResponse, void>({
      query: () => ({ url: "/jira/issues/refresh", method: "POST" }),
      invalidatesTags: ["JiraIssue"],
    }),
    getJiraIssue: builder.query<
      JiraIssueResponse,
      { issueIdOrKey: string; reportUserId?: string }
    >({
      query: (params) => ({ url: "/jira/issue", params }),
      providesTags: (_result, _error, arg) => [
        { type: "JiraIssue", id: arg.issueIdOrKey },
        "JiraIssue",
      ],
    }),
    getJiraComments: builder.query<
      JiraCommentsResponse,
      { issueIdOrKey: string; reportUserId?: string }
    >({
      query: (params) => ({ url: "/jira/comments", params }),
      providesTags: (_result, _error, arg) => [
        { type: "JiraComment", id: arg.issueIdOrKey },
        "JiraComment",
      ],
    }),
    getJiraCreateMetadata: builder.query<
      JiraCreateMetadataResponse,
      { projectKey: string }
    >({
      query: (params) => ({ url: "/jira/create-metadata", params }),
    }),
    getJiraIssueUrl: builder.query<JiraIssueUrlResponse, { issueKey: string }>({
      query: (params) => ({ url: "/jira/open", params }),
    }),
    searchReportJiraIssues: builder.query<
      JiraIssuesResponse,
      { userId: string } & JiraIssueSearchQuery
    >({
      query: (params) => ({ url: "/jira/report/issues", params }),
      providesTags: (_result, _error, arg) => [
        { type: "JiraIssue", id: `report:${arg.userId}` },
        "JiraIssue",
      ],
    }),
  }),
});

export const {
  useGetJiraStatusQuery: useGetJiraStatusRestQuery,
  useConnectJiraMutation,
  useDisconnectJiraMutation,
  useGetJiraProjectsQuery,
  useGetJiraJqlPresetsQuery,
  useCreateJiraJqlPresetMutation,
  useUpdateJiraJqlPresetMutation,
  useDeleteJiraJqlPresetMutation,
  useUpdateJiraProjectKeysMutation,
  useGetJiraComponentsQuery: useGetJiraComponentsRestQuery,
  useRefreshJiraComponentsMutation,
  useSearchJiraUsersQuery,
  useLazySearchJiraUsersQuery,
  useSearchJiraIssuesQuery,
  useLazySearchJiraIssuesQuery,
  useRefreshJiraIssuesMutation,
  useGetJiraIssueQuery: useGetJiraIssueRestQuery,
  useLazyGetJiraIssueQuery: useLazyGetJiraIssueRestQuery,
  useGetJiraCommentsQuery: useGetJiraCommentsRestQuery,
  useLazyGetJiraCommentsQuery: useLazyGetJiraCommentsRestQuery,
  useGetJiraCreateMetadataQuery,
  useLazyGetJiraCreateMetadataQuery,
  useGetJiraIssueUrlQuery,
  useLazyGetJiraIssueUrlQuery,
  useSearchReportJiraIssuesQuery,
  useLazySearchReportJiraIssuesQuery,
} = jiraApi;
