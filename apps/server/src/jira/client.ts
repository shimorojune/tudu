import {
  buildJiraBrowseUrl,
  normalizeJiraBaseUrl,
  type CreateJiraIssueRequest,
  type JiraComment,
  type JiraComponent,
  type JiraCreateMetadata,
  type JiraIssue,
  type JiraUser,
} from "@tudu/shared";

export type JiraAdapter = {
  myself(): Promise<JiraUser>;
  getProject(projectKey: string): Promise<{ key: string; name: string }>;
  listProjects(): Promise<{ key: string; name: string }[]>;
  listComponents(projectKey: string): Promise<JiraComponent[]>;
  searchUsers(query: string, args?: { projectKey?: string; issueKey?: string; limit?: number }): Promise<JiraUser[]>;
  findUsers(query: string, args?: { limit?: number }): Promise<JiraUser[]>;
  searchIssues(
    jql: string,
    args?: { maxResults?: number; startAt?: number },
  ): Promise<{ issues: JiraIssue[]; total: number }>;
  getIssue(issueIdOrKey: string): Promise<JiraIssue>;
  getCreateMetadata(projectKey: string): Promise<JiraCreateMetadata>;
  getEditFields(issueIdOrKey: string): Promise<JiraIssue["editableFields"]>;
  createIssue(input: CreateJiraIssueRequest): Promise<JiraIssue>;
  updateIssue(issueIdOrKey: string, fields: Partial<Pick<JiraIssue, "summary" | "description" | "dueDate" | "assignee">>): Promise<JiraIssue>;
  assignIssue(issueIdOrKey: string, assignee: JiraUser | null): Promise<JiraIssue>;
  listComments(issueIdOrKey: string): Promise<JiraComment[]>;
  addComment(issueIdOrKey: string, body: string): Promise<JiraComment>;
  browseUrl(issueKey: string): string;
};

export type JiraAdapterFactory = (args: {
  baseUrl: string;
  token: string;
}) => JiraAdapter;

type RawJiraUser = {
  accountId?: string | null;
  key?: string | null;
  name?: string | null;
  displayName?: string | null;
  emailAddress?: string | null;
  active?: boolean;
  avatarUrls?: Record<string, string>;
};

type RawJiraIssue = {
  id?: string | null;
  key?: string | null;
  fields?: Record<string, unknown>;
  renderedFields?: Record<string, unknown>;
};

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function dateFromJira(value: string): string {
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  return new Date(normalized).toISOString();
}

function statusCategory(raw: unknown): JiraIssue["status"]["category"] {
  if (raw === "done") {
    return "done";
  }
  if (raw === "indeterminate" || raw === "in-progress" || raw === "new") {
    return "indeterminate";
  }
  return "todo";
}

function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeProjectKeys(projectKeys: string[]): string[] {
  return projectKeys.map((key) => {
    const normalized = key.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]+$/.test(normalized)) {
      throw new Error("Expected a Jira project key");
    }
    return normalized;
  });
}

export function normalizeJiraUser(raw: RawJiraUser): JiraUser {
  return {
    accountId: raw.accountId ?? null,
    key: raw.key ?? null,
    name: raw.name ?? null,
    displayName: raw.displayName?.trim() || raw.name || raw.key || "Unknown Jira user",
    emailAddress: raw.emailAddress ?? null,
    active: raw.active ?? true,
    avatarUrl: raw.avatarUrls?.["48x48"] ?? raw.avatarUrls?.["32x32"] ?? null,
  };
}

