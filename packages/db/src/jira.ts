import { and, asc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import type {
  JiraComment,
  JiraComponent,
  JiraConnectionStatus,
  JiraIssue,
  JiraJqlPreset,
  JiraLinkedTask,
  JiraTaskLinkSummary,
  JiraUser,
} from "@tudu/shared";
import type { Db } from "./index.js";
import { user } from "./auth-schema.js";
type ManagerPermissionRow = {
  canSeeDay: boolean;
  canSeePrivate: boolean;
};
import { tasks } from "./tasks-schema.js";
import {
  jiraComponents,
  jiraConnections,
  jiraIssueComments,
  jiraIssues,
  jiraJqlPresets,
  jiraProjects,
  jiraRefreshCursors,
  jiraTaskLinks,
  jiraUsers,
  type JiraConnectionRow,
  type JiraIssueCommentRow,
  type JiraIssueRow,
  type JiraJqlPresetRow,
  type JiraTaskLinkRow,
} from "./jira-schema.js";

export {
  jiraComponents,
  jiraConnections,
  jiraIssueComments,
  jiraIssues,
  jiraJqlPresets,
  jiraProjects,
  jiraRefreshCursors,
  jiraTaskLinks,
  jiraUsers,
} from "./jira-schema.js";
export type * from "./jira-schema.js";

export type EncryptedJiraToken = {
  encryptedToken: string;
  tokenIv: string;
  tokenAuthTag: string;
};

export function mapJiraConnectionStatus(
  row: JiraConnectionRow | null | undefined,
  projectKeys: string[] = [],
): JiraConnectionStatus {
  if (!row || row.deletedAt) {
    return {
      connected: false,
      baseUrl: null,
      displayName: null,
      email: null,
      projectKeys: [],
      updatedAt: null,
    };
  }

  return {
    connected: true,
    baseUrl: row.baseUrl,
    displayName: row.displayName,
    email: row.email,
    projectKeys,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapJiraTaskLinkSummary(row: JiraIssueRow): JiraTaskLinkSummary {
  return {
    issueId: row.issueId,
    key: row.key,
    summary: row.summary,
    statusName: row.statusName,
    dueDate: row.dueDate,
    browseUrl: row.browseUrl,
  };
}

export function publicJiraLinkedTasksOnly(tasks: JiraLinkedTask[]): JiraLinkedTask[] {
  return tasks.filter((task) => !task.isPrivate);
}

export function jiraProjectKeyFromIssueKey(issueKey: string): string {
  return issueKey.split("-")[0]?.toUpperCase() ?? "";
}

export function shouldShowJiraIssueForProjectKeys(
  issueKey: string,
  projectKeys: string[],
): boolean {
  if (projectKeys.length === 0) {
    return true;
  }
  const allowed = new Set(projectKeys.map((key) => key.toUpperCase()));
  return allowed.has(jiraProjectKeyFromIssueKey(issueKey));
}

export function stableJiraUserIdentity(
  jiraUser: JiraUser,
): { column: "accountId" | "userKey" | "name"; value: string } | null {
  const accountId = jiraUser.accountId?.trim();
  if (accountId) {
    return { column: "accountId", value: accountId };
  }
  const userKey = jiraUser.key?.trim();
  if (userKey) {
    return { column: "userKey", value: userKey };
  }
  const name = jiraUser.name?.trim();
  if (name) {
    return { column: "name", value: name };
  }
  return null;
}

export function mapJiraIssue(
  row: JiraIssueRow,
  options: {
    linkedTasks?: JiraLinkedTask[];
    editableFields?: JiraIssue["editableFields"];
  } = {},
): JiraIssue {
  return {
    id: row.issueId,
    key: row.key,
    summary: row.summary,
    description: row.description,
    renderedDescription: null,
    status: {
      id: row.statusId,
      name: row.statusName,
      category: row.statusCategory as JiraIssue["status"]["category"],
      colorName: row.statusColorName,
    },
    issueType: row.issueType,
    priority: row.priority,
    assignee: row.assigneeName
      ? {
          accountId: row.assigneeAccountId,
          key: null,
          name: row.assigneeName,
          displayName: row.assigneeName,
          emailAddress: row.assigneeEmail,
          active: true,
          avatarUrl: null,
        }
      : null,
    dueDate: row.dueDate,
    components: row.components,
    updatedAt: row.remoteUpdatedAt.toISOString(),
    browseUrl: row.browseUrl,
    linkedTasks: options.linkedTasks ?? [],
    editableFields: options.editableFields ?? [],
  };
}

export function mapJiraComment(row: JiraIssueCommentRow): JiraComment {
  return {
    id: row.commentId,
    issueId: row.issueId,
    issueKey: row.issueKey,
    author: row.author,
    body: row.body,
    renderedBody: null,
    createdAt: row.remoteCreatedAt.toISOString(),
    updatedAt: row.remoteUpdatedAt.toISOString(),
  };
}

export function mapJiraJqlPreset(row: JiraJqlPresetRow): JiraJqlPreset {
  return {
    id: row.id,
    name: row.name,
    jql: row.jql,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getJiraConnection(
  db: Db,
  userId: string,
): Promise<JiraConnectionRow | undefined> {
  return db.query.jiraConnections.findFirst({
    where: and(eq(jiraConnections.userId, userId), isNull(jiraConnections.deletedAt)),
  });
}

export async function getJiraConnectionStatus(
  db: Db,
  userId: string,
): Promise<JiraConnectionStatus> {
  const [connection, projects] = await Promise.all([
    getJiraConnection(db, userId),
    listJiraProjectKeys(db, userId),
  ]);
  return mapJiraConnectionStatus(connection, projects);
}

export async function upsertJiraConnection(
  db: Db,
  input: {
    userId: string;
    baseUrl: string;
    token: EncryptedJiraToken;
    displayName: string | null;
    email: string | null;
    projectKeys: string[];
  },
): Promise<JiraConnectionRow> {
  await clearJiraCache(db, input.userId);

  const [row] = await db
    .insert(jiraConnections)
    .values({
      userId: input.userId,
      baseUrl: input.baseUrl,
      encryptedToken: input.token.encryptedToken,
      tokenIv: input.token.tokenIv,
      tokenAuthTag: input.token.tokenAuthTag,
      displayName: input.displayName,
      email: input.email,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: jiraConnections.userId,
      set: {
        baseUrl: input.baseUrl,
        encryptedToken: input.token.encryptedToken,
        tokenIv: input.token.tokenIv,
        tokenAuthTag: input.token.tokenAuthTag,
        displayName: input.displayName,
        email: input.email,
        deletedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await replaceJiraProjectKeys(db, input.userId, input.projectKeys);
  return row!;
}

export async function disconnectJiraConnection(db: Db, userId: string): Promise<void> {
  const now = new Date();
  await db.batch([
    db
      .update(jiraConnections)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(jiraConnections.userId, userId)),
    db
      .update(jiraProjects)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(jiraProjects.userId, userId), isNull(jiraProjects.deletedAt))),
    db
      .update(jiraComponents)
      .set({ deletedAt: now, cachedAt: now })
      .where(and(eq(jiraComponents.userId, userId), isNull(jiraComponents.deletedAt))),
    db
      .update(jiraIssues)
      .set({ deletedAt: now, cachedAt: now, assignedListAt: null })
      .where(and(eq(jiraIssues.userId, userId), isNull(jiraIssues.deletedAt))),
    db
      .update(jiraIssueComments)
      .set({ deletedAt: now, cachedAt: now })
      .where(and(eq(jiraIssueComments.userId, userId), isNull(jiraIssueComments.deletedAt))),
    db
      .update(jiraUsers)
      .set({ deletedAt: now, cachedAt: now })
      .where(and(eq(jiraUsers.userId, userId), isNull(jiraUsers.deletedAt))),
    db
      .update(jiraTaskLinks)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(jiraTaskLinks.userId, userId), isNull(jiraTaskLinks.deletedAt))),
    db.delete(jiraRefreshCursors).where(eq(jiraRefreshCursors.userId, userId)),
  ]);
}

export async function clearJiraCache(db: Db, userId: string): Promise<void> {
  const now = new Date();
  await db.batch([
    db
      .update(jiraComponents)
      .set({ deletedAt: now, cachedAt: now })
      .where(and(eq(jiraComponents.userId, userId), isNull(jiraComponents.deletedAt))),
    db
      .update(jiraIssues)
      .set({ deletedAt: now, cachedAt: now, assignedListAt: null })
      .where(and(eq(jiraIssues.userId, userId), isNull(jiraIssues.deletedAt))),
    db
      .update(jiraIssueComments)
      .set({ deletedAt: now, cachedAt: now })
      .where(and(eq(jiraIssueComments.userId, userId), isNull(jiraIssueComments.deletedAt))),
    db
      .update(jiraUsers)
      .set({ deletedAt: now, cachedAt: now })
      .where(and(eq(jiraUsers.userId, userId), isNull(jiraUsers.deletedAt))),
    db.delete(jiraRefreshCursors).where(eq(jiraRefreshCursors.userId, userId)),
  ]);
}

export async function resetJiraScopeCache(db: Db, userId: string): Promise<void> {
  await db.batch([
    db
      .update(jiraIssues)
      .set({ assignedListAt: null, cachedAt: new Date() })
      .where(and(eq(jiraIssues.userId, userId), isNull(jiraIssues.deletedAt))),
    db.delete(jiraRefreshCursors).where(eq(jiraRefreshCursors.userId, userId)),
  ]);
}

export async function listJiraProjectKeys(
  db: Db,
  userId: string,
): Promise<string[]> {
  const rows = await db.query.jiraProjects.findMany({
    where: and(eq(jiraProjects.userId, userId), isNull(jiraProjects.deletedAt)),
    orderBy: [asc(jiraProjects.key)],
  });
  return rows.map((row) => row.key);
}

export async function listJiraJqlPresets(
  db: Db,
  userId: string,
): Promise<JiraJqlPreset[]> {
  const rows = await db.query.jiraJqlPresets.findMany({
    where: and(eq(jiraJqlPresets.userId, userId), isNull(jiraJqlPresets.deletedAt)),
    orderBy: [asc(jiraJqlPresets.name)],
  });
  return rows.map(mapJiraJqlPreset);
}

export async function findJiraJqlPreset(
  db: Db,
  userId: string,
  id: string,
): Promise<JiraJqlPreset | undefined> {
  const row = await db.query.jiraJqlPresets.findFirst({
    where: and(
      eq(jiraJqlPresets.userId, userId),
      eq(jiraJqlPresets.id, id),
      isNull(jiraJqlPresets.deletedAt),
    ),
  });
  return row ? mapJiraJqlPreset(row) : undefined;
}

export async function createJiraJqlPreset(
  db: Db,
  input: {
    userId: string;
    name: string;
    jql: string;
    isDefault: boolean;
  },
): Promise<JiraJqlPreset> {
  if (input.isDefault) {
    await clearDefaultJiraJqlPreset(db, input.userId);
  }
  const [row] = await db
    .insert(jiraJqlPresets)
    .values({
      userId: input.userId,
      name: input.name,
      jql: input.jql,
      isDefault: input.isDefault,
    })
    .returning();
  return mapJiraJqlPreset(row!);
}

export async function updateJiraJqlPreset(
  db: Db,
  userId: string,
  id: string,
  patch: {
    name?: string;
    jql?: string;
    isDefault?: boolean;
  },
): Promise<JiraJqlPreset | undefined> {
  if (patch.isDefault) {
    await clearDefaultJiraJqlPreset(db, userId);
  }
  const [row] = await db
    .update(jiraJqlPresets)
    .set({
      ...("name" in patch ? { name: patch.name } : {}),
      ...("jql" in patch ? { jql: patch.jql } : {}),
      ...("isDefault" in patch ? { isDefault: patch.isDefault } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jiraJqlPresets.userId, userId),
        eq(jiraJqlPresets.id, id),
        isNull(jiraJqlPresets.deletedAt),
      ),
    )
    .returning();
  return row ? mapJiraJqlPreset(row) : undefined;
}

export async function deleteJiraJqlPreset(
  db: Db,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(jiraJqlPresets)
    .set({ deletedAt: new Date(), updatedAt: new Date(), isDefault: false })
    .where(
      and(
        eq(jiraJqlPresets.userId, userId),
        eq(jiraJqlPresets.id, id),
        isNull(jiraJqlPresets.deletedAt),
      ),
    )
    .returning({ id: jiraJqlPresets.id });
  return rows.length > 0;
}

async function clearDefaultJiraJqlPreset(db: Db, userId: string): Promise<void> {
  await db
    .update(jiraJqlPresets)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(jiraJqlPresets.userId, userId),
        eq(jiraJqlPresets.isDefault, true),
        isNull(jiraJqlPresets.deletedAt),
      ),
    );
}

export async function replaceJiraProjectKeys(
  db: Db,
  userId: string,
  projectKeys: string[],
): Promise<void> {
  const unique = [...new Set(projectKeys.map((key) => key.trim().toUpperCase()).filter(Boolean))];
  const now = new Date();
  const existing = await db.query.jiraProjects.findMany({
    where: and(eq(jiraProjects.userId, userId), isNull(jiraProjects.deletedAt)),
  });
  const existingKeys = new Set(existing.map((row) => row.key));
  const nextKeys = new Set(unique);
  const writes = [];

  const removedProjectKeys = existing
    .filter((row) => !nextKeys.has(row.key))
    .map((row) => row.key);
  const toDelete = existing
    .filter((row) => removedProjectKeys.includes(row.key))
    .map((row) => row.id);
  if (toDelete.length > 0) {
    writes.push(
      db
        .update(jiraProjects)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(jiraProjects.id, toDelete)),
    );
  }
  if (removedProjectKeys.length > 0) {
    writes.push(
      db
        .update(jiraComponents)
        .set({ deletedAt: now, cachedAt: now })
        .where(
          and(
            eq(jiraComponents.userId, userId),
            inArray(jiraComponents.projectKey, removedProjectKeys),
            isNull(jiraComponents.deletedAt),
          ),
        ),
    );
  }

  const toInsert = unique.filter((key) => !existingKeys.has(key));
  if (toInsert.length > 0) {
    writes.push(
      db.insert(jiraProjects).values(
        toInsert.map((key) => ({
          userId,
          key,
          name: null,
        })),
      ),
    );
  }
  if (removedProjectKeys.length > 0 || toInsert.length > 0) {
    writes.push(
      db
        .update(jiraIssues)
        .set({ assignedListAt: null, cachedAt: now })
        .where(and(eq(jiraIssues.userId, userId), isNull(jiraIssues.deletedAt))),
    );
    writes.push(db.delete(jiraRefreshCursors).where(eq(jiraRefreshCursors.userId, userId)));
  }

  const [first, ...rest] = writes;
  if (first) {
    await db.batch([first, ...rest]);
  }
}

