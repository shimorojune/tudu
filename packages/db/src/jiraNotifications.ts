import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull, notInArray } from "drizzle-orm";
import { JIRA_LINK_MAX_AGE_DAYS } from "@tudu/shared";
import type { Db } from "./index.js";
import {
  jiraIssueComments,
  jiraIssues,
  jiraTaskLinks,
} from "./jira-schema.js";
import { tasks } from "./tasks-schema.js";
import {
  jiraIssueWatchState,
  type JiraIssueWatchStateRow,
} from "./jira-watch-schema.js";

export type LinkedJiraWatchTarget = {
  issueId: string;
  issueKey: string;
  summary: string;
  taskIds: string[];
  taskTitles: string[];
};

export function hashJiraDescription(text: string | null | undefined): string {
  return createHash("sha256").update(text ?? "").digest("hex");
}

export async function listLinkedJiraWatchTargets(
  db: Db,
  userId: string,
): Promise<LinkedJiraWatchTarget[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - JIRA_LINK_MAX_AGE_DAYS);

  const rows = await db
    .select({
      issueId: jiraIssues.issueId,
      issueKey: jiraIssues.key,
      summary: jiraIssues.summary,
      taskId: jiraTaskLinks.taskId,
      taskTitle: tasks.title,
    })
    .from(jiraTaskLinks)
    .innerJoin(
      jiraIssues,
      and(
        eq(jiraTaskLinks.userId, jiraIssues.userId),
        eq(jiraTaskLinks.issueId, jiraIssues.issueId),
        isNull(jiraIssues.deletedAt),
      ),
    )
    .innerJoin(
      tasks,
      and(eq(jiraTaskLinks.taskId, tasks.id), isNull(tasks.deletedAt)),
    )
    .where(
      and(
        eq(jiraTaskLinks.userId, userId),
        isNull(jiraTaskLinks.deletedAt),
        gte(jiraIssues.remoteUpdatedAt, cutoff),
      ),
    );

  const byIssue = new Map<string, LinkedJiraWatchTarget>();
  for (const row of rows) {
    const existing = byIssue.get(row.issueId);
    if (existing) {
      if (!existing.taskIds.includes(row.taskId)) {
        existing.taskIds.push(row.taskId);
        existing.taskTitles.push(row.taskTitle);
      }
      continue;
    }
    byIssue.set(row.issueId, {
      issueId: row.issueId,
      issueKey: row.issueKey,
      summary: row.summary,
      taskIds: [row.taskId],
      taskTitles: [row.taskTitle],
    });
  }
  return [...byIssue.values()];
}

export async function getJiraWatchState(
  db: Db,
  userId: string,
  issueId: string,
): Promise<JiraIssueWatchStateRow | undefined> {
  return db.query.jiraIssueWatchState.findFirst({
    where: and(
      eq(jiraIssueWatchState.userId, userId),
      eq(jiraIssueWatchState.issueId, issueId),
    ),
  });
}

export async function upsertJiraWatchState(
  db: Db,
  userId: string,
  snapshot: {
    issueId: string;
    issueKey: string;
    assigneeAccountId: string | null;
    assignedToMe: boolean | null;
    statusName: string | null;
    priorityName: string | null;
    dueAt: Date | null;
    summary: string | null;
    descriptionHash: string | null;
    lastCommentId: string | null;
    lastCommentUpdatedAt: Date | null;
  },
): Promise<JiraIssueWatchStateRow> {
  const [row] = await db
    .insert(jiraIssueWatchState)
    .values({
      userId,
      issueId: snapshot.issueId,
      issueKey: snapshot.issueKey,
      assigneeAccountId: snapshot.assigneeAccountId,
      assignedToMe: snapshot.assignedToMe,
      statusName: snapshot.statusName,
      priorityName: snapshot.priorityName,
      dueAt: snapshot.dueAt,
      summary: snapshot.summary,
      descriptionHash: snapshot.descriptionHash,
      lastCommentId: snapshot.lastCommentId,
      lastCommentUpdatedAt: snapshot.lastCommentUpdatedAt,
    })
    .onConflictDoUpdate({
      target: [jiraIssueWatchState.userId, jiraIssueWatchState.issueId],
      set: {
        issueKey: snapshot.issueKey,
        assigneeAccountId: snapshot.assigneeAccountId,
        assignedToMe: snapshot.assignedToMe,
        statusName: snapshot.statusName,
        priorityName: snapshot.priorityName,
        dueAt: snapshot.dueAt,
        summary: snapshot.summary,
        descriptionHash: snapshot.descriptionHash,
        lastCommentId: snapshot.lastCommentId,
        lastCommentUpdatedAt: snapshot.lastCommentUpdatedAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function pruneStaleJiraWatchState(
  db: Db,
  userId: string,
  activeIssueIds: string[],
): Promise<void> {
  if (activeIssueIds.length === 0) {
    await db
      .delete(jiraIssueWatchState)
      .where(eq(jiraIssueWatchState.userId, userId));
    return;
  }
  await db
    .delete(jiraIssueWatchState)
    .where(
      and(
        eq(jiraIssueWatchState.userId, userId),
        notInArray(jiraIssueWatchState.issueId, activeIssueIds),
      ),
    );
}

export async function listJiraCommentsForIssues(
  db: Db,
  userId: string,
  issueIds: string[],
): Promise<
  {
    issueId: string;
    commentId: string;
    author: {
      accountId?: string | null;
      name?: string | null;
      key?: string | null;
      emailAddress?: string | null;
    } | null;
    body: string;
    updatedAt: Date;
  }[]
> {
  if (issueIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      issueId: jiraIssueComments.issueId,
      commentId: jiraIssueComments.commentId,
      author: jiraIssueComments.author,
      body: jiraIssueComments.body,
      updatedAt: jiraIssueComments.remoteUpdatedAt,
    })
    .from(jiraIssueComments)
    .where(
      and(
        eq(jiraIssueComments.userId, userId),
        inArray(jiraIssueComments.issueId, issueIds),
        isNull(jiraIssueComments.deletedAt),
      ),
    );
  return rows.map((row) => {
    const author = row.author as {
      accountId?: string | null;
      name?: string | null;
      key?: string | null;
      emailAddress?: string | null;
    } | null;
    return {
      issueId: row.issueId,
      commentId: row.commentId,
      author,
      body: row.body,
      updatedAt: row.updatedAt,
    };
  });
}
