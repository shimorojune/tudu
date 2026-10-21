import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { API_URL } from './app';
import { me } from './spaces';

/** The fake Jira the test API serves (TEST_ROUTES): its address as you would type it. */
export const JIRA_SITE = `${API_URL}/__test/jira`;

/** A token the fake Jira accepts, fresh per test. */
export const goodToken = () => `good-${randomUUID()}`;

/** The Jira panel (beside the page on the desk and tablets, the page on phones). */
export function jiraPanel(page: Page): Locator {
  return page.locator('section.tp-jp');
}

/** The issues in the panel, by key, in order. */
export async function issueKeys(page: Page): Promise<string[]> {
  const labels = await jiraPanel(page)
    .getByRole('list', { name: 'Issues' })
    .getByRole('button', { name: /Open preview$/ })
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.map((l) => l.split(':')[0]!);
}

/** An issue's row in the panel. */
export function issueRow(page: Page, key: string): Locator {
  return jiraPanel(page).getByRole('button', { name: new RegExp(`^${key}: .*Open preview$`) });
}

/** Connect Jira in a space through the API (the form is tested on its own). Returns the token. */
export async function connectByApi(page: Page, spaceId?: string, token = goodToken()): Promise<string> {
  const id = spaceId ?? (await me(page)).spaces.find((s) => s.kind === 'personal')!.id;
  const res = await page.request.post(`${API_URL}/api/spaces/${id}/jira`, {
    data: { site: JIRA_SITE, token },
  });
  expect(res.status()).toBe(200);
  return token;
}

/** Make a token stop working in the fake Jira. */
export async function expire(page: Page, token: string): Promise<void> {
  expect((await page.request.post(`${API_URL}/__test/jira/expire`, { data: { token } })).status()).toBe(204);
}

/** Make the fake Jira answer 503 for a token (or answer again). */
export async function down(page: Page, token: string, on = true): Promise<void> {
  expect(
    (await page.request.post(`${API_URL}/__test/jira/down`, { data: { token, down: on } })).status(),
  ).toBe(204);
}

/** The top bar's Jira button (desk). */
export function jiraButton(page: Page): Locator {
  return page.locator('.tp-jirabtn');
}

/** Open the panel: the top bar's button on the desk, the rail's Jira on tablets, the tab on phones. */
export async function openJira(page: Page): Promise<void> {
  const project =
    (await page.evaluate(() => document.querySelector('[data-viewport]')?.getAttribute('data-viewport'))) ??
    '';
  if (project === 'phone')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Jira$/ }).click();
  else if (project === 'tablet') await sideJira(page).click();
  else await jiraButton(page).click();
  await expect(jiraPanel(page)).toBeVisible();
}

/** Pick a day for an issue from its calendar button: Today, Tomorrow or Backlog. */
export async function addTo(
  page: Page,
  key: string,
  choice: 'Today' | 'Tomorrow' | 'Backlog',
): Promise<void> {
  await jiraPanel(page)
    .getByRole('button', { name: `Add ${key} to a day` })
    .click();
  const pop = page.getByRole('dialog', { name: `Add ${key} to a day as a linked task` });
  await pop.getByRole('button', { name: choice, exact: true }).click();
}

/** The linked chip at the end of an issue's byline. */
export function chipOf(page: Page, key: string): Locator {
  return issueRow(page, key).locator('.tp-jp-linked');
}

/** The sidebar's Jira (desk and tablets), with its count. */
export function sideJira(page: Page): Locator {
  return page.locator('.tp-sidebar button.tp-nav').filter({ hasText: /^Jira/ });
}

/** The sidebar's quiet "Add an app". */
export function addAnApp(page: Page): Locator {
  return page.locator('.tp-sidebar button.tp-nav').filter({ hasText: 'Add an app' });
}