export async function replaceJiraComponents(
  db: Db,
  userId: string,
  projectKeys: string[],
  components: JiraComponent[],
): Promise<void> {
  const now = new Date();
  const uniqueProjectKeys = [
    ...new Set(projectKeys.map((key) => key.trim().toUpperCase()).filter(Boolean)),
  ];
  const writes = [];

  if (uniqueProjectKeys.length === 0) {
    writes.push(
      db
        .update(jiraComponents)
        .set({ deletedAt: now, cachedAt: now })
        .where(and(eq(jiraComponents.userId, userId), isNull(jiraComponents.deletedAt))),
    );
  }

  for (const projectKey of uniqueProjectKeys) {
    const componentIds = [
      ...new Set(
        components
          .filter((component) => component.projectKey.toUpperCase() === projectKey)
          .map((component) => component.id),
      ),
    ];
    writes.push(
      db
        .update(jiraComponents)
        .set({ deletedAt: now, cachedAt: now })
        .where(
          and(
            eq(jiraComponents.userId, userId),
            eq(jiraComponents.projectKey, projectKey),
            isNull(jiraComponents.deletedAt),
            componentIds.length > 0
              ? notInArray(jiraComponents.componentId, componentIds)
              : sql`true`,
          ),
        ),
    );
  }

  const [first, ...rest] = writes;
  if (first) {
    await db.batch([first, ...rest]);
  }
  await upsertJiraComponents(db, userId, components);
}

