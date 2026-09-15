import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

const issueKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]+-\d+$/i, "Expected a Jira issue key")
  .transform((value) => value.toUpperCase());

const projectKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]+$/i, "Expected a Jira project key")
  .transform((value) => value.toUpperCase());

const jiraBucketSchema = z.enum(["now", "next", "later"]);

const emptyStringToNull = (value: unknown) =>
  typeof value === "string" && ["", "null", "undefined"].includes(value.trim())
    ? null
    : value;

const reservedJiraCreateFieldIds = new Set([
  "project",
  "issuetype",
  "summary",
  "description",
  "duedate",
  "components",
  "assignee",
]);

const jiraCreateExtraFieldsSchema = z
  .record(z.string(), z.unknown())
  .superRefine((fields, ctx) => {
    for (const key of Object.keys(fields)) {
      if (!reservedJiraCreateFieldIds.has(key.toLowerCase())) {
        continue;
      }
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "This Jira field is managed by Tudu",
      });
    }
  });

export const jiraProjectSchema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(255),
});

export type JiraProject = z.infer<typeof jiraProjectSchema>;

export const jiraComponentSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  projectKey: z.string().trim().max(50).default(""),
  description: z.string().nullable().default(null),
  archived: z.boolean().default(false),
});

export type JiraComponent = z.infer<typeof jiraComponentSchema>;

export const jiraUserSchema = z.object({
  accountId: z.string().nullable().default(null),
  key: z.string().nullable().default(null),
  name: z.string().nullable().default(null),
  displayName: z.string().trim().min(1),
  emailAddress: z.string().email().nullable().default(null),
  active: z.boolean().default(true),
  avatarUrl: z.string().url().nullable().default(null),
});

export type JiraUser = z.infer<typeof jiraUserSchema>;

export const jiraStatusCategorySchema = z.enum(["todo", "indeterminate", "done"]);

export const jiraStatusSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  category: jiraStatusCategorySchema,
  colorName: z.string().trim().min(1).nullable().default(null),
});

export type JiraStatus = z.infer<typeof jiraStatusSchema>;

export const jiraLinkedTaskSchema = z.object({
  taskId: z.uuid(),
  title: z.string().trim().min(1),
  isPrivate: z.boolean(),
});

export type JiraLinkedTask = z.infer<typeof jiraLinkedTaskSchema>;

export const jiraTaskLinkSummarySchema = z.object({
  issueId: z.string().trim().min(1),
  key: issueKeySchema,
  summary: z.string().trim().min(1),
  statusName: z.string().trim().min(1),
  dueDate: isoDateSchema.nullable(),
  browseUrl: z.string().url(),
});

export type JiraTaskLinkSummary = z.infer<typeof jiraTaskLinkSummarySchema>;

export const jiraIssueSchema = z.object({
  id: z.string().trim().min(1),
  key: issueKeySchema,
  summary: z.string().trim().min(1).max(1000),
  description: z.string().nullable().default(null),
  renderedDescription: z.string().nullable().default(null),
  status: jiraStatusSchema,
  issueType: z.string().nullable().default(null),
  priority: z.string().nullable().default(null),
  assignee: jiraUserSchema.nullable().default(null),
  dueDate: isoDateSchema.nullable().default(null),
  components: z.array(jiraComponentSchema).default([]),
  updatedAt: z.iso.datetime({ offset: true }),
  browseUrl: z.string().url(),
  linkedTasks: z.array(jiraLinkedTaskSchema).default([]),
  editableFields: z.array(z.enum(["summary", "description", "duedate", "assignee"])).default([]),
});

export type JiraIssue = z.infer<typeof jiraIssueSchema>;

export const jiraCommentSchema = z.object({
  id: z.string().trim().min(1),
  issueId: z.string().trim().min(1),
  issueKey: issueKeySchema,
  author: jiraUserSchema,
  body: z.string(),
  renderedBody: z.string().nullable().default(null),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type JiraComment = z.infer<typeof jiraCommentSchema>;

export const jiraCreateFieldSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  required: z.boolean(),
  schemaType: z.string().nullable().default(null),
  allowedValues: z.array(z.unknown()).default([]),
});

export type JiraCreateField = z.infer<typeof jiraCreateFieldSchema>;

