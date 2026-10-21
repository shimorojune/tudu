import { expect, type Locator, type Page } from '@playwright/test';
import { API_URL } from './app';

/** Go to the Inbox: the sidebar or the rail, or the header's icon on phones. */
export async function goInbox(page: Page): Promise<void> {
  const icon = page.getByRole('button', { name: /^Inbox(,| |$)/ }).filter({ has: page.locator('svg') });
  const nav = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Inbox(,| |$)/ });
  if (await nav.count()) await nav.first().click();
  else await icon.first().click();
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

/** The sidebar's or rail's Inbox count, as a number (0 when none shows). */
export async function sidebarInboxCount(page: Page): Promise<number> {
  const nav = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: /^Inbox/ })
    .first();
  // Phones keep the Inbox behind the header's icon, whose label carries the count.
  const icon = page.locator('.app-phone-inbox');
  const el = (await nav.count()) ? nav : (await icon.count()) ? icon : null;
  if (!el) return 0;
  const label = (await el.getAttribute('aria-label')) ?? (await el.textContent()) ?? '';
  const m = /(\d+)/.exec(label.replace('Inbox', ''));
  return m ? Number(m[1]) : 0;
}