export async function upsertJiraComponents(
  db: Db,
  userId: string,
  components: JiraComponent[],
): Promise<void> {
  for (const component of components) {
    await db
      .insert(jiraComponents)
      .values({
        userId,
        projectKey: component.projectKey,
        componentId: component.id,
        name: component.name,
        description: component.description,
        archived: component.archived,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          jiraComponents.userId,
          jiraComponents.projectKey,
          jiraComponents.componentId,
        ],
        targetWhere: sql`${jiraComponents.deletedAt} is null`,
        set: {
          name: component.name,
          description: component.description,
          archived: component.archived,
          cachedAt: new Date(),
          deletedAt: null,
        },
      });
  }
}

export async function listJiraComponents(
  db: Db,
  userId: string,
): Promise<JiraComponent[]> {
  const rows = await db.query.jiraComponents.findMany({
    where: and(eq(jiraComponents.userId, userId), isNull(jiraComponents.deletedAt)),
    orderBy: [asc(jiraComponents.name)],
  });

  return rows.map((row) => ({
    id: row.componentId,
    name: row.name,
    projectKey: row.projectKey,
    description: row.description,
    archived: row.archived,
  }));
}

export async function upsertJiraUsers(
  db: Db,
  ownerUserId: string,
  users: JiraUser[],
): Promise<void> {
  for (const jiraUser of users) {
    const identity = stableJiraUserIdentity(jiraUser);
    let insert = db
      .insert(jiraUsers)
      .values({
        userId: ownerUserId,
        accountId: jiraUser.accountId,
        userKey: jiraUser.key,
        name: jiraUser.name,
        displayName: jiraUser.displayName,
        emailAddress: jiraUser.emailAddress,
        active: jiraUser.active,
        avatarUrl: jiraUser.avatarUrl,
        deletedAt: null,
      });

    const set = {
      userKey: jiraUser.key,
      name: jiraUser.name,
      displayName: jiraUser.displayName,
      emailAddress: jiraUser.emailAddress,
      active: jiraUser.active,
      avatarUrl: jiraUser.avatarUrl,
      cachedAt: new Date(),
      deletedAt: null,
    };

    if (identity?.column === "accountId") {
      await insert.onConflictDoUpdate({
        target: [jiraUsers.userId, jiraUsers.accountId],
        targetWhere: sql`${jiraUsers.accountId} is not null and ${jiraUsers.deletedAt} is null`,
        set,
      });
      continue;
    }

    if (identity?.column === "userKey") {
      await insert.onConflictDoUpdate({
        target: [jiraUsers.userId, jiraUsers.userKey],
        targetWhere: sql`${jiraUsers.accountId} is null and ${jiraUsers.userKey} is not null and ${jiraUsers.deletedAt} is null`,
        set,
      });
      continue;
    }

    if (identity?.column === "name") {
      await insert.onConflictDoUpdate({
        target: [jiraUsers.userId, jiraUsers.name],
        targetWhere: sql`${jiraUsers.accountId} is null and ${jiraUsers.userKey} is null and ${jiraUsers.name} is not null and ${jiraUsers.deletedAt} is null`,
        set,
      });
      continue;
    }

    await insert;
  }
}