export function normalizeJiraIssue(
  baseUrl: string,
  raw: RawJiraIssue,
  editableFields: JiraIssue["editableFields"] = [],
): JiraIssue {
  const fields = raw.fields ?? {};
  const status = (fields.status ?? {}) as {
    id?: string;
    name?: string;
    statusCategory?: { key?: string; colorName?: string };
  };
  const issueType = fields.issuetype as { name?: string } | undefined;
  const priority = fields.priority as { name?: string } | undefined;
  const assignee = fields.assignee as RawJiraUser | null | undefined;
  const components = Array.isArray(fields.components)
    ? (fields.components as { id?: string; name?: string }[]).flatMap((component) => {
        if (!component.id || !component.name) {
          return [];
        }
        return [
          {
            id: component.id,
            name: component.name,
            projectKey: "",
            description: null,
            archived: false,
          },
        ];
      })
    : [];
  const key = raw.key ?? "";
  const updated = stringField(fields.updated) ?? new Date().toISOString();

  return {
    id: raw.id ?? key,
    key,
    summary: stringField(fields.summary) ?? key,
    description: stringField(fields.description),
    renderedDescription: stringField(raw.renderedFields?.description),
    status: {
      id: status.id ?? "unknown",
      name: status.name ?? "Unknown",
      category: statusCategory(status.statusCategory?.key),
      colorName: stringField(status.statusCategory?.colorName),
    },
    issueType: issueType?.name ?? null,
    priority: priority?.name ?? null,
    assignee: assignee ? normalizeJiraUser(assignee) : null,
    dueDate: stringField(fields.duedate),
    components,
    updatedAt: dateFromJira(updated),
    browseUrl: buildJiraBrowseUrl(baseUrl, key),
    linkedTasks: [],
    editableFields,
  };
}

