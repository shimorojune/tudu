import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { Db, JiraConnectionRow } from "@tudu/db";
import {
  createJiraJqlPreset,
  deleteJiraJqlPreset,
  disconnectJiraConnection,
  findCachedJiraIssue,
  findJiraJqlPreset,
  getJiraConnection,
  getJiraConnectionStatus,
  listJiraComments,
  listJiraComponents,
  listJiraIssues,
  listJiraJqlPresets,
  listJiraProjectKeys,
  readJiraRefreshCursor,
  replaceJiraComponents,
  resetAssignedJiraIssues,
  replaceJiraProjectKeys,
  updateJiraRefreshCursor,
  user,
  updateJiraJqlPreset,
  upsertJiraComments,
  upsertJiraConnection,
  upsertJiraIssue,
  upsertJiraUsers,
} from "@tudu/db";
import {
  createJiraCommentRequestSchema,
  jiraJqlPresetCreateRequestSchema,
  jiraJqlPresetParamsSchema,
  jiraJqlPresetUpdateRequestSchema,
  jiraConnectRequestSchema,
  jiraCreateMetadataQuerySchema,
  jiraIssueDetailQuerySchema,
  jiraIssueSearchQuerySchema,
  jiraOpenQuerySchema,
  jiraProjectKeysRequestSchema,
  jiraUserSearchQuerySchema,
  normalizeJiraBaseUrl,
  parseJiraIssueKeyOrUrl,
  type JiraComponentsResponse,
  type JiraConnectionResponse,
  type JiraCreateMetadataResponse,
  type JiraIssueResponse,
  type JiraIssue,
  type JiraIssueUrlResponse,
  type JiraIssuesResponse,
  type JiraJqlPresetResponse,
  type JiraJqlPresetsResponse,
  type JiraProjectsResponse,
  type JiraUser,
  type JiraUsersResponse,
} from "@tudu/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import {
  buildAssignedCachedIssuesJql,
  buildAssignedIssuesJql,
  buildChangedCachedIssuesJql,
  buildReportAssignedIssuesJql,
  createJiraDataCenterAdapter,
  issueAssignedToJiraUser,
  JiraHttpError,
  matchReportJiraUser,
  type JiraAdapter,
  type JiraAdapterFactory,
} from "../jira/client.js";
import {
  ensureAllowedJiraBaseUrl,
  ensureConfiguredJiraProjectKey,
  JiraAccessError,
} from "../jira/access.js";
import { prependKeyIssueToSearchResults } from "../jira/search.js";
import { decryptJiraToken, encryptJiraToken } from "../jira/crypto.js";
import type { SessionEnv } from "../session-middleware.js";

export { ensureConfiguredJiraProjectKey };

type JiraRouteOptions = {
  adapterFactory?: JiraAdapterFactory;
};

export function shouldAdvanceJiraRefreshCursor(filters: {
  query?: string;
  componentIds?: string[];
  presetJql?: string | null;
  jql?: string | null;
}): boolean {
  return !filters.query?.trim() &&
    !(filters.componentIds?.length) &&
    !filters.presetJql?.trim() &&
    !filters.jql?.trim();
}

export function jiraRouteError(error: unknown): { status: ContentfulStatusCode; message: string } | null {
  if (error instanceof JiraHttpError) {
    return {
      status: error.status >= 400 && error.status < 500
        ? (error.status as ContentfulStatusCode)
        : 502,
      message: error.message,
    };
  }
  if (error instanceof Error && error.message.startsWith("Jira URL must")) {
    return { status: 400, message: error.message };
  }
  if (error instanceof Error && error.message.startsWith("JIRA_TOKEN_ENCRYPTION_KEY")) {
    return { status: 400, message: error.message };
  }
  if (error instanceof JiraAccessError) {
    return { status: error.status, message: error.message };
  }
  return null;
}

export async function cachedJiraIssueAfterUpsert(
  db: Db,
  userId: string,
  issue: JiraIssue,
): Promise<JiraIssue> {
  await upsertJiraIssue(db, userId, issue);
  return (await findCachedJiraIssue(db, userId, issue.id)) ?? issue;
}

function jsonBody<T extends z.ZodType>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid request body";
      return c.json({ error: message }, 400);
    }
  });
}

function queryParams<T extends z.ZodType>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid query";
      return c.json({ error: message }, 400);
    }
  });
}

function userId(c: Context<SessionEnv>) {
  return c.get("session")!.user.id;
}

function encrypted(row: JiraConnectionRow) {
  return {
    encryptedToken: row.encryptedToken,
    tokenIv: row.tokenIv,
    tokenAuthTag: row.tokenAuthTag,
  };
}