export async function listJiraUsers(
  db: Db,
  ownerUserId: string,
): Promise<JiraUser[]> {
  const rows = await db.query.jiraUsers.findMany({
    where: and(eq(jiraUsers.userId, ownerUserId), isNull(jiraUsers.deletedAt)),
    orderBy: [asc(jiraUsers.displayName)],
  });

  return rows.map((row) => ({
    accountId: row.accountId,
    key: row.userKey,
    name: row.name,
    displayName: row.displayName,
    emailAddress: row.emailAddress,
    active: row.active,
    avatarUrl: row.avatarUrl,
  }));
}

export async function upsertJiraIssue(
  db: Db,
  userId: string,
  issue: JiraIssue,
  options: { assignedListAt?: Date | null } = {},
): Promise<JiraIssueRow> {
  const assignedListAt = options.assignedListAt;
  const [row] = await db
    .insert(jiraIssues)
    .values({
      userId,
      issueId: issue.id,
      key: issue.key,
      summary: issue.summary,
      description: issue.description,
      statusId: issue.status.id,
      statusName: issue.status.name,
      statusCategory: issue.status.category,
      statusColorName: issue.status.colorName,
      issueType: issue.issueType,
      priority: issue.priority,
      assigneeAccountId: issue.assignee?.accountId ?? null,
      assigneeName: issue.assignee?.displayName ?? null,
      assigneeEmail: issue.assignee?.emailAddress ?? null,
      dueDate: issue.dueDate,
      components: issue.components,
      browseUrl: issue.browseUrl,
      remoteUpdatedAt: new Date(issue.updatedAt),
      ...(assignedListAt !== undefined ? { assignedListAt } : {}),
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: [jiraIssues.userId, jiraIssues.issueId],
      targetWhere: sql`${jiraIssues.deletedAt} is null`,
      set: {
        key: issue.key,
        summary: issue.summary,
        description: issue.description,
        statusId: issue.status.id,
        statusName: issue.status.name,
        statusCategory: issue.status.category,
        statusColorName: issue.status.colorName,
        issueType: issue.issueType,
        priority: issue.priority,
        assigneeAccountId: issue.assignee?.accountId ?? null,
        assigneeName: issue.assignee?.displayName ?? null,
        assigneeEmail: issue.assignee?.emailAddress ?? null,
        dueDate: issue.dueDate,
        components: issue.components,
        browseUrl: issue.browseUrl,
        remoteUpdatedAt: new Date(issue.updatedAt),
        cachedAt: new Date(),
        ...(assignedListAt !== undefined ? { assignedListAt } : {}),
        deletedAt: null,
      },
    })
    .returning();

  return row!;
}

