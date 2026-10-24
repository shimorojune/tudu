import type { Page } from '@playwright/test';
import { API_URL, expect, freshEmail, signInFresh, test } from '../../fixtures/app';
import {
  createSpace,
  goPeople,
  joinLink,
  me,
  openSwitcher,
  peopleList,
  secondPerson,
  seedTasks,
  switchTo,
  switcher,
} from '../../fixtures/spaces';
import { expectSheetWidth } from '../../fixtures/layout';
import { dayList, fixClock, idle, titlesOf, writeTasks } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** Two people in one fresh team space: `a` made it on `page`, `b` joined in a second browser. */
async function team(page: Page, browser: Parameters<typeof secondPerson>[0]) {
  await signInFresh(page);
  const b = await secondPerson(browser);
  const slug = await createSpace(page, 'Northwind', [b.email]);
  await b.page.goto(await joinLink(page, b.email));
  await b.page.getByRole('button', { name: 'Join Northwind' }).click();
  await expect(b.page).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
  const mine = await me(page);
  const space = mine.spaces.find((s) => s.slug === slug)!;
  return { slug, space, b, aId: mine.userId, bId: (await me(b.page)).userId };
}

test.describe('spaces', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C08-E01 create a space from the switcher: name, colour, Create; Today with the welcome; both in the list with the tick', async ({
    page,
  }) => {
    await signInFresh(page);
    await expect(page).toHaveURL(/\/me$/);
    await expect(switcher(page)).toContainText('Personal');
    const menu = await openSwitcher(page);
    await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
    await menu.getByRole('menuitem', { name: 'Create a space' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create a space' });
    await expect(dialog.getByRole('button', { name: 'Create space' })).toBeDisabled();
    await dialog.getByLabel('Space name').fill('Northwind');
    await expect(dialog.locator('.tp-cs-tile')).toHaveText('N');
    await dialog.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio').nth(4).click();
    await expect(dialog.locator('.tp-cs-tile')).toHaveCSS('background-color', 'rgb(160, 97, 61)');
    await dialog.getByRole('button', { name: 'Create space' }).click();
    await expect(page).toHaveURL(/\/northwind(-\d+)?$/, { timeout: 10_000 });
    await expect(page.locator('.tp-toast')).toContainText('Northwind is ready.');
    await expect(heading(page)).toHaveText('Sunday');
    await expect(page.getByText('Welcome to Northwind.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite people' })).toBeVisible();
    await expect(switcher(page)).toContainText('Northwind');
    const again = await openSwitcher(page);
    const items = again.getByRole('menuitemradio');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Personal');
    await expect(items.nth(1)).toContainText('Northwind');
    await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(items.nth(1).locator('.tp-sswl-ok')).toBeVisible();
    await expect(items.nth(1)).toContainText('Just you');
    await page.keyboard.press('Escape');
    await expect(again).toBeHidden();
  });

  test('C08-E02 switch: tasks stay with their space, the view is kept, the address names the space, a reload and / come back', async ({
    page,
  }) => {
    await signInFresh(page);
    await writeTasks(page, ['Pay the electricity bill']);
    const slug = await createSpace(page, 'Northwind');
    const { spaces } = await me(page);
    const nw = spaces.find((s) => s.slug === slug)!;
    await seedTasks(page, nw.id, [{ title: 'Plan the offsite', day: '2026-10-18' }]);
    await page.reload();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Plan the offsite']);
    // the prefix on the byline
    await expect(dayList(page).locator('.tp-sg-id')).toHaveText(['NW-1']);
    // switching keeps the view: Week stays Week, and the address names the space
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Week/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/week$`));
    await switchTo(page, 'Personal');
    await expect(page).toHaveURL(/\/me\/week$/);
    await expect(heading(page)).toHaveText('12 – 18');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Today/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/me$/);
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Pay the electricity bill']);
    // a reload keeps the space; / comes back to the last one
    await switchTo(page, 'Northwind');
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Plan the offsite']);
    await page.goto('/');
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    // an old address goes to the same view in the last space; a stranger's slug goes home
    await page.goto('/backlog');
    await expect(page).toHaveURL(new RegExp(`/${slug}/backlog$`));
    await page.goto('/nobody-here');
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  });

  test('C08-E03 invite and join: the pending row, the join link in a second browser, Sign in to join, Northwind’s Today, the member list', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the join flow is the same on every size');
    await signInFresh(page);
    const slug = await createSpace(page, 'Northwind');
    await page.getByRole('button', { name: 'Invite people' }).click();
    const card = page.getByRole('dialog', { name: 'Members' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveCount(1);
    await expect(card.getByText('No invites waiting.')).toBeVisible();
    const other = freshEmail('invitee');
    await card.getByLabel('Invite by email').fill(other);
    await card.getByLabel('Invite by email').press('Enter');
    await card.getByRole('button', { name: 'Invite', exact: true }).click();
    const invited = card.getByRole('list', { name: 'Invited' }).getByRole('listitem');
    await expect(invited).toHaveCount(1);
    await expect(invited.first()).toContainText(other);
    await expect(invited.first()).toContainText('Invited');
    await expect(page.locator('.tp-toast')).toContainText(`Invite sent to ${other}.`);
    // the newcomer, in their own browser, not signed in yet
    const link = await joinLink(page, other);
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const b = await context.newPage();
    await b.goto(link);
    await expect(b.getByRole('heading', { name: 'Join Northwind' })).toBeVisible();
    await expect(b.getByText('You’re invited')).toBeVisible();
    await expect(b.getByText(/invited you to Northwind/)).toBeVisible();
    const email = b.getByLabel('Email');
    await expect(email).toHaveValue(other);
    await expect(email).toHaveAttribute('readonly');
    await b.getByRole('button', { name: 'Sign in to join' }).click();
    await expect(b.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const code = await (async () => {
      for (let i = 0; i < 40; i++) {
        const res = await b.request.get(`${API_URL}/__test/outbox/code?to=${encodeURIComponent(other)}`);
        const { code } = (await res.json()) as { code: string | null };
        if (code) return code;
        await b.waitForTimeout(100);
      }
      throw new Error('no code');
    })();
    await b.getByLabel('The 6-digit code').fill(code);
    await expect(b.getByText('You’re in. Opening Northwind…')).toBeVisible();
    await expect(b).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
    await expect(switcher(b)).toContainText('Northwind');
    await expect(
      b.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
    ).toBeVisible();
    // the member list on the first browser refreshes live: two members, nothing pending
    await expect(card.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveCount(2);
    await expect(card.getByText('No invites waiting.')).toBeVisible();
    await expect(card.getByRole('list', { name: 'Members' })).toContainText(other);
    await context.close();
  });

  test('C08-E04 a cancelled invite’s link says so; inviting someone already in the space is told so', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same card on every size');
    await signInFresh(page);
    await createSpace(page, 'Northwind');
    await page.getByRole('button', { name: 'Invite people' }).click();
    const card = page.getByRole('dialog', { name: 'Members' });
    const other = freshEmail('invitee');
    await card.getByLabel('Invite by email').fill(other);
    await card.getByLabel('Invite by email').press('Enter');
    await card.getByRole('button', { name: 'Invite', exact: true }).click();
    const invited = card.getByRole('list', { name: 'Invited' }).getByRole('listitem');
    await expect(invited).toHaveCount(1);
    const link = await joinLink(page, other);
    await card.getByRole('button', { name: `Cancel the invite to ${other}` }).click();
    await expect(page.locator('.tp-toast')).toContainText(`Invite to ${other} cancelled`);
    await expect(card.getByText('No invites waiting.')).toBeVisible();
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const b = await context.newPage();
    await b.goto(link);
    await expect(b.getByRole('heading', { name: 'This invite was taken back' })).toBeVisible();
    await expect(b.getByRole('button', { name: 'Sign in to join' })).toHaveCount(0);
    // Undo brings the invite back and the link works again
    await page.locator('.tp-toast').getByRole('button', { name: 'Undo' }).click();
    await expect(invited).toHaveCount(1);
    await b.reload();
    await expect(b.getByRole('heading', { name: 'Join Northwind' })).toBeVisible();
    await context.close();
    // someone already in the space (you) is told so, and nothing is sent
    const { spaces } = await me(page);
    const mine = (await (await page.request.get(`${API_URL}/api/me`)).json()) as { user: { email: string } };
    await card.getByLabel('Invite by email').fill(mine.user.email);
    await card.getByLabel('Invite by email').press('Enter');
    await card.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(page.locator('.tp-toast')).toContainText(`${mine.user.email} is already in Northwind.`);
    await expect(invited).toHaveCount(1);
    expect(spaces.some((s) => s.name === 'Northwind')).toBe(true);
  });

  test('C08-E05 People: both members’ tasks by day and by person with counts, This week and Today, a person’s days, Find someone', async ({
    page,
    browser,
  }) => {
    const { space, b } = await team(page, browser);
    await seedTasks(page, space.id, [
      { title: 'Plan the offsite', day: '2026-10-18' },
      { title: 'Draft the Q4 hiring plan', day: '2026-10-16' },
      { title: 'A Backlog thought', day: null },
    ]);
    await seedTasks(b.page, space.id, [{ title: 'Write the onboarding copy', day: '2026-10-18' }]);
    await goPeople(page);
    const list = peopleList(page);
    await expect(list.getByRole('listitem', { name: 'Everyone' })).toContainText('3 shared this week');
    await expect(page.getByText(`2 in Northwind`)).toBeVisible();
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('You');
    await expect(rows.nth(1).locator('.tp-ml-c')).toHaveText('2');
    await expect(rows.nth(2)).toContainText(b.email);
    await expect(rows.nth(2).locator('.tp-ml-c')).toHaveText('1');
    if (phone()) {
      // the list is the page; Everyone is not a pane here
      await rows.nth(2).click();
      await expect(page.getByRole('heading', { level: 1, name: b.email })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Today · Sunday' })).toContainText(
        'Write the onboarding copy',
      );
      await expect(page.getByRole('region', { name: 'Fri 16 Oct' })).toContainText('Nothing shared');
      await page.getByRole('button', { name: 'People' }).click();
      await expect(list).toBeVisible();
    } else {
      // Everyone, this week by day
      await expect(page.getByRole('heading', { level: 1, name: 'Everyone' })).toBeVisible();
      const byDay = page.getByRole('region', { name: 'Shared' });
      await expect(byDay.getByRole('region')).toHaveCount(2);
      await expect(byDay.getByRole('region', { name: 'Fri 16 Oct' })).toContainText(
        'Draft the Q4 hiring plan',
      );
      const today = byDay.getByRole('region', { name: 'Today · Sun 18 Oct' });
      await expect(today.locator('.tp-tl')).toHaveCount(2);
      await expect(today.locator('.tp-tl-who').nth(1)).toContainText(b.email.split('@')[0]!.split(/[-]/)[0]!);
      // Today only
      await page.getByRole('group', { name: 'Range' }).getByRole('button', { name: 'Today' }).click();
      await expect(byDay.getByRole('region')).toHaveCount(1);
      // by person
      await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'By person' }).click();
      await expect(byDay.locator('.tp-prow')).toHaveCount(2);
      await expect(byDay.locator('.tp-prow').first()).toContainText('You');
      await expect(byDay.locator('.tp-prow').first().locator('.tp-prow-c')).toHaveText('0 of 1 done');
      // one person: the list stays, only the pane turns
      await rows.nth(2).click();
      await expect(page).toHaveURL(/\/people\/[A-Za-z0-9]+$/);
      await expect(page.getByRole('heading', { level: 1, name: b.email })).toBeVisible();
      await expect(list).toBeVisible();
      await expect(page.getByRole('region', { name: 'Today · Sunday' })).toContainText(
        'Write the onboarding copy',
      );
      await expect(page.getByRole('region', { name: 'Mon 12 Oct' })).toContainText('Nothing shared');
      await expect(rows.nth(2)).toHaveClass(/tp-on/);
    }
    // Find someone narrows the list by email and empties
    const find = page.getByRole('searchbox', { name: 'Find someone' });
    await find.fill(b.email.slice(0, 8));
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByRole('listitem', { name: 'Everyone' })).toHaveCount(0);
    await find.fill('zzzz');
    await expect(list.getByText(`No one called “zzzz” in Northwind.`)).toBeVisible();
    await find.press('Escape');
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await b.context.close();
  });

  test('C08-E06 read-only: a colleague’s task opens to read and comment, nothing editable; they see the comment; Only me is absent', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the panel is the same page on phones; the desk and tablet cover it');
    const { space, b } = await team(page, browser);
    const ids = await seedTasks(b.page, space.id, [
      { title: 'Write the onboarding copy', day: '2026-10-18' },
      { title: 'A private thought', day: '2026-10-18', visibility: 'me' },
    ]);
    await goPeople(page);
    const shared = page.getByRole('region', { name: 'Shared' });
    await expect(shared.locator('.tp-tl')).toHaveCount(1);
    await expect(shared.getByText('A private thought')).toHaveCount(0);
    await shared.getByRole('button', { name: 'Write the onboarding copy' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/\?task=NW-1$/);
    await expect(panel.locator('.tp-td')).toHaveClass(/tp-td-readonly/);
    await expect(panel.locator('.tp-td-owner')).toContainText('Today · Sun 18 Oct');
    await expect(panel.getByRole('heading', { name: 'Write the onboarding copy' })).toBeVisible();
    await expect(panel.getByRole('textbox', { name: 'Task title' })).toHaveCount(0);
    await expect(
      panel.getByRole('checkbox', { name: 'Cross off: Write the onboarding copy' }),
    ).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Planned' })).toHaveCount(0);
    await expect(panel.getByLabel('Visible to')).toContainText('Everyone in Northwind');
    await expect(panel.getByRole('textbox', { name: 'Notes' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'More' }).click();
    await expect(
      page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: 'Delete task' }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    // a comment is the one write
    const box = panel.getByRole('textbox', { name: 'Write a comment' });
    await box.click();
    await box.pressSequentially('Can I take the second half?');
    await panel.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(panel.locator('.tp-td-cmt')).toHaveCount(1);
    await idle(page);
    const theirs = (await (
      await b.page.request.get(`${API_URL}/api/spaces/${space.id}/tasks/${ids['Write the onboarding copy']}`)
    ).json()) as { comments: Array<{ html: string }> };
    expect(theirs.comments).toHaveLength(1);
    expect(theirs.comments[0]!.html).toContain('Can I take the second half?');
    // the Only-me task is not even reachable
    const hidden = await page.request.get(
      `${API_URL}/api/spaces/${space.id}/tasks/${ids['A private thought']}`,
    );
    expect(hidden.status()).toBe(404);
    await b.context.close();
  });

  test('C08-E07 Visible to: Only me on a task hides it from a colleague’s People; back to Everyone shows it', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same fact on every size');
    const { space, b } = await team(page, browser);
    await seedTasks(page, space.id, [{ title: 'Plan the offsite', day: '2026-10-18' }]);
    await page.reload();
    await goPeople(b.page);
    const shared = b.page.getByRole('region', { name: 'Shared' });
    await expect(shared.getByText('Plan the offsite')).toBeVisible();
    // on the first browser: open the task on Today and mark it Only me
    await page.getByRole('button', { name: 'Plan the offsite' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    const vis = panel.getByRole('button', { name: 'Visible to' });
    await expect(vis).toHaveText('Everyone in Northwind');
    await vis.click();
    await page
      .getByRole('menu', { name: 'Who can see this task' })
      .getByRole('menuitem', { name: 'Only you' })
      .click();
    await expect(vis).toHaveText('Only you');
    await idle(page);
    await expect(shared.getByText('Plan the offsite')).toBeHidden();
    await expect(b.page.getByText('Nothing shared this week.')).toBeVisible();
    await vis.click();
    await page
      .getByRole('menu', { name: 'Who can see this task' })
      .getByRole('menuitem', { name: 'Everyone in Northwind' })
      .click();
    await idle(page);
    await expect(shared.getByText('Plan the offsite')).toBeVisible();
    await b.context.close();
  });

  test('C08-E08 phone: the name in the header opens the sheet and switches; More › People, a person pushes in and ‹ People back (phone)', async ({
    page,
    browser,
  }) => {
    test.skip(!phone(), 'phone only');
    const { slug, space, b } = await team(page, browser);
    await seedTasks(b.page, space.id, [{ title: 'Write the onboarding copy', day: '2026-10-18' }]);
    await switcher(page).click();
    const sheet = page.getByRole('dialog', { name: 'Spaces' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('menuitemradio')).toHaveCount(2);
    await sheet.getByRole('menuitemradio', { name: /Personal/ }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(switcher(page)).toContainText('Personal');
    await switchTo(page, 'Northwind');
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await goPeople(page);
    await expect(page).toHaveURL(new RegExp(`/${slug}/people$`));
    await peopleList(page).getByRole('listitem', { name: b.email }).click();
    await expect(page).toHaveURL(/\/people\/[A-Za-z0-9]+$/);
    await expect(page.getByRole('heading', { level: 1, name: b.email })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Today · Sunday' })).toContainText(
      'Write the onboarding copy',
    );
    await page.getByRole('button', { name: 'People' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/people$`));
    await expect(peopleList(page)).toBeVisible();
    await b.context.close();
  });

  test('C08-E09 tablet: the rail’s tile opens the switcher; People from the rail (tablet)', async ({
    page,
  }) => {
    test.skip(!tablet(), 'tablet only');
    await signInFresh(page);
    const slug = await createSpace(page, 'Northwind');
    const tile = page.getByRole('button', { name: 'Space: Northwind' });
    await expect(tile).toBeVisible();
    await expect(tile.locator('.tp-ssw-name')).toBeHidden();
    await tile.click();
    const menu = page.getByRole('menu', { name: 'Spaces' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /Personal/ }).click();
    await expect(page).toHaveURL(/\/me$/);
    await page.getByRole('button', { name: 'Space: Personal' }).click();
    await menu.getByRole('menuitemradio', { name: /Northwind/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'People' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/people$`));
    await expect(page.getByRole('region', { name: 'People' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Everyone' })).toBeVisible();
  });

  test('C08-E22 width: on the desk People is 1120px and centred with Everyone and with a person; wide and narrower windows too', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the desk only; tablet and phone columns are narrower');
    const { b } = await team(page, browser);
    await goPeople(page);
    await expect(peopleList(page).getByRole('listitem')).toHaveCount(3);
    await expectSheetWidth(page, 1120);
    // picking someone turns only the right side; the sheet keeps its width
    await peopleList(page).getByRole('listitem').nth(2).click();
    await expect(page.getByRole('heading', { name: b.email }).first()).toBeVisible();
    await expectSheetWidth(page, 1120);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expectSheetWidth(page, 1120);
    await page.setViewportSize({ width: 1100, height: 800 });
    await expectSheetWidth(page, 1120);
    await b.context.close();
  });
});
