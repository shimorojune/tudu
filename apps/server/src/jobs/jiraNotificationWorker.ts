import type { Db } from "@tudu/db";
import {
  ensureNotificationPreferences,
  findCachedJiraIssue,
  getJiraConnection,
  getJiraWatchState,
  hashJiraDescription,
  listLinkedJiraWatchTargets,
  listJiraCommentsForIssues,
  pruneStaleJiraWatchState,
  upsertJiraComments,
  upsertJiraIssue,
  upsertJiraWatchState,
  type LinkedJiraWatchTarget,
} from "@tudu/db";
import type { JiraIssue, NotificationKind } from "@tudu/shared";
import { clipNotificationText, isNotificationKindEnabled } from "@tudu/shared";
import {
  createJiraDataCenterAdapter,
  issueAssignedToJiraUser,
  type JiraAdapterFactory,
} from "../jira/client.js";
import {
  buildLinkedIssueKeysJql,
  chunkArray,
  formatJiraUpdatedCutoff,
} from "../jira/linkedIssueJql.js";
import { adapterFor } from "../routes/jira.js";
import { insertSystemNotificationsWithPush } from "../notifications/delivery.js";

type PendingNotification = {
  kind: NotificationKind;
  body: string;
  taskTitle: string;
  taskId: string | null;
  jiraIssueId: string;
  jiraIssueKey: string;
  metadata?: Record<string, unknown>;
};

function displayTitle(target: LinkedJiraWatchTarget): string {
  const summary = clipNotificationText(target.summary, 48);
  return `${target.issueKey}: ${summary}`;
}

function dueDateToDate(dueDate: string | null | undefined): Date | null {
  if (!dueDate) {
    return null;
  }
  return new Date(`${dueDate}T12:00:00`);
}

export async function runJiraNotificationPoll(
  db: Db,
  userId: string,
  adapterFactory: JiraAdapterFactory = createJiraDataCenterAdapter,
): Promise<number> {
  const connection = await getJiraConnection(db, userId);
  if (!connection) {
    return 0;
  }

  const prefs = await ensureNotificationPreferences(db, userId);
  const adapter = await adapterFor(db, userId, adapterFactory);
  if (!adapter) {
    return 0;
  }

  const myself = await adapter.myself();
  const targets = await listLinkedJiraWatchTargets(db, userId);
  await pruneStaleJiraWatchState(
    db,
    userId,
    targets.map((target) => target.issueId),
  );
  if (targets.length === 0) {
    return 0;
  }

  const updatedCutoff = formatJiraUpdatedCutoff();

  let sent = 0;
  for (const chunk of chunkArray(targets, 50)) {
    const jql = buildLinkedIssueKeysJql(
      chunk.map((target) => target.issueKey),
      updatedCutoff,
    );
    const { issues } = await adapter.searchIssues(jql, { maxResults: 50 });
    for (const issue of issues) {
      await upsertJiraIssue(db, userId, issue);
      const comments = await adapter.listComments(issue.id);
      await upsertJiraComments(db, userId, comments);
    }
  }

  const issueIds = targets.map((target) => target.issueId);
  const cachedComments = await listJiraCommentsForIssues(db, userId, issueIds);
  const commentsByIssue = new Map<string, typeof cachedComments>();
  for (const comment of cachedComments) {
    const list = commentsByIssue.get(comment.issueId) ?? [];
    list.push(comment);
    commentsByIssue.set(comment.issueId, list);
  }

  for (const target of targets) {
    const cached =
      (await findCachedJiraIssue(db, userId, target.issueId)) ??
      (await findCachedJiraIssue(db, userId, target.issueKey));
    if (!cached) {
      continue;
    }

    const issueComments = commentsByIssue.get(target.issueId) ?? [];
    const newestComment = issueComments.reduce<(typeof issueComments)[0] | null>(
      (best, row) => {
        if (!best || row.updatedAt > best.updatedAt) {
          return row;
        }
        return best;
      },
      null,
    );

    const snapshot = {
      issueId: target.issueId,
      issueKey: target.issueKey,
      assigneeAccountId: cached.assignee?.accountId ?? null,
      statusName: cached.status.name,
      priorityName: cached.priority ?? null,
      dueAt: dueDateToDate(cached.dueDate),
      summary: cached.summary,
      descriptionHash: hashJiraDescription(cached.description),
      lastCommentId: newestComment?.commentId ?? null,
      lastCommentUpdatedAt: newestComment?.updatedAt ?? null,
    };

    const prior = await getJiraWatchState(db, userId, target.issueId);
    const pending: PendingNotification[] = [];

    if (prior) {
      collectDiffs({
        prior,
        snapshot,
        cached,
        target,
        myselfAccountId: myself.accountId ?? null,
        myself,
        newestComment,
        pending,
      });
    }

    await upsertJiraWatchState(db, userId, snapshot);

    for (const item of pending) {
      if (!isNotificationKindEnabled(prefs, item.kind)) {
        continue;
      }
      await insertSystemNotificationsWithPush(db, {
        recipientUserIds: [userId],
        clientMutationId: null,
        kind: item.kind,
        body: item.body,
        taskTitle: item.taskTitle,
        taskId: item.taskId,
        jiraIssueId: item.jiraIssueId,
        jiraIssueKey: item.jiraIssueKey,
        metadata: item.metadata,
      });
      sent += 1;
    }
  }

  return sent;
}