export const jiraCreateMetadataSchema = z.object({
  projectKey: z.string().trim().min(1),
  issueTypes: z.array(
    z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      fields: z.array(jiraCreateFieldSchema),
    }),
  ),
});

export type JiraCreateMetadata = z.infer<typeof jiraCreateMetadataSchema>;

export const jiraConnectionStatusSchema = z.object({
  connected: z.boolean(),
  baseUrl: z.string().url().nullable().default(null),
  displayName: z.string().nullable().default(null),
  email: z.string().email().nullable().default(null),
  projectKeys: z.array(z.string().trim().min(1)).default([]),
  updatedAt: z.iso.datetime({ offset: true }).nullable().default(null),
});

export type JiraConnectionStatus = z.infer<typeof jiraConnectionStatusSchema>;

export const jiraJqlPresetSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  jql: z.string().trim().min(1).max(4000),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type JiraJqlPreset = z.infer<typeof jiraJqlPresetSchema>;

export const jiraJqlPresetCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  jql: z.string().trim().min(1).max(4000),
  isDefault: z.boolean().default(false),
});

export type JiraJqlPresetCreateRequest = z.infer<
  typeof jiraJqlPresetCreateRequestSchema
>;

export const jiraJqlPresetUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    jql: z.string().trim().min(1).max(4000).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export type JiraJqlPresetUpdateRequest = z.infer<
  typeof jiraJqlPresetUpdateRequestSchema
>;

export const jiraJqlPresetParamsSchema = z.object({
  id: z.uuid(),
});

export const jiraConnectRequestSchema = z.object({
  baseUrl: z.string().trim().min(1),
  token: z.string().trim().min(1),
  projectKeys: z.array(projectKeySchema).default([]),
});

export type JiraConnectRequest = z.infer<typeof jiraConnectRequestSchema>;

export const jiraProjectKeysRequestSchema = z.object({
  projectKeys: z.array(projectKeySchema),
});

export type JiraProjectKeysRequest = z.infer<typeof jiraProjectKeysRequestSchema>;

const componentIdsQuerySchema = z.preprocess((value) => {
  if (value == null || value === "") {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) =>
    String(entry)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}, z.array(z.string().trim().min(1)));

export const jiraIssueSearchQuerySchema = z.object({
  q: z.string().trim().default(""),
  jqlPresetId: z.preprocess(emptyStringToNull, z.uuid().nullable().default(null)),
  jql: z.string().trim().max(4000).default(""),
  componentIds: componentIdsQuerySchema,
  startAt: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type JiraIssueSearchQuery = z.infer<typeof jiraIssueSearchQuerySchema>;

export const jiraUserSearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  projectKey: projectKeySchema.optional(),
  issueKey: issueKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type JiraUserSearchQuery = z.infer<typeof jiraUserSearchQuerySchema>;

export const linkJiraTaskRequestSchema = z.object({
  taskId: z.uuid(),
  issueIdOrKey: z.string().trim().min(1),
});

export type LinkJiraTaskRequest = z.infer<typeof linkJiraTaskRequestSchema>;

export const unlinkJiraTaskRequestSchema = z.object({
  taskId: z.uuid(),
  issueIdOrKey: z.string().trim().min(1),
});

export type UnlinkJiraTaskRequest = z.infer<typeof unlinkJiraTaskRequestSchema>;

export const spawnJiraTaskRequestSchema = z
  .object({
    issueId: z.string().trim().min(1),
    title: z.string().trim().min(1, "A task needs a title").max(500),
    description: z.string().trim().max(5000).nullable().default(null),
    scheduledDate: isoDateSchema.nullable().default(null),
    bucket: jiraBucketSchema.nullable().default(null),
    startDate: isoDateSchema.nullable().default(null),
    deadline: z.iso.datetime({ offset: true }).nullable().default(null),
    projectId: z.uuid().nullable().optional(),
  })
  .refine((value) => (value.scheduledDate === null) === (value.bucket === null), {
    message: "A task needs a day and a bucket together, or neither.",
    path: ["bucket"],
  });

export type SpawnJiraTaskRequest = z.infer<typeof spawnJiraTaskRequestSchema>;

export const spawnReportJiraTaskRequestSchema = spawnJiraTaskRequestSchema.extend({
  reportUserId: z.string().trim().min(1),
});

export type SpawnReportJiraTaskRequest = z.infer<
  typeof spawnReportJiraTaskRequestSchema
>;

export const createJiraIssueRequestSchema = z.object({
  projectKey: projectKeySchema,
  issueTypeId: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(1000),
  description: z.string().trim().max(5000).nullable().default(null),
  dueDate: isoDateSchema.nullable().default(null),
  assignee: jiraUserSchema.nullable().default(null),
  componentIds: z.array(z.string().trim().min(1)).default([]),
  fields: jiraCreateExtraFieldsSchema.default({}),
  linkTaskId: z.uuid().nullable().default(null),
});

export type CreateJiraIssueRequest = z.infer<typeof createJiraIssueRequestSchema>;

export const updateJiraIssueFieldsRequestSchema = z
  .object({
    issueIdOrKey: z.string().trim().min(1),
    reportUserId: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).max(1000).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    dueDate: isoDateSchema.nullable().optional(),
    assignee: jiraUserSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "issueIdOrKey" && key !== "reportUserId"), {
    message: "Nothing to update",
  });

export type UpdateJiraIssueFieldsRequest = z.infer<
  typeof updateJiraIssueFieldsRequestSchema
>;

export const createJiraCommentRequestSchema = z.object({
  issueIdOrKey: z.string().trim().min(1),
  reportUserId: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1, "A Jira comment needs text").max(5000),
});