export async function listJiraIssues(db: Db, userId: string): Promise<JiraIssue[]> {
  const rows = await db.query.jiraIssues.findMany({
    where: and(
      eq(jiraIssues.userId, userId),
      isNull(jiraIssues.deletedAt),
      sql`${jiraIssues.assignedListAt} is not null`,
    ),
    orderBy: [asc(jiraIssues.key)],
  });
  const linkedTasks = await linkedTasksForIssues(db, userId, rows.map((row) => row.issueId));
  const projectKeys = await listJiraProjectKeys(db, userId);
  return rows.filter((row) => shouldShowJiraIssueForProjectKeys(row.key, projectKeys)).map((row) =>
    mapJiraIssue(row, { linkedTasks: linkedTasks.get(row.issueId) ?? [] }),
  );
}

export async function findCachedJiraIssue(
  db: Db,
  userId: string,
  issueIdOrKey: string,
): Promise<JiraIssue | undefined> {
  const row = await db.query.jiraIssues.findFirst({
    where: and(
      eq(jiraIssues.userId, userId),
      isNull(jiraIssues.deletedAt),
      sql`(${jiraIssues.issueId} = ${issueIdOrKey} or ${jiraIssues.key} = ${issueIdOrKey})`,
    ),
  });
  if (!row) {
    return undefined;
  }
  const linkedTasks = await linkedTasksForIssues(db, userId, [row.issueId]);
  return mapJiraIssue(row, { linkedTasks: linkedTasks.get(row.issueId) ?? [] });
}

export async function findReportVisibleJiraIssue(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  issueIdOrKey: string,
  permissions: ManagerPermissionRow | { canSeeDay: boolean; canSeePrivate: boolean } | null,
): Promise<JiraIssue | undefined> {
  if (!permissions?.canSeeDay) {
    return undefined;
  }

  const report = await db.query.user.findFirst({
    where: eq(user.id, reportUserId),
    columns: { email: true },
  });
  const reportEmail = report?.email.toLowerCase() ?? null;
  const row =
    await findVisibleReportJiraIssueRow(
      db,
      managerUserId,
      reportUserId,
      issueIdOrKey,
      reportEmail,
      permissions,
    ) ??
    await findVisibleReportJiraIssueRow(
      db,
      reportUserId,
      reportUserId,
      issueIdOrKey,
      reportEmail,
      permissions,
    );
  if (!row) {
    return undefined;
  }

  const projectKeys = await listJiraProjectKeys(db, managerUserId);
  if (!shouldShowJiraIssueForProjectKeys(row.key, projectKeys)) {
    return undefined;
  }

  return mapJiraIssue(row, {
    linkedTasks: await managerVisibleJiraLinkedTasks(
      db,
      reportUserId,
      row.issueId,
      permissions,
    ),
  });
}