function collectDiffs(args: {
  prior: Awaited<ReturnType<typeof getJiraWatchState>>;
  snapshot: {
    assigneeAccountId: string | null;
    statusName: string | null;
    priorityName: string | null;
    dueAt: Date | null;
    summary: string | null;
    descriptionHash: string | null;
    lastCommentId: string | null;
  };
  cached: JiraIssue;
  target: LinkedJiraWatchTarget;
  myselfAccountId: string | null;
  myself: Parameters<typeof issueAssignedToJiraUser>[1];
  newestComment: {
    commentId: string;
    authorAccountId: string | null;
    body: string;
  } | null;
  pending: PendingNotification[];
}): void {
  const title = displayTitle(args.target);
  const taskId = args.target.taskIds[0] ?? null;
  const base = {
    taskTitle: title,
    taskId,
    jiraIssueId: args.target.issueId,
    jiraIssueKey: args.target.issueKey,
    metadata: { linkedTaskIds: args.target.taskIds },
  };

  const wasAssigned = args.prior?.assigneeAccountId
    ? args.prior.assigneeAccountId === args.myselfAccountId
    : false;
  const nowAssigned = issueAssignedToJiraUser(args.cached, args.myself);

  if (!wasAssigned && nowAssigned) {
    args.pending.push({
      kind: "jira_assigned",
      body: `You were assigned ${title}`,
      ...base,
    });
  } else if (wasAssigned && !nowAssigned) {
    args.pending.push({
      kind: "jira_unassigned",
      body: `You were unassigned from ${title}`,
      ...base,
    });
  }

  if (
    args.newestComment &&
    args.newestComment.commentId !== args.prior?.lastCommentId &&
    args.newestComment.authorAccountId !== args.myselfAccountId
  ) {
    const quote = clipNotificationText(args.newestComment.body, 80);
    args.pending.push({
      kind: "jira_comment",
      body: quote ? `New comment on ${title}: ${quote}` : `New comment on ${title}`,
      ...base,
      metadata: {
        ...base.metadata,
        commentId: args.newestComment.commentId,
      },
    });
  }

  const fieldChanges: string[] = [];
  if (args.prior?.statusName !== args.snapshot.statusName) {
    fieldChanges.push("status");
  }
  if (args.prior?.priorityName !== args.snapshot.priorityName) {
    fieldChanges.push("priority");
  }
  if (
    (args.prior?.dueAt?.toISOString() ?? null) !==
    (args.snapshot.dueAt?.toISOString() ?? null)
  ) {
    fieldChanges.push("due date");
  }
  if (args.prior?.summary !== args.snapshot.summary) {
    fieldChanges.push("summary");
  }
  if (args.prior?.descriptionHash !== args.snapshot.descriptionHash) {
    fieldChanges.push("description");
  }

  if (fieldChanges.length > 0) {
    args.pending.push({
      kind: "jira_updated",
      body: `${title}: ${fieldChanges.join(", ")} changed`,
      ...base,
      metadata: { ...base.metadata, fields: fieldChanges },
    });
  }
}
