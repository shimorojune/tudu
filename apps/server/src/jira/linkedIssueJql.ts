import { JIRA_LINK_MAX_AGE_DAYS } from "@tudu/shared";

function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function formatJiraUpdatedCutoff(now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - JIRA_LINK_MAX_AGE_DAYS);
  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, "0");
  const day = String(cutoff.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildLinkedIssueKeysJql(
  keys: string[],
  updatedCutoff: string,
): string {
  const quoted = keys.map((key) => `"${escapeJqlString(key)}"`).join(", ");
  return `key in (${quoted}) AND updated >= "${updatedCutoff}" ORDER BY updated DESC`;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
