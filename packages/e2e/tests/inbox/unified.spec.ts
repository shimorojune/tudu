import type { Browser, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import { goInbox, inboxButton, inboxPip, pane, rows, section, sendRequest } from '../../fixtures/inbox';
import {
  createSpace,
  joinLink,
  me,
  openSwitcher,
  secondPerson,
  seedTasks,
  switcher,
} from '../../fixtures/spaces';
import { fixClock, idle, SUNDAY } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';
const desk = () => !phone() && !tablet();

type Space = { id: string; slug: string; name: string };

/**
 * You (`page`) and Meera (`b`) in two team spaces: Northwind is yours, Pilot Farm is Meera's. You end up on your
 * Personal Today, so nothing about the Inbox depends on which space is open.
 */
async function world(page: Page, browser: Browser) {
  const aEmail = await signInFresh(page);
  const b = await secondPerson(browser);
  await fixClock(b.page, new Date(SUNDAY.getTime() - 60_000));
  const nwSlug = await createSpace(page, 'Northwind', [b.email]);
  await b.page.goto(await joinLink(page, b.email));
  await b.page.getByRole('button', { name: 'Join Northwind' }).click();
  await expect(b.page).toHaveURL(new RegExp(`/${nwSlug}$`), { timeout: 10_000 });
  // Meera's Pilot Farm, with you invited; you join through the API so the Inbox starts clean.
  const pf = await makeSpace(b.page, 'Pilot Farm', [aEmail]);
  await joinOpenInvite(page, 'Pilot Farm');
  const mine = await me(page);
  const nw = mine.spaces.find((s) => s.slug === nwSlug)! as Space;
  await page.goto('/me');
  return { aEmail, aId: mine.userId, bId: (await me(b.page)).userId, b, nw, pf };
}

/** A team space made through the API, with invites. */
async function makeSpace(page: Page, name: string, invites: string[] = []) {
  const res = await page.request.post(`${API_URL}/api/spaces`, { data: { name, color: '#3d5a80', invites } });
  expect(res.status()).toBe(201);
  const out = (await res.json()) as { space: Space };
  return out.space;
}

/** Invite more people to a space; returns the invite ids by email. */
async function inviteTo(page: Page, spaceId: string, emails: string[]): Promise<Record<string, string>> {
  const res = await page.request.post(`${API_URL}/api/spaces/${spaceId}/invites`, { data: { emails } });
  expect(res.status()).toBe(200);
  const out = (await res.json()) as { invites: Array<{ id: string; email: string }> };
  return Object.fromEntries(out.invites.map((i) => [i.email, i.id]));
}

/** Join the open invite to a space from the Inbox's API, as the page's person. */
async function joinOpenInvite(page: Page, spaceName: string) {
  let inviteId: string | undefined;
  await expect
    .poll(async () => {
      const box = (await (await page.request.get(`${API_URL}/api/inbox`)).json()) as {
        toAnswer: Array<{ invite?: { id: string; space: { name: string } } }>;
      };
      inviteId = box.toAnswer.find((i) => i.invite?.space.name === spaceName)?.invite?.id;
      return !!inviteId;
    })
    .toBe(true);
  const res = await page.request.post(`${API_URL}/api/invites/${inviteId}/join`);
  expect(res.status()).toBe(200);
}

/** Comments by the page's person on a task, a second apart. */
async function comment(page: Page, taskId: string, texts: string[]) {
  const at = Date.now();
  const res = await page.request.post(`${API_URL}/api/sync`, {
    data: {
      clientId: 'seed',
      mutations: texts.map((t, i) => ({
        id: crypto.randomUUID(),
        type: 'comment.create',
        payload: { id: crypto.randomUUID(), taskId, html: `<p>${t}</p>` },
        at: new Date(at + i * 1000).toISOString(),
      })),
    },
  });
  expect(res.status()).toBe(200);
}

/** A Northwind request from Meera and a Pilot Farm comment from her on your task: one of each, two spaces. */
async function twoSpaces(page: Page, browser: Browser) {
  const w = await world(page, browser);
  await sendRequest(w.b.page, w.nw.id, w.aId, 'Draft the Q4 plan');
  const ids = await seedTasks(page, w.pf.id, [{ title: 'Order seed potatoes', day: '2026-10-18' }]);
  await comment(w.b.page, ids['Order seed potatoes']!, ['The supplier is closed Monday']);
  // Load the page after both exist: these cases are about what the Inbox shows, not how fast it hears (E29, E31).
  await page.goto('/me');
  return { ...w, taskId: ids['Order seed potatoes']! };
}

const inboxRegion = (page: Page) => page.getByRole('region', { name: 'The Inbox' });
const row = (page: Page, text: string) => inboxRegion(page).locator('.tp-ix').filter({ hasText: text });

/** Hover a row and press one of its actions (Mark as read, Mark as unread, Delete). */
async function rowAction(page: Page, text: string, action: string) {
  const r = row(page, text).first();
  await r.hover();
  await r.getByRole('button', { name: action }).click();
}

/** Open a row in the reading pane (desktop and tablet) or as its own page (phone). */
async function openRow(page: Page, text: string) {
  await row(page, text).first().locator('.tp-ix-head').click();
}

test.describe('the one Inbox', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C08-E24 regression: from Personal, the top bar’s Inbox opens /inbox with a Northwind request and a Pilot Farm comment, each labelled', async ({
    page,
    browser,
  }) => {
    test.skip(!desk(), 'the top bar is the desk’s; phones are C08-E33');
    const w = await twoSpaces(page, browser);
    await expect(switcher(page)).toContainText('Personal');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Inbox/ }),
    ).toHaveCount(0);
    await expect.poll(() => inboxPip(page)).toBe(2);
    await expect(inboxButton(page)).toHaveAttribute('aria-label', 'Inbox, 2 new');
    await goInbox(page);
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(inboxButton(page)).toHaveClass(/tp-on/);
    await expect(rows(section(page, 'To answer'))).toHaveCount(1);
    await expect(row(page, 'Draft the Q4 plan')).toContainText('Northwind');
    await expect(row(page, 'The supplier is closed Monday')).toContainText('Pilot Farm');
    await w.b.context.close();
  });

  test('C08-E25 space filter: Northwind narrows the list and the address; a reload keeps it; All spaces brings everything back', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the same filter on every size');
    const w = await twoSpaces(page, browser);
    await goInbox(page);
    await expect(inboxRegion(page).locator('.tp-ix')).toHaveCount(2);
    await page.getByRole('button', { name: 'Space: all spaces' }).click();
    // The menu takes its name from the pill that opens it.
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /All spaces/ })).toContainText('2');
    await menu.getByRole('menuitem', { name: /Northwind/ }).click();
    await expect(page).toHaveURL(new RegExp(`/inbox\\?space=${w.nw.slug}$`));
    await expect(inboxRegion(page).locator('.tp-ix')).toHaveCount(1);
    await expect(row(page, 'Draft the Q4 plan')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Space: Northwind' })).toBeVisible();
    await expect(inboxRegion(page).locator('.tp-ix')).toHaveCount(1);
    // The pip still counts every space.
    expect(await inboxPip(page)).toBe(2);
    await page.getByRole('button', { name: 'Space: Northwind' }).click();
    await page
      .getByRole('menu')
      .getByRole('menuitem', { name: /All spaces/ })
      .click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(inboxRegion(page).locator('.tp-ix')).toHaveCount(2);
    await w.b.context.close();
  });

  test('C08-E26 opening an unread comment reads it (dot gone, pip −1); Mark as unread from hover brings both back', async ({
    page,
    browser,
  }) => {
    test.skip(!desk(), 'hover actions are the desk’s');
    const w = await twoSpaces(page, browser);
    await goInbox(page);
    await expect.poll(() => inboxPip(page)).toBe(2);
    const c = row(page, 'The supplier is closed Monday');
    await expect(c.locator('.tp-ix-dot')).toHaveCount(1);
    await expect(c).toHaveClass(/tp-unread/);
    await openRow(page, 'The supplier is closed Monday');
    await expect(pane(page)).toContainText('The supplier is closed Monday');
    await expect(c.locator('.tp-ix-dot')).toHaveCount(0);
    await expect.poll(() => inboxPip(page)).toBe(1);
    await rowAction(page, 'The supplier is closed Monday', 'Mark as unread');
    await expect(c.locator('.tp-ix-dot')).toHaveCount(1);
    await expect.poll(() => inboxPip(page)).toBe(2);
    // Back on the list (the open item would be read again), it is still unread.
    await idle(page);
    await page.goto('/inbox');
    await expect(row(page, 'The supplier is closed Monday').locator('.tp-ix-dot')).toHaveCount(1);
    await w.b.context.close();
  });

  test('C08-E27 Delete from hover: the row goes and stays gone after a reload; a waiting request has no Delete', async ({
    page,
    browser,
  }) => {
    test.skip(!desk(), 'hover actions are the desk’s; phones swipe (C08-E33)');
    const w = await twoSpaces(page, browser);
    await goInbox(page);
    await rowAction(page, 'The supplier is closed Monday', 'Delete');
    await expect(page.locator('.tp-toast').filter({ hasText: 'Deleted.' })).toBeVisible();
    await expect(row(page, 'The supplier is closed Monday')).toHaveCount(0);
    await expect.poll(() => inboxPip(page)).toBe(1);
    const req = row(page, 'Draft the Q4 plan');
    await req.hover();
    await expect(req.getByRole('button', { name: 'Mark as read' })).toBeVisible();
    await expect(req.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await idle(page);
    await page.reload();
    await expect(row(page, 'Draft the Q4 plan')).toBeVisible();
    await expect(row(page, 'The supplier is closed Monday')).toHaveCount(0);
    await w.b.context.close();
  });

  test('C08-E28 Clear all with 3 updates: "3 updates deleted", Undo brings them back; cleared again they stay gone and requests stay', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the same section on every size');
    const w = await twoSpaces(page, browser);
    await comment(w.b.page, w.taskId, ['Second note', 'Third note']);
    await goInbox(page);
    await expect(rows(section(page, 'Updates'))).toHaveCount(3);
    await section(page, 'Updates').getByRole('button', { name: 'Clear all' }).click();
    const toast = page.locator('.tp-toast').filter({ hasText: '3 updates deleted' });
    await expect(toast).toBeVisible();
    await expect(section(page, 'Updates')).toHaveCount(0);
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(rows(section(page, 'Updates'))).toHaveCount(3);
    await section(page, 'Updates').getByRole('button', { name: 'Clear all' }).click();
    await expect(section(page, 'Updates')).toHaveCount(0);
    await idle(page);
    await page.reload();
    await expect(rows(section(page, 'To answer'))).toHaveCount(1);
    await expect(section(page, 'Updates')).toHaveCount(0);
    await expect.poll(() => inboxPip(page)).toBe(1);
    await w.b.context.close();
  });

  test('C08-E29 Meera invites you to a new space: it shows live; Join says so with Open; the invite is gone and the space is in the switcher', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the same Join on every size');
    const w = await world(page, browser);
    await goInbox(page);
    await expect(inboxRegion(page).getByText('All caught up.')).toBeVisible();
    await makeSpace(w.b.page, 'Design Guild', [w.aEmail]);
    // Live: no reload.
    await expect(rows(section(page, 'To answer'))).toHaveCount(1, { timeout: 10_000 });
    await expect.poll(() => inboxPip(page)).toBe(1);
    await openRow(page, 'Design Guild');
    await pane(page).getByRole('button', { name: 'Join Design Guild' }).click();
    const toast = page.locator('.tp-toast').filter({ hasText: 'Joined Design Guild.' });
    await expect(toast).toBeVisible();
    await expect(row(page, 'Design Guild')).toHaveCount(0);
    await expect.poll(() => inboxPip(page)).toBe(0);
    await toast.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/design-guild(-\d+)?$/);
    await expect(switcher(page)).toContainText('Design Guild');
    const menu = await openSwitcher(page);
    await expect(menu.getByRole('menuitemradio', { name: /Design Guild/ })).toBeVisible();
    await w.b.context.close();
  });

  test('C08-E30 Join on a taken-back invite: "That invite has ended." with Remove; Not now on another hides it and the email link still works', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the same Join on every size');
    const w = await world(page, browser);
    const guild = await makeSpace(w.b.page, 'Design Guild');
    const studio = await makeSpace(w.b.page, 'Studio');
    const inv = await inviteTo(w.b.page, guild.id, [w.aEmail]);
    await inviteTo(w.b.page, studio.id, [w.aEmail]);
    await goInbox(page);
    await expect(rows(section(page, 'To answer'))).toHaveCount(2);
    await openRow(page, 'Design Guild');
    await expect(pane(page).getByRole('button', { name: 'Join Design Guild' })).toBeVisible();
    // Meera takes it back while you read it.
    const res = await w.b.page.request.delete(`${API_URL}/api/invites/${inv[w.aEmail]}`);
    expect(res.status()).toBe(204);
    await pane(page).getByRole('button', { name: 'Join Design Guild' }).click();
    const banner = inboxRegion(page).locator('.app-ix-banner').filter({ hasText: 'That invite has ended.' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Remove' }).click();
    await expect(banner).toHaveCount(0);
    await expect(row(page, 'Design Guild')).toHaveCount(0);

    await openRow(page, 'Studio');
    await pane(page).getByRole('button', { name: 'Not now' }).click();
    await expect(
      page.locator('.tp-toast').filter({ hasText: 'Put away. The email’s link still works.' }),
    ).toBeVisible();
    await expect(row(page, 'Studio')).toHaveCount(0);
    await idle(page);
    await page.goto(await joinLink(page, w.aEmail));
    await expect(page.getByRole('button', { name: 'Join Studio' })).toBeVisible();
    await w.b.context.close();
  });

  test('C08-E31 Meera removes you from Pilot Farm: the notice shows live, Pilot Farm leaves the switcher; the notice deletes', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the same notice on every size');
    const w = await world(page, browser);
    await goInbox(page);
    const res = await w.b.page.request.delete(`${API_URL}/api/spaces/${w.pf.id}/members/${w.aId}`);
    expect(res.status()).toBe(204);
    const notice = row(page, 'Pilot Farm');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toContainText('removed you from');
    const menu = await openSwitcher(page);
    await expect(menu.getByRole('menuitemradio', { name: /Pilot Farm/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openRow(page, 'Pilot Farm');
    await pane(page).getByRole('button', { name: 'Delete' }).click();
    await expect(row(page, 'Pilot Farm')).toHaveCount(0);
    await idle(page);
    await page.reload();
    await expect(row(page, 'Pilot Farm')).toHaveCount(0);
    await w.b.context.close();
  });

  test('C08-E32 old links: /northwind/inbox lands on /inbox?space=northwind; /me/inbox lands on /inbox', async ({
    page,
  }) => {
    test.skip(!desk(), 'addresses are the same on every size');
    await signInFresh(page);
    const slug = await createSpace(page, 'Northwind');
    await page.goto(`/${slug}/inbox`);
    await expect(page).toHaveURL(new RegExp(`/inbox\\?space=${slug}$`));
    await expect(page.getByRole('button', { name: 'Space: Northwind' })).toBeVisible();
    await page.goto(`/${slug}/inbox?view=sent`);
    await expect(page).toHaveURL(new RegExp(`/inbox\\?space=${slug}&view=sent$`));
    await page.goto('/me/inbox');
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(inboxRegion(page)).toBeVisible();
  });

  test('C08-E33 phone: the header’s inbox icon opens the Inbox with the total; swiping a comment left deletes it; More has no Inbox', async ({
    page,
    browser,
  }) => {
    test.skip(!phone(), 'phones only');
    const w = await twoSpaces(page, browser);
    const icon = page.locator('.app-phone-inbox');
    await expect(icon).toHaveAttribute('aria-label', 'Inbox, 2 new');
    await icon.click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(inboxRegion(page).locator('.tp-ix')).toHaveCount(2);
    // Swipe the comment left, past 40% of its width.
    const head = row(page, 'The supplier is closed Monday').locator('.tp-ix-head');
    const box = (await head.boundingBox())!;
    const y = box.y + box.height / 2;
    const at = (x: number) => ({
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      clientX: x,
      clientY: y,
    });
    await head.dispatchEvent('pointerdown', at(box.x + box.width - 20));
    for (const f of [0.9, 0.7, 0.5, 0.3]) await head.dispatchEvent('pointermove', at(box.x + box.width * f));
    await head.dispatchEvent('pointerup', at(box.x + box.width * 0.3));
    await expect(row(page, 'The supplier is closed Monday')).toHaveCount(0);
    await expect(icon).toHaveAttribute('aria-label', 'Inbox, 1 new');
    // A request can't be swiped away.
    await expect(row(page, 'Draft the Q4 plan').locator('.tp-ix-swipe')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
    await expect(
      page.getByRole('navigation', { name: 'More' }).getByRole('button', { name: /^Inbox/ }),
    ).toHaveCount(0);
    await w.b.context.close();
  });

  test('C08-E34 errors: a failed load shows the banner and Try again recovers; offline shows the warning', async ({
    page,
  }) => {
    test.skip(phone(), 'the same banners on every size');
    await signInFresh(page);
    await page.route('**/api/inbox**', (r) => r.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await goInbox(page);
    const banner = inboxRegion(page).locator('.app-ix-banner');
    await expect(banner).toContainText('Couldn’t load your Inbox.', { timeout: 15_000 });
    await page.unroute('**/api/inbox**');
    await banner.getByRole('button', { name: 'Try again' }).click();
    await expect(inboxRegion(page).getByText('All caught up.')).toBeVisible();
    await page.context().setOffline(true);
    // Over the sheet, like Today's.
    await expect(page.getByText('You’re offline.')).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText('You’re offline.')).toHaveCount(0);
  });

  test('C08-E35 dark: new rows use the ink wash and dot, read rows are muted, and nothing uses the brand red', async ({
    page,
    browser,
  }) => {
    test.skip(!desk(), 'one size is enough for the colours');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
    });
    const w = await twoSpaces(page, browser);
    await comment(w.b.page, w.taskId, ['Second note']);
    await goInbox(page);
    await rowAction(page, 'Second note', 'Mark as read');
    await page.mouse.move(0, 0);
    const look = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('div');
      document.body.append(probe);
      const resolve = (v: string) => {
        probe.style.color = v;
        return getComputedStyle(probe).color;
      };
      const brand = [
        resolve(root.getPropertyValue('--selection')),
        resolve(root.getPropertyValue('--primary')),
      ];
      const rows = [...document.querySelectorAll<HTMLElement>('.tp-ix-list')].map((r) => {
        const head = r.querySelector<HTMLElement>('.tp-ix-head')!;
        const dot = r.querySelector<HTMLElement>('.tp-ix-dot');
        return {
          text: r.textContent ?? '',
          unread: r.classList.contains('tp-unread'),
          bg: getComputedStyle(head).backgroundColor,
          dot: dot ? getComputedStyle(dot).backgroundColor : null,
          fg: getComputedStyle(document.body).color,
        };
      });
      probe.remove();
      return { theme: document.documentElement.dataset.theme ?? '', brand, rows };
    });
    const unread = look.rows.filter((r) => r.unread);
    const read = look.rows.filter((r) => !r.unread);
    expect(unread.length).toBeGreaterThan(0);
    expect(read.length).toBeGreaterThan(0);
    for (const r of look.rows) {
      expect(look.brand).not.toContain(r.bg);
      if (r.dot) expect(look.brand).not.toContain(r.dot);
    }
    // New rows carry a wash over the card; read rows don't.
    expect(new Set(unread.map((r) => r.bg)).size).toBe(1);
    expect(unread[0]!.bg).not.toBe(read[0]!.bg);
    await expect(row(page, 'Second note').locator('.tp-ix-dot')).toHaveCount(0);
    await w.b.context.close();
  });
});