async function findVisibleReportJiraIssueRow(
  db: Db,
  cacheUserId: string,
  reportUserId: string,
  issueIdOrKey: string,
  reportEmail: string | null,
  permissions: ManagerPermissionRow | { canSeeDay: boolean; canSeePrivate: boolean },
): Promise<JiraIssueRow | undefined> {
  const rows = await db
    .select({ issue: jiraIssues, linkedTaskId: tasks.id })
    .from(jiraIssues)
    .leftJoin(
      jiraTaskLinks,
      and(
        eq(jiraTaskLinks.userId, reportUserId),
        eq(jiraTaskLinks.issueId, jiraIssues.issueId),
        isNull(jiraTaskLinks.deletedAt),
      ),
    )
    .leftJoin(
      tasks,
      and(
        eq(tasks.id, jiraTaskLinks.taskId),
        eq(tasks.userId, reportUserId),
        isNull(tasks.deletedAt),
        ...(permissions.canSeePrivate ? [] : [eq(tasks.isPrivate, false)]),
      ),
    )
    .where(
      and(
        eq(jiraIssues.userId, cacheUserId),
        isNull(jiraIssues.deletedAt),
        sql`(${jiraIssues.issueId} = ${issueIdOrKey} or ${jiraIssues.key} = ${issueIdOrKey})`,
        reportEmail
          ? or(
              sql`lower(${jiraIssues.assigneeEmail}) = ${reportEmail}`,
              sql`${tasks.id} is not null`,
            )
          : sql`${tasks.id} is not null`,
      ),
    )
    .limit(1);

  return rows[0]?.issue;
}

export async function resetAssignedJiraIssues(
  db: Db,
  userId: string,
  issueKeys: string[],
): Promise<void> {
  const keys = [...new Set(issueKeys.map((key) => key.trim()).filter(Boolean))];
  if (keys.length === 0) {
    return;
  }

  await db
    .update(jiraIssues)
    .set({ assignedListAt: null, cachedAt: new Date() })
    .where(
      and(
        eq(jiraIssues.userId, userId),
        inArray(jiraIssues.key, keys),
        isNull(jiraIssues.deletedAt),
      ),
    );
}

