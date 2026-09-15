import type { Page } from "@playwright/test";

export async function isJiraConnected(page: Page): Promise<boolean> {
  const response = await page.request.get("http://localhost:3456/jira/status");
  if (!response.ok()) {
    return false;
  }
  const body = (await response.json()) as { connection?: { connected?: boolean } };
  return body.connection?.connected === true;
}

export function jiraTag(testTitle: string): string {
  return testTitle;
}
