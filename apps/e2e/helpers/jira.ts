import type { Page } from "@playwright/test";
import { E2E_SERVER_URL } from "../constants.js";

export async function isJiraConnected(page: Page): Promise<boolean> {
  const response = await page.request.get(`${E2E_SERVER_URL}/jira/status`);
  if (!response.ok()) {
    return false;
  }
  const body = (await response.json()) as { connection?: { connected?: boolean } };
  return body.connection?.connected === true;
}

export function jiraTag(testTitle: string): string {
  return testTitle;
}