export function queryReportJiraIssuesSql(): string {
  const query = new QueryBuilder()
    .select({ issueId: jiraIssues.issueId })
    .from(jiraIssues)
    .leftJoin(
      jiraTaskLinks,
      and(
        eq(jiraTaskLinks.userId, "report-user"),
        eq(jiraTaskLinks.issueId, jiraIssues.issueId),
        isNull(jiraTaskLinks.deletedAt),
      ),
    )
    .leftJoin(
      tasks,
      and(
        eq(tasks.id, jiraTaskLinks.taskId),
        eq(tasks.userId, "report-user"),
        isNull(tasks.deletedAt),
        sql`${tasks.isPrivate} = false`,
      ),
    )
    .where(and(eq(jiraIssues.userId, "manager-user"), isNull(jiraIssues.deletedAt)))
    .toSQL();

  return query.sql.replace(/"/g, "");
}

export function queryAssignedJiraIssuesSql(): string {
  const query = new QueryBuilder()
    .select({ issueId: jiraIssues.issueId })
    .from(jiraIssues)
    .where(
      and(
        eq(jiraIssues.userId, "owner-user"),
        isNull(jiraIssues.deletedAt),
        sql`${jiraIssues.assignedListAt} is not null`,
      ),
    )
    .toSQL();

  return query.sql.replace(/"/g, "");
}

export function queryClearJiraCacheSql(): string {
  return [
    "update jira_components set deleted_at = now(), cached_at = now() where user_id = $1 and deleted_at is null",
    "update jira_issues set deleted_at = now(), cached_at = now(), assigned_list_at = null where user_id = $1 and deleted_at is null",
    "update jira_issue_comments set deleted_at = now(), cached_at = now() where user_id = $1 and deleted_at is null",
    "update jira_users set deleted_at = now(), cached_at = now() where user_id = $1 and deleted_at is null",
    "delete from jira_refresh_cursors where user_id = $1",
  ].join("\n");
}

export function queryResetJiraScopeCacheSql(): string {
  return [
    "update jira_issues set assigned_list_at = null, cached_at = now() where user_id = $1 and deleted_at is null",
    "delete from jira_refresh_cursors where user_id = $1",
  ].join("\n");
}

export function queryReplaceJiraComponentsSql(): string {
  return [
    "update jira_components set deleted_at = now(), cached_at = now() where user_id = $1 and project_key in ($2) and component_id not in ($3) and deleted_at is null",
    "insert into jira_components (...) values (...) on conflict do update",
  ].join("\n");
}

export function queryJiraUserFallbackIndexesSql(): string {
  return [
    "create unique index jira_users_user_key_uidx on jira_users (user_id, user_key) where account_id is null and user_key is not null and deleted_at is null",
    "create unique index jira_users_user_name_uidx on jira_users (user_id, name) where account_id is null and user_key is null and name is not null and deleted_at is null",
  ].join("\n");
}

export function queryJiraJqlPresetsSql(): string {
  return [
    "create table jira_jql_presets (id uuid primary key, user_id text not null, name text not null, jql text not null, is_default boolean not null default false)",
    "create unique index jira_jql_presets_user_name_uidx on jira_jql_presets (user_id, name) where deleted_at is null",
    "create unique index jira_jql_presets_user_default_uidx on jira_jql_presets (user_id) where is_default = true and deleted_at is null",
  ].join("\n");
}

export async function listReportJiraIssues(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  permissions: ManagerPermissionRow | { canSeeDay: boolean; canSeePrivate: boolean } | null,
): Promise<JiraIssue[]> {
  if (!permissions?.canSeeDay) {
    return [];
  }

  const report = await db.query.user.findFirst({
    where: eq(user.id, reportUserId),
    columns: { email: true },
  });
  const reportEmail = report?.email.toLowerCase() ?? null;
  const rows = await db
    .select({ issue: jiraIssues, linkedTaskId: tasks.id })
    .from(jiraIssues)
    .leftJoin(
      jiraTaskLinks,
      and(
        eq(jiraTaskLinks.userId, reportUserId),
        eq(jiraTaskLinks.issueId, jiraIssues.issueId),
        isNull(jiraTaskLinks.deletedAt),
      ),
    )
    .leftJoin(
      tasks,
      and(
        eq(tasks.id, jiraTaskLinks.taskId),
        eq(tasks.userId, reportUserId),
        isNull(tasks.deletedAt),
        ...(permissions.canSeePrivate ? [] : [eq(tasks.isPrivate, false)]),
      ),
    )
    .where(
      and(
        eq(jiraIssues.userId, managerUserId),
        isNull(jiraIssues.deletedAt),
        reportEmail
          ? or(
              sql`lower(${jiraIssues.assigneeEmail}) = ${reportEmail}`,
              sql`${tasks.id} is not null`,
            )
          : sql`${tasks.id} is not null`,
      ),
    )
    .orderBy(asc(jiraIssues.key));
  const projectKeys = await listJiraProjectKeys(db, managerUserId);
  const unique = new Map<string, JiraIssueRow>();

  for (const row of rows) {
    if (!shouldShowJiraIssueForProjectKeys(row.issue.key, projectKeys)) {
      continue;
    }
    unique.set(row.issue.issueId, row.issue);
  }

  const issues = [];
  for (const row of unique.values()) {
    issues.push(
      mapJiraIssue(row, {
        linkedTasks: await managerVisibleJiraLinkedTasks(
          db,
          reportUserId,
          row.issueId,
          permissions,
        ),
      }),
    );
  }

  return issues;
}

async function linkedTasksForIssues(
  db: Db,
  userId: string,
  issueIds: string[],
): Promise<Map<string, JiraLinkedTask[]>> {
  const result = new Map<string, JiraLinkedTask[]>();
  if (issueIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      issueId: jiraTaskLinks.issueId,
      taskId: tasks.id,
      title: tasks.title,
      isPrivate: tasks.isPrivate,
    })
    .from(jiraTaskLinks)
    .innerJoin(tasks, eq(jiraTaskLinks.taskId, tasks.id))
    .where(
      and(
        eq(jiraTaskLinks.userId, userId),
        inArray(jiraTaskLinks.issueId, issueIds),
        isNull(jiraTaskLinks.deletedAt),
        isNull(tasks.deletedAt),
      ),
    );

  for (const row of rows) {
    const bucket = result.get(row.issueId) ?? [];
    bucket.push({
      taskId: row.taskId,
      title: row.title,
      isPrivate: row.isPrivate,
    });
    result.set(row.issueId, bucket);
  }

  return result;
}

export async function linkTaskToJiraIssue(
  db: Db,
  input: {
    userId: string;
    taskId: string;
    issueId: string;
    issueKey: string;
    id?: string;
  },
): Promise<JiraTaskLinkRow> {
  const [row] = await db
    .insert(jiraTaskLinks)
    .values({
      id: input.id,
      userId: input.userId,
      taskId: input.taskId,
      issueId: input.issueId,
      issueKey: input.issueKey,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: [jiraTaskLinks.userId, jiraTaskLinks.taskId, jiraTaskLinks.issueId],
      targetWhere: sql`${jiraTaskLinks.deletedAt} is null`,
      set: {
        issueKey: input.issueKey,
        deletedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row!;
}

export async function unlinkTaskFromJiraIssue(
  db: Db,
  userId: string,
  taskId: string,
  issueIdOrKey: string,
): Promise<boolean> {
  const rows = await db
    .update(jiraTaskLinks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(jiraTaskLinks.userId, userId),
        eq(jiraTaskLinks.taskId, taskId),
        isNull(jiraTaskLinks.deletedAt),
        sql`(${jiraTaskLinks.issueId} = ${issueIdOrKey} or ${jiraTaskLinks.issueKey} = ${issueIdOrKey})`,
      ),
    )
    .returning({ id: jiraTaskLinks.id });

  return rows.length > 0;
}

export async function linkSummariesForTasks(
  db: Db,
  taskIds: string[],
): Promise<Map<string, JiraTaskLinkSummary[]>> {
  const result = new Map<string, JiraTaskLinkSummary[]>();
  if (taskIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      taskId: jiraTaskLinks.taskId,
      issue: jiraIssues,
    })
    .from(jiraTaskLinks)
    .innerJoin(
      jiraIssues,
      and(
        eq(jiraIssues.userId, jiraTaskLinks.userId),
        eq(jiraIssues.issueId, jiraTaskLinks.issueId),
        isNull(jiraIssues.deletedAt),
      ),
    )
    .where(and(inArray(jiraTaskLinks.taskId, taskIds), isNull(jiraTaskLinks.deletedAt)));

  for (const row of rows) {
    const bucket = result.get(row.taskId) ?? [];
    bucket.push(mapJiraTaskLinkSummary(row.issue));
    result.set(row.taskId, bucket);
  }

  return result;
}

export async function linkedJiraIssueRefsForTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<{ issueId: string; issueKey: string }[]> {
  return db
    .select({
      issueId: jiraTaskLinks.issueId,
      issueKey: jiraTaskLinks.issueKey,
    })
    .from(jiraTaskLinks)
    .where(
      and(
        eq(jiraTaskLinks.userId, userId),
        eq(jiraTaskLinks.taskId, taskId),
        isNull(jiraTaskLinks.deletedAt),
      ),
    );
}

export async function managerVisibleJiraLinkedTasks(
  db: Db,
  reportUserId: string,
  issueId: string,
  permissions: ManagerPermissionRow | { canSeeDay: boolean; canSeePrivate: boolean } | null,
): Promise<JiraLinkedTask[]> {
  if (!permissions?.canSeeDay) {
    return [];
  }

  const rows = await db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      isPrivate: tasks.isPrivate,
    })
    .from(jiraTaskLinks)
    .innerJoin(tasks, eq(jiraTaskLinks.taskId, tasks.id))
    .where(
      and(
        eq(jiraTaskLinks.userId, reportUserId),
        eq(jiraTaskLinks.issueId, issueId),
        isNull(jiraTaskLinks.deletedAt),
        isNull(tasks.deletedAt),
        ...(permissions.canSeePrivate ? [] : [eq(tasks.isPrivate, false)]),
      ),
    );

  return rows.map((row) => ({
    taskId: row.taskId,
    title: row.title,
    isPrivate: row.isPrivate,
  }));
}