function componentInClause(componentIds: string[] | undefined): string | null {
  const ids = [...new Set((componentIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return null;
  }
  if (ids.some((id) => !/^[A-Za-z0-9._-]+$/.test(id))) {
    throw new Error("Expected a Jira Component id");
  }
  return `component in (${ids.join(",")})`;
}

export function buildAssignedIssuesJql(
  projectKeys: string[],
  updatedSince: Date | null,
  filters: {
    query?: string;
    componentIds?: string[];
    presetJql?: string | null;
    jql?: string | null;
  } = {},
): string {
  const jql = filters.jql?.trim();
  if (jql) {
    return jql;
  }
  const preset = filters.presetJql?.trim();
  if (preset) {
    return preset;
  }

  const parts = ["assignee = currentUser()", "resolution = Unresolved"];
  const normalizedProjectKeys = normalizeProjectKeys(projectKeys);
  if (normalizedProjectKeys.length > 0) {
    parts.push(`project in (${normalizedProjectKeys.join(",")})`);
  }
  const query = filters.query?.trim();
  const componentClause = componentInClause(filters.componentIds);
  if (updatedSince && !query && !componentClause) {
    const stamp = updatedSince.toISOString().slice(0, 16).replace("T", " ");
    parts.push(`updated >= "${stamp}"`);
  }
  if (query) {
    parts.push(`text ~ "${escapeJqlString(query)}"`);
  }
  if (componentClause) {
    parts.push(componentClause);
  }
  return `${parts.join(" AND ")} ORDER BY updated DESC`;
}

export function buildChangedCachedIssuesJql(
  issueKeys: string[],
  updatedSince: Date | null,
): string | null {
  const keys = [...new Set(issueKeys.map((key) => key.trim()).filter(Boolean))];
  if (!updatedSince || keys.length === 0) {
    return null;
  }

  const stamp = updatedSince.toISOString().slice(0, 16).replace("T", " ");
  return `issuekey in (${keys.join(",")}) AND updated >= "${stamp}" ORDER BY updated DESC`;
}

export function buildAssignedCachedIssuesJql(
  issueKeys: string[],
  projectKeys: string[],
): string | null {
  const keys = [...new Set(issueKeys.map((key) => key.trim()).filter(Boolean))];
  if (keys.length === 0) {
    return null;
  }
  const normalizedProjectKeys = normalizeProjectKeys(projectKeys);
  const parts = [
    `issuekey in (${keys.join(",")})`,
    "assignee = currentUser()",
    "resolution = Unresolved",
  ];
  if (normalizedProjectKeys.length > 0) {
    parts.push(`project in (${normalizedProjectKeys.join(",")})`);
  }
  return `${parts.join(" AND ")} ORDER BY updated DESC`;
}

export function matchReportJiraUser(users: JiraUser[], email: string): JiraUser | undefined {
  const needle = email.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  const username = needle.includes("@") ? needle.slice(0, needle.indexOf("@")) : needle;
  return users.find((user) => {
    const emailAddress = user.emailAddress?.toLowerCase();
    const name = user.name?.toLowerCase();
    const key = user.key?.toLowerCase();
    const displayName = user.displayName.toLowerCase();
    return (
      emailAddress === needle ||
      name === needle ||
      name === username ||
      key === needle ||
      key === username ||
      displayName === needle
    );
  });
}

export function isSameJiraUser(
  a: Pick<JiraUser, "accountId" | "key" | "name" | "emailAddress"> | null | undefined,
  b: Pick<JiraUser, "accountId" | "key" | "name" | "emailAddress"> | null | undefined,
): boolean {
  if (!a || !b) {
    return false;
  }
  return Boolean(
    (a.emailAddress &&
      b.emailAddress &&
      a.emailAddress.toLowerCase() === b.emailAddress.toLowerCase()) ||
      (a.name && b.name && a.name === b.name) ||
      (a.key && b.key && a.key === b.key) ||
      (a.accountId && b.accountId && a.accountId === b.accountId),
  );
}

export function issueAssignedToJiraUser(issue: JiraIssue, user: JiraUser): boolean {
  const assignee = issue.assignee;
  if (!assignee) {
    return false;
  }
  return isSameJiraUser(assignee, user);
}

export function buildReportAssignedIssuesJql(
  jiraUser: Pick<JiraUser, "accountId" | "key" | "name">,
  projectKeys: string[],
  filters: {
    query?: string;
    componentIds?: string[];
    presetJql?: string | null;
    jql?: string | null;
  } = {},
): string {
  const jql = filters.jql?.trim();
  if (jql) {
    return jql;
  }
  const preset = filters.presetJql?.trim();
  if (preset) {
    return preset;
  }

  const assignee = jiraUser.name ?? jiraUser.key ?? jiraUser.accountId;
  if (!assignee) {
    throw new Error("Jira user needs an assignable identity");
  }
  const parts = [`assignee = "${escapeJqlString(assignee)}"`, "resolution = Unresolved"];
  const normalizedProjectKeys = normalizeProjectKeys(projectKeys);
  if (normalizedProjectKeys.length > 0) {
    parts.push(`project in (${normalizedProjectKeys.join(",")})`);
  }
  const query = filters.query?.trim();
  if (query) {
    parts.push(`text ~ "${escapeJqlString(query)}"`);
  }
  const componentClause = componentInClause(filters.componentIds);
  if (componentClause) {
    parts.push(componentClause);
  }
  return `${parts.join(" AND ")} ORDER BY updated DESC`;
}

export class JiraHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "JiraHttpError";
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

export class JiraDataCenterClient implements JiraAdapter {
  readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token: string) {
    this.baseUrl = normalizeJiraBaseUrl(baseUrl);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new JiraHttpError(`Jira request failed with ${response.status}`, response.status);
    }

    return (await readJson(response)) as T;
  }

  async myself(): Promise<JiraUser> {
    return normalizeJiraUser(await this.request<RawJiraUser>("/rest/api/2/myself"));
  }

  async getProject(projectKey: string): Promise<{ key: string; name: string }> {
    const project = await this.request<{ key?: string; name?: string }>(
      `/rest/api/2/project/${encodeURIComponent(projectKey)}`,
    );
    return { key: project.key ?? projectKey, name: project.name ?? projectKey };
  }

  async listProjects(): Promise<{ key: string; name: string }[]> {
    const rows = await this.request<{ key?: string; name?: string }[]>(
      "/rest/api/2/project",
    );
    return rows.flatMap((row) =>
      row.key && row.name ? [{ key: row.key, name: row.name }] : [],
    );
  }

  async listComponents(projectKey: string): Promise<JiraComponent[]> {
    const rows = await this.request<{ id?: string; name?: string; description?: string; archived?: boolean }[]>(
      `/rest/api/2/project/${encodeURIComponent(projectKey)}/components`,
    );
    return rows.flatMap((row) =>
      row.id && row.name
        ? [
            {
              id: row.id,
              name: row.name,
              projectKey,
              description: row.description ?? null,
              archived: row.archived ?? false,
            },
          ]
        : [],
    );
  }

  async searchUsers(
    query: string,
    args: { projectKey?: string; issueKey?: string; limit?: number } = {},
  ): Promise<JiraUser[]> {
    const params = new URLSearchParams({
      username: query,
      maxResults: String(args.limit ?? 20),
    });
    if (args.projectKey) params.set("project", args.projectKey);
    if (args.issueKey) params.set("issueKey", args.issueKey);
    const rows = await this.request<RawJiraUser[]>(
      `/rest/api/2/user/assignable/search?${params.toString()}`,
    );
    return rows.map(normalizeJiraUser);
  }

  async findUsers(
    query: string,
    args: { limit?: number } = {},
  ): Promise<JiraUser[]> {
    const params = new URLSearchParams({
      username: query,
      maxResults: String(args.limit ?? 20),
    });
    const rows = await this.request<RawJiraUser[]>(
      `/rest/api/2/user/search?${params.toString()}`,
    );
    return rows.map(normalizeJiraUser);
  }

  async searchIssues(
    jql: string,
    args: { maxResults?: number; startAt?: number } = {},
  ): Promise<{ issues: JiraIssue[]; total: number }> {
    const body = {
      jql,
      maxResults: args.maxResults ?? 50,
      startAt: args.startAt ?? 0,
      fields: [
        "summary",
        "description",
        "status",
        "issuetype",
        "priority",
        "assignee",
        "duedate",
        "components",
        "updated",
      ],
    };
    const result = await this.request<{ issues?: RawJiraIssue[]; total?: number }>(
      "/rest/api/2/search",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    const issues = (result.issues ?? []).map((issue) =>
      normalizeJiraIssue(this.baseUrl, issue),
    );
    return {
      issues,
      total: result.total ?? issues.length,
    };
  }

  async getIssue(issueIdOrKey: string): Promise<JiraIssue> {
    const raw = await this.request<RawJiraIssue>(
      `/rest/api/2/issue/${encodeURIComponent(issueIdOrKey)}?expand=renderedFields`,
    );
    return normalizeJiraIssue(
      this.baseUrl,
      raw,
      await this.getEditFields(issueIdOrKey),
    );
  }

  async getCreateMetadata(projectKey: string): Promise<JiraCreateMetadata> {
    const params = new URLSearchParams({
      projectKeys: projectKey,
      expand: "projects.issuetypes.fields",
    });
    const raw = await this.request<{
      projects?: {
        key?: string;
        issuetypes?: {
          id?: string;
          name?: string;
          fields?: Record<string, { name?: string; required?: boolean; schema?: { type?: string }; allowedValues?: unknown[] }>;
        }[];
      }[];
    }>(`/rest/api/2/issue/createmeta?${params.toString()}`);
    const project = raw.projects?.[0];
    return {
      projectKey: project?.key ?? projectKey,
      issueTypes: (project?.issuetypes ?? []).flatMap((type) =>
        type.id && type.name
          ? [
              {
                id: type.id,
                name: type.name,
                fields: Object.entries(type.fields ?? {}).map(([id, field]) => ({
                  id,
                  name: field.name ?? id,
                  required: field.required ?? false,
                  schemaType: field.schema?.type ?? null,
                  allowedValues: field.allowedValues ?? [],
                })),
              },
            ]
          : [],
      ),
    };
  }

  async getEditFields(issueIdOrKey: string): Promise<JiraIssue["editableFields"]> {
    const raw = await this.request<{ fields?: Record<string, unknown> }>(
      `/rest/api/2/issue/${encodeURIComponent(issueIdOrKey)}/editmeta`,
    );
    const fields = raw.fields ?? {};
    return (["summary", "description", "duedate", "assignee"] as const).filter(
      (field) => field in fields,
    );
  }

  async createIssue(input: CreateJiraIssueRequest): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { id: input.issueTypeId },
      summary: input.summary,
      description: input.description ?? undefined,
      duedate: input.dueDate ?? undefined,
      components: input.componentIds.map((id) => ({ id })),
      ...input.fields,
    };
    if (input.assignee) {
      fields.assignee = jiraUserIdentity(input.assignee);
    }
    const created = await this.request<{ id: string; key: string }>(
      "/rest/api/2/issue",
      { method: "POST", body: JSON.stringify({ fields }) },
    );
    return this.getIssue(created.key);
  }

  async updateIssue(
    issueIdOrKey: string,
    fields: Partial<Pick<JiraIssue, "summary" | "description" | "dueDate" | "assignee">>,
  ): Promise<JiraIssue> {
    const jiraFields: Record<string, unknown> = {};
    if ("summary" in fields) jiraFields.summary = fields.summary;
    if ("description" in fields) jiraFields.description = fields.description;
    if ("dueDate" in fields) jiraFields.duedate = fields.dueDate;
    if ("assignee" in fields) jiraFields.assignee = fields.assignee ? jiraUserIdentity(fields.assignee) : null;
    await this.request(`/rest/api/2/issue/${encodeURIComponent(issueIdOrKey)}`, {
      method: "PUT",
      body: JSON.stringify({ fields: jiraFields }),
    });
    return this.getIssue(issueIdOrKey);
  }

  async assignIssue(issueIdOrKey: string, assignee: JiraUser | null): Promise<JiraIssue> {
    await this.request(`/rest/api/2/issue/${encodeURIComponent(issueIdOrKey)}/assignee`, {
      method: "PUT",
      body: JSON.stringify(assignee ? jiraUserIdentity(assignee) : { name: null }),
    });
    return this.getIssue(issueIdOrKey);
  }

  async listComments(issueIdOrKey: string): Promise<JiraComment[]> {
    const issue = await this.getIssue(issueIdOrKey);
    const raw = await this.request<{
      comments?: {
        id?: string;
        author?: RawJiraUser;
        body?: string;
        renderedBody?: string;
        created?: string;
        updated?: string;
      }[];
    }>(
      `/rest/api/2/issue/${encodeURIComponent(issueIdOrKey)}/comment?expand=renderedBody`,
    );
    return (raw.comments ?? []).flatMap((comment) =>
      comment.id && comment.author && comment.created && comment.updated
        ? [
            {
              id: comment.id,
              issueId: issue.id,
              issueKey: issue.key,
              author: normalizeJiraUser(comment.author),
              body: comment.body ?? "",
              renderedBody: stringField(comment.renderedBody),
              createdAt: dateFromJira(comment.created),
              updatedAt: dateFromJira(comment.updated),
            },
          ]
        : [],
    );
  }

  async addComment(issueIdOrKey: string, body: string): Promise<JiraComment> {
    const issue = await this.getIssue(issueIdOrKey);
    const comment = await this.request<{
      id: string;
      author: RawJiraUser;
      body: string;
      renderedBody?: string;
      created: string;
      updated: string;
    }>(
      `/rest/api/2/issue/${encodeURIComponent(issueIdOrKey)}/comment?expand=renderedBody`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );
    return {
      id: comment.id,
      issueId: issue.id,
      issueKey: issue.key,
      author: normalizeJiraUser(comment.author),
      body: comment.body ?? body,
      renderedBody: stringField(comment.renderedBody),
      createdAt: dateFromJira(comment.created),
      updatedAt: dateFromJira(comment.updated),
    };
  }

  browseUrl(issueKey: string): string {
    return buildJiraBrowseUrl(this.baseUrl, issueKey);
  }
}

function jiraUserIdentity(user: JiraUser): Record<string, string | null> {
  if (user.accountId) return { accountId: user.accountId };
  if (user.name) return { name: user.name };
  if (user.key) return { key: user.key };
  return { name: null };
}

export function createJiraDataCenterAdapter(args: {
  baseUrl: string;
  token: string;
}): JiraAdapter {
  return new JiraDataCenterClient(args.baseUrl, args.token);
}
