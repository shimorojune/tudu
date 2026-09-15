import type { Db } from "@tudu/db";
import {
  findReportVisibleJiraIssue,
  listJiraProjectKeys,
} from "@tudu/db";
import type { JiraIssue, ManagerPermissions } from "@tudu/shared";

export class JiraAccessError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
  ) {
    super(message);
    this.name = "JiraAccessError";
  }
}

export function ensureAllowedJiraBaseUrl(baseUrl: string): void {
  const allowlist = (process.env.JIRA_BASE_URL_ALLOWLIST ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowlist.length === 0) {
    return;
  }

  const parsed = new URL(baseUrl);
  const allowed = allowlist.some((entry) => {
    try {
      return new URL(entry).origin === parsed.origin;
    } catch {
      return entry.toLowerCase() === parsed.hostname.toLowerCase();
    }
  });
  if (!allowed) {
    throw new JiraAccessError("Jira URL is not allowed", 400);
  }
}

export async function ensureConfiguredJiraProjectKey(
  db: Db,
  userId: string,
  projectKey: string,
): Promise<void> {
  const configured = await listJiraProjectKeys(db, userId);
  if (configured.length === 0) {
    return;
  }
  if (!configured.includes(projectKey.trim().toUpperCase())) {
    throw new JiraAccessError("Jira project is not configured", 400);
  }
}

export async function requireReportVisibleJiraIssue(
  db: Db,
  managerUserId: string,
  reportUserId: string,
  issueIdOrKey: string,
  permissions: Pick<ManagerPermissions, "canSeeDay" | "canSeePrivate"> | null,
): Promise<JiraIssue> {
  const issue = await findReportVisibleJiraIssue(
    db,
    managerUserId,
    reportUserId,
    issueIdOrKey,
    permissions,
  );
  if (!issue) {
    throw new JiraAccessError("Jira issue is not visible for this report", 403);
  }
  return issue;
}