export async function upsertJiraComments(
  db: Db,
  userId: string,
  comments: JiraComment[],
): Promise<void> {
  for (const comment of comments) {
    await db
      .insert(jiraIssueComments)
      .values({
        userId,
        issueId: comment.issueId,
        issueKey: comment.issueKey,
        commentId: comment.id,
        author: comment.author,
        body: comment.body,
        remoteCreatedAt: new Date(comment.createdAt),
        remoteUpdatedAt: new Date(comment.updatedAt),
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          jiraIssueComments.userId,
          jiraIssueComments.issueId,
          jiraIssueComments.commentId,
        ],
        targetWhere: sql`${jiraIssueComments.deletedAt} is null`,
        set: {
          issueKey: comment.issueKey,
          author: comment.author,
          body: comment.body,
          remoteCreatedAt: new Date(comment.createdAt),
          remoteUpdatedAt: new Date(comment.updatedAt),
          cachedAt: new Date(),
          deletedAt: null,
        },
      });
  }
}

export async function listJiraComments(
  db: Db,
  userId: string,
  issueId: string,
): Promise<JiraComment[]> {
  const rows = await db.query.jiraIssueComments.findMany({
    where: and(
      eq(jiraIssueComments.userId, userId),
      eq(jiraIssueComments.issueId, issueId),
      isNull(jiraIssueComments.deletedAt),
    ),
    orderBy: [asc(jiraIssueComments.remoteCreatedAt)],
  });
  return rows.map(mapJiraComment);
}

export async function readJiraRefreshCursor(
  db: Db,
  userId: string,
  viewKey: string,
): Promise<Date | null> {
  const row = await db.query.jiraRefreshCursors.findFirst({
    where: and(
      eq(jiraRefreshCursors.userId, userId),
      eq(jiraRefreshCursors.viewKey, viewKey),
    ),
  });
  return row?.cursorUpdatedAt ?? null;
}

export async function updateJiraRefreshCursor(
  db: Db,
  userId: string,
  viewKey: string,
  cursorUpdatedAt: Date | null,
): Promise<void> {
  await db
    .insert(jiraRefreshCursors)
    .values({
      userId,
      viewKey,
      cursorUpdatedAt,
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [jiraRefreshCursors.userId, jiraRefreshCursors.viewKey],
      set: {
        cursorUpdatedAt,
        refreshedAt: new Date(),
      },
    });
}
