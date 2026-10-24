import { expect, type Locator, type Page } from '@playwright/test';
import { API_URL } from './app';

/** The Inbox's button: the top bar's on the desk and tablets, the header's icon on phones. */
export function inboxButton(page: Page): Locator {
  return page.locator('.tp-tb-inbox, .app-phone-inbox').first();
}

/** Go to the one Inbox from wherever you are. */
export async function goInbox(page: Page): Promise<void> {
  await inboxButton(page).click();
  await expect(page.getByRole('region', { name: 'The Inbox' })).toBeVisible();
}

/** The Inbox's count beside its title: "2 to answer · 3 new", "All caught up". */
export function inboxCount(page: Page): Locator {
  return page.getByRole('region', { name: 'The Inbox' }).locator('.tp-dh-date');
}

export function section(page: Page, title: 'To answer' | 'Updates' | 'Answered' | 'Sent'): Locator {
  return page.getByRole('region', { name: title });
}

/** The list's rows in a section. */
export function rows(sec: Locator): Locator {
  return sec.locator('.tp-ix');
}

/** The reading pane's item. */
export function pane(page: Page): Locator {
  return page.locator('.tp-ix-full');
}

/** Turn the Inbox to a view. */
export async function turnTo(page: Page, view: 'Inbox' | 'Answered' | 'Sent'): Promise<void> {
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: view }).click();
}

/** Send a request straight through sync as the page's person. Returns its id. */
export async function sendRequest(
  page: Page,
  spaceId: string,
  toId: string,
  title: string,
  extra: { note?: string; askedDay?: string | null } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'request.send',
          payload: {
            id,
            spaceId,
            toId,
            title,
            askedDay: extra.askedDay ?? '2026-10-20',
            ...(extra.note ? { note: extra.note } : {}),
          },
          at: new Date().toISOString(),
        },
      ],
    },
  });
  expect(res.status()).toBe(200);
  return id;
}

/** The Inbox button's count across every space, as a number (0 when none shows). Its label carries it. */
export async function inboxPip(page: Page): Promise<number> {
  const el = inboxButton(page);
  if (!(await el.count())) return 0;
  const label = (await el.getAttribute('aria-label')) ?? '';
  const m = /(\d+)/.exec(label);
  return m ? Number(m[1]) : 0;
}
