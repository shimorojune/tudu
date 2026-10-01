import type {
  CreateOrgBody,
  CreateOrgInviteBody,
  CreateOrgInviteResponse,
  ResendOrgInviteResponse,
  HandoverPreview,
  InvitePreview,
  JoinPreview,
  MyInviteSummary,
  OrgAuditResponse,
  OrgDetail,
  OrgInvitesResponse,
  OrgMemberSummary,
  CoworkerDayResponse,
  CoworkerRosterResponse,
  SpaceListItem,
  UpdateOrgBody,
} from "@tudu/shared";
import { baseApi } from "./baseApi.js";

export type OrgErrorPayload = {
  error: string;
  code: string;
};

export const orgsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSpaces: builder.query<{ spaces: SpaceListItem[] }, void>({
      query: () => "/orgs",
      providesTags: [{ type: "OrgSpaces", id: "LIST" }],
    }),
    getOrg: builder.query<OrgDetail, string>({
      query: (slug) => `/orgs/${slug}`,
      providesTags: (_result, _error, slug) => [{ type: "Org", id: slug }],
    }),
    createOrg: builder.mutation<
      { org: { id: string; slug: string; name: string }; spaces: SpaceListItem[] },
      CreateOrgBody
    >({
      query: (body) => ({
        url: "/orgs",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "OrgSpaces", id: "LIST" }],
    }),
    updateOrgKeyPrefix: builder.mutation<
      { keyPrefix: string },
      { slug: string; keyPrefix: string }
    >({
      query: ({ slug, keyPrefix }) => ({
        url: `/orgs/${slug}/key-prefix`,
        method: "PATCH",
        body: { keyPrefix },
      }),
      invalidatesTags: (_result, _error, { slug }) => [
        { type: "Org", id: slug },
        { type: "OrgSpaces", id: "LIST" },
      ],
    }),
    updateOrg: builder.mutation<
      Pick<OrgDetail, "slug" | "name" | "color" | "allowedDomains" | "joinLinkEnabled">,
      { slug: string; body: UpdateOrgBody }
    >({
      query: ({ slug, body }) => ({
        url: `/orgs/${slug}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { slug }) => [
        { type: "Org", id: slug },
        { type: "OrgSpaces", id: "LIST" },
      ],
    }),
    listOrgInvites: builder.query<OrgInvitesResponse, string>({
      query: (slug) => `/orgs/${slug}/invites`,
      providesTags: (_result, _error, slug) => [
        { type: "OrgInvites", id: slug },
      ],
    }),
    listOrgAudit: builder.query<
      OrgAuditResponse,
      { slug: string; cursor?: string }
    >({
      query: ({ slug, cursor }) =>
        cursor
          ? `/orgs/${slug}/audit?cursor=${encodeURIComponent(cursor)}`
          : `/orgs/${slug}/audit`,
      providesTags: (_result, _error, { slug }) => [
        { type: "OrgAudit", id: slug },
      ],
    }),
    leaveOrg: builder.mutation<
      void,
      { slug: string; handoverTo?: string }
    >({
      query: ({ slug, handoverTo }) => ({
        url: `/orgs/${slug}/leave`,
        method: "POST",
        body: { handoverTo },
      }),
      invalidatesTags: [{ type: "OrgSpaces", id: "LIST" }],
    }),
    deleteOrg: builder.mutation<void, { slug: string; confirmName: string }>({
      query: ({ slug, confirmName }) => ({
        url: `/orgs/${slug}`,
        method: "DELETE",
        body: { confirmName },
      }),
      invalidatesTags: [{ type: "OrgSpaces", id: "LIST" }],
    }),
    listOrgMembers: builder.query<{ members: OrgMemberSummary[] }, string>({
      query: (slug) => `/orgs/${slug}/members`,
      providesTags: (_result, _error, slug) => [
        { type: "OrgMembers", id: slug },
      ],
    }),
    listCoworkerRoster: builder.query<
      CoworkerRosterResponse,
      { slug: string; date: string }
    >({
      query: ({ slug, date }) =>
        `/orgs/${slug}/coworkers?date=${encodeURIComponent(date)}`,
      providesTags: (_result, _error, { slug }) => [
        { type: "OrgCoworkers", id: slug },
      ],
    }),
    getCoworkerDay: builder.query<
      CoworkerDayResponse,
      { slug: string; userId: string; date: string }
    >({
      query: ({ slug, userId, date }) =>
        `/orgs/${slug}/coworkers/${userId}/day?date=${encodeURIComponent(date)}`,
      providesTags: (_result, _error, { slug, userId }) => [
        { type: "OrgCoworkers", id: `${slug}:${userId}` },
      ],
    }),
    createOrgInvite: builder.mutation<
      CreateOrgInviteResponse,
      { slug: string; body: CreateOrgInviteBody }
    >({
      query: ({ slug, body }) => ({
        url: `/orgs/${slug}/invites`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { slug }) => [
        { type: "OrgInvites", id: slug },
        { type: "Org", id: slug },
      ],
    }),
    resendOrgInvite: builder.mutation<
      ResendOrgInviteResponse,
      { slug: string; inviteId: string }
    >(
      {
        query: ({ slug, inviteId }) => ({
          url: `/orgs/${slug}/invites/${inviteId}/resend`,
          method: "POST",
        }),
        invalidatesTags: (_result, _error, { slug }) => [
          { type: "OrgInvites", id: slug },
        ],
      },
    ),
    revokeOrgInvite: builder.mutation<void, { slug: string; inviteId: string }>({
      query: ({ slug, inviteId }) => ({
        url: `/orgs/${slug}/invites/${inviteId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { slug }) => [
        { type: "OrgInvites", id: slug },
      ],
    }),
    regenerateJoinLink: builder.mutation<
      { joinCode: string },
      string
    >({
      query: (slug) => ({
        url: `/orgs/${slug}/join-link/regenerate`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, slug) => [
        { type: "OrgInvites", id: slug },
        { type: "Org", id: slug },
      ],
    }),
    approveJoinRequest: builder.mutation<
      void,
      { slug: string; requestId: string }
    >({
      query: ({ slug, requestId }) => ({
        url: `/orgs/${slug}/join-requests/${requestId}/approve`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { slug }) => [
        { type: "OrgInvites", id: slug },
        { type: "OrgMembers", id: slug },
        { type: "OrgSpaces", id: "LIST" },
      ],
    }),
    declineJoinRequest: builder.mutation<
      void,
      { slug: string; requestId: string }
    >({
      query: ({ slug, requestId }) => ({
        url: `/orgs/${slug}/join-requests/${requestId}/decline`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { slug }) => [
        { type: "OrgInvites", id: slug },
      ],
    }),
    getHandoverPreview: builder.query<
      HandoverPreview,
      { slug: string; userId: string }
    >({
      query: ({ slug, userId }) => `/orgs/${slug}/handover/${userId}`,
    }),
    getInvitePreview: builder.query<InvitePreview, string>({
      query: (token) => `/invites/${token}`,
    }),
    acceptInvite: builder.mutation<{ orgSlug: string }, string>({
      query: (token) => ({
        url: `/invites/${token}/accept`,
        method: "POST",
      }),
      invalidatesTags: [{ type: "OrgSpaces", id: "LIST" }],
    }),
    listMyInvites: builder.query<{ invites: MyInviteSummary[] }, void>({
      query: () => "/me/invites",
    }),
    getJoinPreview: builder.query<JoinPreview, string>({
      query: (code) => `/join/${code}`,
    }),
    requestJoin: builder.mutation<void, string>({
      query: (code) => ({
        url: `/join/${code}`,
        method: "POST",
      }),
    }),
  }),
});

export const {
  useListSpacesQuery,
  useGetOrgQuery,
  useCreateOrgMutation,
  useUpdateOrgMutation,
  useUpdateOrgKeyPrefixMutation,
  useListOrgInvitesQuery,
  useListOrgAuditQuery,
  useLeaveOrgMutation,
  useDeleteOrgMutation,
  useListOrgMembersQuery,
  useListCoworkerRosterQuery,
  useGetCoworkerDayQuery,
  useCreateOrgInviteMutation,
  useResendOrgInviteMutation,
  useRevokeOrgInviteMutation,
  useRegenerateJoinLinkMutation,
  useApproveJoinRequestMutation,
  useDeclineJoinRequestMutation,
  useGetHandoverPreviewQuery,
  useGetInvitePreviewQuery,
  useAcceptInviteMutation,
  useListMyInvitesQuery,
  useGetJoinPreviewQuery,
  useRequestJoinMutation,
} = orgsApi;