export async function adapterFor(
  db: Db,
  actorId: string,
  adapterFactory: JiraAdapterFactory,
): Promise<JiraAdapter | null> {
  const connection = await getJiraConnection(db, actorId);
  if (!connection) {
    return null;
  }
  ensureAllowedJiraBaseUrl(connection.baseUrl);
  return adapterFactory({
    baseUrl: connection.baseUrl,
    token: decryptJiraToken(encrypted(connection)),
  });
}

export async function refreshAssignedJiraIssues(
  db: Db,
  userId: string,
  adapter: JiraAdapter,
  filters: {
    query?: string;
    componentIds?: string[];
    startAt?: number;
    limit?: number;
    presetJql?: string | null;
    jql?: string | null;
  } = {},
): Promise<JiraIssuesResponse> {
  const startAt = filters.startAt ?? 0;
  const limit = filters.limit ?? 50;
  const projectKeys = await listJiraProjectKeys(db, userId);
  const updateCursor = shouldAdvanceJiraRefreshCursor(filters);
  const cursor = updateCursor ? await readJiraRefreshCursor(db, userId, "jira") : null;
  const searchResult = await adapter.searchIssues(
    buildAssignedIssuesJql(projectKeys, cursor, {
      query: filters.query,
      componentIds: filters.componentIds,
      presetJql: filters.presetJql,
      jql: filters.jql,
    }),
    { maxResults: limit, startAt: updateCursor ? 0 : startAt },
  );
  const issues = searchResult.issues;
  const now = new Date();
  for (const issue of issues) {
    await upsertJiraIssue(db, userId, issue, {
      assignedListAt: updateCursor ? now : undefined,
    });
  }
  if (updateCursor) {
    let changedCachedIssues: JiraIssue[] = [];
    const cachedIssues = await listJiraIssues(db, userId);
    const cachedKeys = cachedIssues.map((issue) => issue.key);
    const changedCachedJql = buildChangedCachedIssuesJql(cachedKeys, cursor);
    if (changedCachedJql) {
      const changedResult = await adapter.searchIssues(changedCachedJql, {
        maxResults: Math.max(cachedKeys.length, 1),
      });
      changedCachedIssues = changedResult.issues;
      const changedKeys = changedCachedIssues.map((issue) => issue.key);
      const assignedChangedJql = buildAssignedCachedIssuesJql(changedKeys, projectKeys);
      const assignedChangedIssues = assignedChangedJql
        ? (
            await adapter.searchIssues(assignedChangedJql, {
              maxResults: Math.max(changedKeys.length, 1),
            })
          ).issues
        : [];
      await resetAssignedJiraIssues(db, userId, changedKeys);
      for (const issue of assignedChangedIssues) {
        await upsertJiraIssue(db, userId, issue, { assignedListAt: now });
      }
    }
    const newest = [...issues, ...changedCachedIssues].reduce<Date | null>((latest: Date | null, issue: JiraIssue) => {
      const updated = new Date(issue.updatedAt);
      return !latest || updated > latest ? updated : latest;
    }, cursor);
    await updateJiraRefreshCursor(db, userId, "jira", newest);
    const allIssues = await listJiraIssues(db, userId);
    const page = allIssues.slice(startAt, startAt + limit);
    return {
      issues: page,
      total: allIssues.length,
      startAt,
      hasMore: startAt + page.length < allIssues.length,
    };
  }
  const filteredIssues = await Promise.all(
    issues.map(async (issue) => (await findCachedJiraIssue(db, userId, issue.id)) ?? issue),
  );
  return {
    issues: filteredIssues,
    total: searchResult.total,
    startAt,
    hasMore: startAt + filteredIssues.length < searchResult.total,
  };
}

async function findReportJiraUser(
  adapter: JiraAdapter,
  email: string,
): Promise<JiraUser | undefined> {
  const queries = [email];
  const localPart = email.includes("@") ? email.slice(0, email.indexOf("@")) : "";
  if (localPart && localPart !== email) {
    queries.push(localPart);
  }
  const found: JiraUser[] = [];
  for (const query of queries) {
    const users = await adapter.findUsers(query, { limit: 20 });
    found.push(...users);
  }
  return matchReportJiraUser(found, email);
}