export type CreateJiraCommentRequest = z.infer<
  typeof createJiraCommentRequestSchema
>;

export type JiraRefreshResult = {
  issues: JiraIssue[];
  deletedIssueIds: string[];
  refreshedAt: string;
};

export const jiraIssueDetailQuerySchema = z.object({
  issueIdOrKey: z.string().trim().min(1),
  reportUserId: z.string().trim().min(1).optional(),
});

export const jiraReportQuerySchema = z.object({
  userId: z.string().trim().min(1),
  q: z.string().trim().default(""),
  jqlPresetId: z.preprocess(emptyStringToNull, z.uuid().nullable().default(null)),
  jql: z.string().trim().max(4000).default(""),
  componentIds: componentIdsQuerySchema,
  startAt: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const jiraOpenQuerySchema = z.object({
  issueKey: issueKeySchema,
});

export const jiraCreateMetadataQuerySchema = z.object({
  projectKey: projectKeySchema,
});

export const jiraIssueUrlResponseSchema = z.object({
  url: z.string().url(),
});

export type JiraReportEmptyReason = "no-jira-user";
export type JiraIssuesResponse = {
  issues: JiraIssue[];
  total?: number;
  startAt?: number;
  hasMore?: boolean;
  reason?: JiraReportEmptyReason;
};
export type JiraIssueResponse = { issue: JiraIssue };
export type JiraCommentsResponse = { comments: JiraComment[] };
export type JiraUsersResponse = { users: JiraUser[] };
export type JiraComponentsResponse = { components: JiraComponent[] };
export type JiraProjectsResponse = { projects: JiraProject[] };
export type JiraJqlPresetsResponse = { presets: JiraJqlPreset[] };
export type JiraJqlPresetResponse = { preset: JiraJqlPreset };
export type JiraCreateMetadataResponse = { metadata: JiraCreateMetadata };
export type JiraConnectionResponse = { connection: JiraConnectionStatus };
export type JiraRefreshResponse = { refresh: JiraRefreshResult };
export type JiraIssueUrlResponse = z.infer<typeof jiraIssueUrlResponseSchema>;

const ISSUE_KEY_PATTERN = /[A-Z][A-Z0-9_]+-\d+/i;

export function parseJiraIssueKeyOrUrl(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(ISSUE_KEY_PATTERN);
  return match?.[0]?.toUpperCase() ?? null;
}

export function normalizeJiraBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Jira URL must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Jira URL must use http or https");
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildJiraBrowseUrl(baseUrl: string, issueKey: string): string {
  return `${normalizeJiraBaseUrl(baseUrl)}/browse/${issueKey.toUpperCase()}`;
}

export function jiraIssueToTaskLinkSummary(issue: JiraIssue): JiraTaskLinkSummary {
  return {
    issueId: issue.id,
    key: issue.key,
    summary: issue.summary,
    statusName: issue.status.name,
    dueDate: issue.dueDate,
    browseUrl: issue.browseUrl,
  };
}
