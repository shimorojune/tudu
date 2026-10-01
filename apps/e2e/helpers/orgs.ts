import path from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Browser } from "@playwright/test";
import { expect } from "@playwright/test";
import { E2E_SERVER_URL } from "../constants.js";

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
export const authDir = path.join(e2eDir, "../.auth");

export type TestOutboxMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function uniqueOrgName(prefix = "E2E Org"): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

export async function clearTestOutbox(request: APIRequestContext) {
  await request.delete(`${E2E_SERVER_URL}/__test/outbox`);
}

export async function readTestOutbox(
  request: APIRequestContext,
  to?: string,
): Promise<TestOutboxMessage[]> {
  const url = to
    ? `${E2E_SERVER_URL}/__test/outbox?to=${encodeURIComponent(to)}`
    : `${E2E_SERVER_URL}/__test/outbox`;
  const response = await request.get(url);
  if (!response.ok()) {
    return [];
  }
  const body = (await response.json()) as { messages: TestOutboxMessage[] };
  return body.messages ?? [];
}

export function inviteTokenFromOutbox(message: TestOutboxMessage): string | null {
  const match = message.html.match(/\/invite\/([^"'<]+)/);
  return match?.[1] ?? null;
}

export async function latestInviteToken(
  request: APIRequestContext,
  email: string,
): Promise<string | null> {
  const messages = await readTestOutbox(request, email);
  const latest = messages.at(-1);
  return latest ? inviteTokenFromOutbox(latest) : null;
}

export async function waitForLatestInviteToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  let token: string | null = null;
  await expect
    .poll(async () => {
      token = await latestInviteToken(request, email);
      return token;
    })
    .not.toBeNull();
  return token!;
}

export async function createOrgViaApi(
  request: APIRequestContext,
  name: string,
): Promise<{ slug: string; orgId: string }> {
  const response = await request.post(`${E2E_SERVER_URL}/orgs`, {
    data: { name, color: "cobalt", joinLinkEnabled: false },
  });
  if (!response.ok()) {
    throw new Error(`create org failed: ${response.status()}`);
  }
  const body = (await response.json()) as {
    org: { slug: string; id: string };
  };
  return { slug: body.org.slug, orgId: body.org.id };
}

export async function inviteMemberViaApi(
  request: APIRequestContext,
  slug: string,
  email: string,
): Promise<void> {
  const response = await request.post(`${E2E_SERVER_URL}/orgs/${slug}/invites`, {
    data: { email, role: "member" },
  });
  if (!response.ok()) {
    throw new Error(`invite failed: ${response.status()}`);
  }
}

export async function acceptInviteInBrowser(
  browser: Browser,
  storagePath: string,
  token: string,
  webBaseUrl: string,
): Promise<void> {
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();
  await page.goto(`${webBaseUrl}/invite/${token}`);
  await expect(page.getByRole("heading", { name: /^Join / })).toBeVisible({
    timeout: 30_000,
  });
  const accept = page.getByRole("button", { name: "Accept invite" });
  await expect(accept).toBeEnabled({ timeout: 30_000 });
  await accept.click();
  await page.waitForURL(/\/(o\/|welcome|\?)/, { timeout: 60_000 });
  await context.close();
}