function matchesReportIssueFilters(
  issue: JiraIssue,
  filters: {
    query?: string;
    componentIds?: string[];
    presetJql?: string | null;
    jql?: string | null;
  },
): boolean {
  const query = filters.query?.trim().toLowerCase();
  if (query) {
    const haystack = `${issue.key} ${issue.summary} ${issue.description ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }
  const componentIds = filters.componentIds ?? [];
  if (componentIds.length > 0) {
    const issueComponentIds = new Set(issue.components.map((component) => component.id));
    if (!componentIds.some((id) => issueComponentIds.has(id))) {
      return false;
    }
  }
  return issue.status.category !== "done";
}

async function selectedJqlPreset(
  db: Db,
  userId: string,
  presetId: string | null | undefined,
): Promise<string | null> {
  if (!presetId) {
    return null;
  }
  const preset = await findJiraJqlPreset(db, userId, presetId);
  if (!preset) {
    throw new JiraAccessError("Jira JQL preset not found", 400);
  }
  return preset.jql;
}


export function createJiraRoute(db: Db, options: JiraRouteOptions = {}) {
  const app = new Hono<SessionEnv>();
  const adapterFactory = options.adapterFactory ?? createJiraDataCenterAdapter;

  app.onError((error, c) => {
    const mapped = jiraRouteError(error);
    if (mapped) {
      return c.json({ error: mapped.message }, mapped.status);
    }
    throw error;
  });

  app.use("*", async (c, next) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  app.get("/jira/status", async (c) => {
    const response: JiraConnectionResponse = {
      connection: await getJiraConnectionStatus(db, userId(c)),
    };
    return c.json(response);
  });

  app.post("/jira/connect", jsonBody(jiraConnectRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const baseUrl = normalizeJiraBaseUrl(body.baseUrl);
    ensureAllowedJiraBaseUrl(baseUrl);
    const encryptedToken = encryptJiraToken(body.token);
    const adapter = adapterFactory({ baseUrl, token: body.token });
    const me = await adapter.myself();
    await upsertJiraConnection(db, {
      userId: userId(c),
      baseUrl,
      token: encryptedToken,
      displayName: me.displayName,
      email: me.emailAddress,
      projectKeys: body.projectKeys,
    });
    const response: JiraConnectionResponse = {
      connection: await getJiraConnectionStatus(db, userId(c)),
    };
    return c.json(response, 201);
  });

  app.post("/jira/disconnect", async (c) => {
    await disconnectJiraConnection(db, userId(c));
    const response: JiraConnectionResponse = {
      connection: await getJiraConnectionStatus(db, userId(c)),
    };
    return c.json(response);
  });

  app.get("/jira/projects", async (c) => {
    const adapter = await adapterFor(db, userId(c), adapterFactory);
    if (!adapter) {
      return c.json({ projects: [] } satisfies JiraProjectsResponse);
    }
    const projects = await adapter.listProjects();
    return c.json({ projects } satisfies JiraProjectsResponse);
  });

  app.put("/jira/projects", jsonBody(jiraProjectKeysRequestSchema), async (c) => {
    await replaceJiraProjectKeys(db, userId(c), c.req.valid("json").projectKeys);
    const response: JiraConnectionResponse = {
      connection: await getJiraConnectionStatus(db, userId(c)),
    };
    return c.json(response);
  });

  app.get("/jira/jql-presets", async (c) => {
    return c.json({
      presets: await listJiraJqlPresets(db, userId(c)),
    } satisfies JiraJqlPresetsResponse);
  });

  app.post("/jira/jql-presets", jsonBody(jiraJqlPresetCreateRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const response: JiraJqlPresetResponse = {
      preset: await createJiraJqlPreset(db, {
        userId: userId(c),
        name: body.name,
        jql: body.jql,
        isDefault: body.isDefault,
      }),
    };
    return c.json(response, 201);
  });

  app.put(
    "/jira/jql-presets/:id",
    zValidator("param", jiraJqlPresetParamsSchema),
    jsonBody(jiraJqlPresetUpdateRequestSchema),
    async (c) => {
      const params = c.req.valid("param");
      const preset = await updateJiraJqlPreset(
        db,
        userId(c),
        params.id,
        c.req.valid("json"),
      );
      if (!preset) {
        return c.json({ error: "Jira JQL preset not found" }, 404);
      }
      return c.json({ preset } satisfies JiraJqlPresetResponse);
    },
  );

  app.delete(
    "/jira/jql-presets/:id",
    zValidator("param", jiraJqlPresetParamsSchema),
    async (c) => {
      const deleted = await deleteJiraJqlPreset(db, userId(c), c.req.valid("param").id);
      if (!deleted) {
        return c.json({ error: "Jira JQL preset not found" }, 404);
      }
      return c.json({ ok: true });
    },
  );

  app.post("/jira/components/refresh", async (c) => {
    const actorId = userId(c);
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ error: "Jira is not connected" }, 400);
    }
    const keys = await listJiraProjectKeys(db, actorId);
    const components = (
      await Promise.all(keys.map((key) => adapter.listComponents(key)))
    ).flat();
    await replaceJiraComponents(db, actorId, keys, components);
    return c.json({ components: await listJiraComponents(db, actorId) } satisfies JiraComponentsResponse);
  });

  app.get("/jira/components", async (c) => {
    return c.json({
      components: await listJiraComponents(db, userId(c)),
    } satisfies JiraComponentsResponse);
  });

  app.get("/jira/users", queryParams(jiraUserSearchQuerySchema), async (c) => {
    const actorId = userId(c);
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ users: [] } satisfies JiraUsersResponse);
    }
    const query = c.req.valid("query");
    const users = await adapter.searchUsers(query.q, {
      projectKey: query.projectKey,
      issueKey: query.issueKey,
      limit: query.limit,
    });
    await upsertJiraUsers(db, actorId, users);
    return c.json({ users } satisfies JiraUsersResponse);
  });

  app.get("/jira/issues", queryParams(jiraIssueSearchQuerySchema), async (c) => {
    const actorId = userId(c);
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ issues: [] } satisfies JiraIssuesResponse);
    }
    const query = c.req.valid("query");
    const textResponse = await refreshAssignedJiraIssues(db, actorId, adapter, {
      query: query.q,
      componentIds: query.componentIds,
      startAt: query.startAt,
      limit: query.limit,
      presetJql: await selectedJqlPreset(db, actorId, query.jqlPresetId),
      jql: query.jql,
    });
    if (!query.q || query.startAt > 0) {
      return c.json(textResponse);
    }
    const key = parseJiraIssueKeyOrUrl(query.q);
    if (!key) {
      return c.json(textResponse);
    }
    try {
      const directIssue = await adapter.getIssue(key);
      const cachedIssue = await cachedJiraIssueAfterUpsert(db, actorId, directIssue);
      return c.json(prependKeyIssueToSearchResults(cachedIssue, textResponse));
    } catch {
      return c.json(textResponse);
    }
  });

  app.post("/jira/issues/refresh", async (c) => {
    const actorId = userId(c);
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ error: "Jira is not connected" }, 400);
    }
    return c.json(await refreshAssignedJiraIssues(db, actorId, adapter));
  });

  app.get("/jira/issue", queryParams(jiraIssueDetailQuerySchema), async (c) => {
    const actorId = userId(c);
    const query = c.req.valid("query");
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ error: "Jira is not connected" }, 400);
    }
    const issue = await adapter.getIssue(query.issueIdOrKey);
    return c.json({
      issue: await cachedJiraIssueAfterUpsert(db, actorId, issue),
    } satisfies JiraIssueResponse);
  });

  app.get(
    "/jira/create-metadata",
    queryParams(jiraCreateMetadataQuerySchema),
    async (c) => {
      const actorId = userId(c);
      const query = c.req.valid("query");
      await ensureConfiguredJiraProjectKey(db, actorId, query.projectKey);
      const adapter = await adapterFor(db, actorId, adapterFactory);
      if (!adapter) {
        return c.json({ error: "Jira is not connected" }, 400);
      }
      const metadata = await adapter.getCreateMetadata(query.projectKey);
      return c.json({ metadata } satisfies JiraCreateMetadataResponse);
    },
  );

  app.get("/jira/comments", queryParams(jiraIssueDetailQuerySchema), async (c) => {
    const actorId = userId(c);
    const query = c.req.valid("query");
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ comments: [] });
    }
    const issueIdOrKey = query.issueIdOrKey;
    const comments = await adapter.listComments(issueIdOrKey);
    await upsertJiraComments(db, actorId, comments);
    const issue = await findCachedJiraIssue(db, actorId, issueIdOrKey);
    return c.json({
      comments: issue ? await listJiraComments(db, actorId, issue.id) : comments,
    });
  });

  app.post("/jira/comments", jsonBody(createJiraCommentRequestSchema), async (c) => {
    const actorId = userId(c);
    const body = c.req.valid("json");
    const adapter = await adapterFor(db, actorId, adapterFactory);
    if (!adapter) {
      return c.json({ error: "Jira is not connected" }, 400);
    }
    const comment = await adapter.addComment(body.issueIdOrKey, body.body);
    await upsertJiraComments(db, actorId, [comment]);
    return c.json({ comment }, 201);
  });

  app.get("/jira/open", queryParams(jiraOpenQuerySchema), async (c) => {
    const actorId = userId(c);
    const connection = await getJiraConnection(db, actorId);
    if (!connection) {
      return c.json({ error: "Jira is not connected" }, 400);
    }
    return c.json({
      url: adapterFactory({
        baseUrl: connection.baseUrl,
        token: decryptJiraToken(encrypted(connection)),
      }).browseUrl(c.req.valid("query").issueKey),
    } satisfies JiraIssueUrlResponse);
  });

  return app;
}
