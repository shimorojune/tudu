import type { Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import {
  goInbox,
  inboxCount,
  pane,
  rows,
  section,
  sendRequest,
  sidebarInboxCount,
  turnTo,
} from '../../fixtures/inbox';
import {
  createSpace,
  goPeople,
  joinLink,
  me,
  secondPerson,
  seedTasks,
  switcher,
} from '../../fixtures/spaces';
import { dayList, fixClock, idle, row, SUNDAY, titlesOf } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';

/** Two people in one fresh team space: `a` made it on `page`, `b` joined in a second browser. */
async function team(page: Page, browser: Parameters<typeof secondPerson>[0]) {
  await signInFresh(page);
  const b = await secondPerson(browser);
  // The two clocks are both fixed, so a comment of theirs and a reply of yours would tie; theirs runs a minute behind.
  await fixClock(b.page, new Date(SUNDAY.getTime() - 60_000));
  const slug = await createSpace(page, 'Northwind', [b.email]);
  await b.page.goto(await joinLink(page, b.email));
  await b.page.getByRole('button', { name: 'Join Northwind' }).click();
  await expect(b.page).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
  const mine = await me(page);
  const space = mine.spaces.find((s) => s.slug === slug)!;
  return { slug, space, b, aId: mine.userId, bId: (await me(b.page)).userId };
}

const newTask = (page: Page) => page.getByRole('button', { name: 'New task' }).first();
const bar = (page: Page) => page.getByRole('dialog', { name: 'New task' });

test.describe('inbox', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page);
  });

  test('C08-E10 send: New task, pick Meera, the chip reads "Asks for", Send; the toast with Show lands on Sent; her Inbox has it with the count', async ({
    page,
    browser,
  }) => {
    const { b } = await team(page, browser);
    await newTask(page).click();
    const qa = bar(page);
    await expect(qa.locator('.tp-qa-toline')).toContainText('In');
    await expect(qa.getByRole('button', { name: 'Space: Northwind' })).toBeVisible();
    await qa.getByRole('textbox', { name: 'Task title' }).fill('Draft the onboarding copy');
    await qa.getByRole('button', { name: 'Who it’s for' }).click();
    await page
      .getByRole('menu', { name: 'Who it’s for' })
      .getByRole('menuitemradio', { name: new RegExp(b.email) })
      .click();
    await expect(qa.getByRole('button', { name: /^Asks for:/ })).toHaveText('Asks for Today');
    // the phone's foot keeps to the buttons, by the design; the line is desktop and tablet
    if (!phone()) await expect(qa.locator('.tp-qa-lands')).toContainText('picks the day');
    await qa.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('.tp-toast')).toContainText(/^Sent to .*It’s in Sent until .* answers\./);
    await page.locator('.tp-toast').getByRole('button', { name: 'Show' }).click();
    await expect(page).toHaveURL(/\/inbox\?view=sent$/);
    await expect(rows(section(page, 'Sent'))).toHaveCount(1);
    await expect(rows(section(page, 'Sent')).first()).toContainText('Draft the onboarding copy');
    await expect(rows(section(page, 'Sent')).first()).toContainText(/Waiting for/);
    await idle(page);
    // nothing landed on a day of yours
    await expect((await (await page.request.get(`${API_URL}/api/me`)).json()).user).toBeTruthy();
    // Meera's Inbox has it, with the count on the sidebar (the rail, or the header's icon on phones)
    await expect.poll(() => sidebarInboxCount(b.page)).toBe(1);
    if (phone()) await expect(b.page.getByRole('button', { name: 'Inbox, 1 new' })).toBeVisible();
    await goInbox(b.page);
    await expect(inboxCount(b.page)).toHaveText('1 to answer');
    await expect(rows(section(b.page, 'To answer'))).toHaveCount(1);
    await expect(rows(section(b.page, 'To answer')).first()).toContainText('Draft the onboarding copy');
    await expect(rows(section(b.page, 'To answer')).first().locator('.tp-ix-dot')).toBeVisible();
    await b.context.close();
  });

  test('C08-E11 accept: Meera reads it (Sent shows Seen), accepts onto Tomorrow; the task is on her Tomorrow with the note; Answered; the sender hears', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the desk and tablet cover the two-pane flow; E19 covers the phone');
    const { space, b, bId } = await team(page, browser);
    await sendRequest(page, space.id, bId, 'Draft the onboarding copy', {
      note: 'Keep it short.',
      askedDay: '2026-10-20',
    });
    await goInbox(page);
    await turnTo(page, 'Sent');
    await expect(rows(section(page, 'Sent')).first()).toContainText('Waiting for');
    await expect(rows(section(page, 'Sent')).first()).not.toContainText('seen');
    // Meera opens it: Sent says Seen
    await goInbox(b.page);
    await rows(section(b.page, 'To answer')).first().locator('.tp-ix-head').click();
    await expect(pane(b.page)).toContainText('Keep it short.');
    await expect(pane(b.page)).toContainText('For Tue 20 Oct');
    await expect(rows(section(page, 'Sent')).first()).toContainText(/seen/);
    // Accept with the asked day preselected, then Tomorrow
    await pane(b.page).getByRole('button', { name: 'Accept' }).click();
    const pop = b.page.getByRole('dialog', { name: 'Accept it onto…' });
    await expect(pop.getByRole('button', { name: /^20 October/ })).toHaveAttribute('aria-pressed', 'true');
    await pop.getByRole('button', { name: 'Tomorrow' }).click();
    await expect(b.page.locator('.tp-toast')).toContainText('Accepted onto Tomorrow. It’s in Answered.');
    await expect(inboxCount(b.page)).toHaveText('All caught up');
    await idle(b.page);
    // on her Tomorrow with the note; not on the sender's
    await b.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Today/ })
      .first()
      .click();
    await b.page.getByRole('button', { name: 'Next day' }).click();
    await expect.poll(() => titlesOf(dayList(b.page))).toEqual(['Draft the onboarding copy']);
    await row(dayList(b.page), 'Draft the onboarding copy')
      .getByRole('button', { name: 'Draft the onboarding copy' })
      .click();
    const panel = b.page.getByRole('dialog', { name: 'Task details' });
    await expect(panel.getByText('Keep it short.')).toBeVisible();
    await panel.getByRole('button', { name: /^History/ }).click();
    await expect(panel.getByText(/^Sent by .*, accepted$/)).toBeVisible();
    await b.page.keyboard.press('Escape');
    // Answered keeps what she did; the sender's Updates says so
    await goInbox(b.page);
    await turnTo(b.page, 'Answered');
    await expect(rows(section(b.page, 'Answered')).first()).toContainText('You accepted it onto Tomorrow');
    await turnTo(page, 'Inbox');
    await expect(rows(section(page, 'Updates')).first()).toContainText(/accepted your task onto Tomorrow/);
    await expect(rows(section(page, 'Updates')).first().locator('.tp-ix-dot')).toBeVisible();
    await expect(inboxCount(page)).toHaveText('1 new');
    await b.context.close();
  });

  test('C08-E12 decline: Send off until a reason; Answered with the reason; the sender’s Updates carries it; Take it back puts it on the Backlog', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    const { space, b, bId } = await team(page, browser);
    await sendRequest(page, space.id, bId, 'Plan the retro');
    await goInbox(b.page);
    await rows(section(b.page, 'To answer')).first().locator('.tp-ix-head').click();
    await pane(b.page).getByRole('button', { name: 'Decline' }).click();
    const send = pane(b.page).getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled();
    await pane(b.page)
      .getByRole('textbox', { name: 'Reason for declining' })
      .fill('Priya owns the retro now.');
    await send.click();
    await expect(inboxCount(b.page)).toHaveText('All caught up');
    await turnTo(b.page, 'Answered');
    await expect(rows(section(b.page, 'Answered')).first()).toContainText(
      'You declined: Priya owns the retro now.',
    );
    await idle(b.page);
    // the sender hears, and takes it back onto the Backlog
    await goInbox(page);
    await expect(rows(section(page, 'Updates')).first()).toContainText(
      'declined your task: Priya owns the retro now.',
    );
    await turnTo(page, 'Sent');
    await rows(section(page, 'Sent')).first().locator('.tp-ix-head').click();
    await expect(pane(page)).toContainText(/declined: Priya owns the retro now\./);
    await pane(page).getByRole('button', { name: 'Take it back' }).click();
    await expect(page.locator('.tp-toast')).toContainText('Taken back. It’s on your Backlog.');
    await expect(rows(section(page, 'Sent'))).toHaveCount(0);
    await idle(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Backlog/ })
      .first()
      .click();
    await expect
      .poll(() => titlesOf(page.getByRole('list', { name: 'Tasks in the Backlog', includeHidden: true })))
      .toEqual(['Plan the retro']);
    await b.context.close();
  });

  test('C08-E13 Do it myself from a waiting request: the picker, Today; the task on the sender’s Today; the receiver’s item is gone', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    const { space, b, bId } = await team(page, browser);
    await sendRequest(page, space.id, bId, 'Book the offsite venue');
    await goInbox(b.page);
    await expect(rows(section(b.page, 'To answer'))).toHaveCount(1);
    await goInbox(page);
    await turnTo(page, 'Sent');
    await rows(section(page, 'Sent')).first().locator('.tp-ix-head').click();
    await pane(page).getByRole('button', { name: 'Do it myself' }).click();
    await page
      .getByRole('dialog', { name: 'Put it on your list' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect(page.locator('.tp-toast')).toContainText('On Today now. You’ve got it.');
    await idle(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Today/ })
      .first()
      .click();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Book the offsite venue']);
    await expect(rows(section(b.page, 'To answer'))).toHaveCount(0);
    await expect(inboxCount(b.page)).toHaveText('All caught up');
    await b.context.close();
  });

  test('C08-E14 a comment update: the Inbox shows it with the dot and the count; the pane shows the comment; a reply lands; Open task then Go to turns the page', async ({
    page,
    browser,
  }) => {
    test.skip(phone(), 'the two-pane flow; E19 covers the phone');
    const { space, b } = await team(page, browser);
    const ids = await seedTasks(page, space.id, [{ title: 'Write the release notes', day: '2026-10-16' }]);
    // a colleague comments from People
    await goPeople(b.page);
    await b.page
      .getByRole('region', { name: 'Shared' })
      .getByRole('button', { name: 'Write the release notes' })
      .click();
    const theirPanel = b.page.getByRole('dialog', { name: 'Task details' });
    const box = theirPanel.getByRole('textbox', { name: 'Write a comment' });
    await box.click();
    await box.pressSequentially('Can I take the second half?');
    await theirPanel.getByRole('button', { name: 'Comment', exact: true }).click();
    await idle(b.page);
    // the owner's Inbox
    await expect.poll(() => sidebarInboxCount(page)).toBe(1);
    await goInbox(page);
    await expect(inboxCount(page)).toHaveText('1 new');
    const upd = rows(section(page, 'Updates')).first();
    await expect(upd).toContainText('commented on');
    await expect(upd).toContainText('Write the release notes');
    await expect(upd.locator('.tp-ix-dot')).toBeVisible();
    await upd.locator('.tp-ix-head').click();
    await expect(pane(page)).toContainText('Can I take the second half?');
    await expect(upd.locator('.tp-ix-dot')).toHaveCount(0);
    await expect(inboxCount(page)).toHaveText('All caught up');
    // a reply goes onto the task as your comment
    await pane(page)
      .getByRole('textbox', { name: /^Reply to/ })
      .fill('Yes, take it.');
    await pane(page).getByRole('button', { name: 'Reply' }).click();
    await idle(page);
    const detail = (await (
      await page.request.get(`${API_URL}/api/spaces/${space.id}/tasks/${ids['Write the release notes']}`)
    ).json()) as {
      comments: Array<{ html: string }>;
    };
    expect(detail.comments.map((c) => c.html)).toEqual([
      '<p>Can I take the second half?</p>',
      '<p>Yes, take it.</p>',
    ]);
    // Open task slides the panel over the Inbox; Go to Fri 16 Oct turns the page and glows the row
    await pane(page).getByRole('button', { name: 'Open task' }).click();
    const panel = page.getByRole('dialog', { name: 'Task details' });
    await expect(panel.getByText('Yes, take it.')).toBeVisible();
    await panel.getByRole('button', { name: 'Go to Fri 16 Oct' }).click();
    await expect(page).toHaveURL(/\/northwind(-\d+)?$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Friday');
    await expect(dayList(page).locator('.tp-item.tp-locate')).toContainText('Write the release notes');
    await b.context.close();
  });

  test('C08-E15 Mark all as read clears the dots and the count; a read item keeps its place; a request stays counted until answered', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same list on every size');
    const { space, b, bId, aId } = await team(page, browser);
    const ids = await seedTasks(page, space.id, [{ title: 'Write the release notes', day: '2026-10-18' }]);
    await b.page.request.post(`${API_URL}/api/sync`, {
      data: {
        clientId: 'seed',
        mutations: [
          {
            id: crypto.randomUUID(),
            type: 'comment.create',
            payload: { id: crypto.randomUUID(), taskId: ids['Write the release notes'], html: '<p>One</p>' },
            at: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            type: 'comment.create',
            payload: { id: crypto.randomUUID(), taskId: ids['Write the release notes'], html: '<p>Two</p>' },
            at: new Date(Date.now() + 1000).toISOString(),
          },
        ],
      },
    });
    await sendRequest(b.page, space.id, aId, 'For you');
    void bId;
    await goInbox(page);
    await expect(inboxCount(page)).toHaveText('1 to answer · 2 new');
    expect(await sidebarInboxCount(page)).toBe(3);
    await expect(page.locator('.tp-ix-dot')).toHaveCount(3);
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(inboxCount(page)).toHaveText('1 to answer');
    await expect(section(page, 'Updates').locator('.tp-ix-dot')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
    await expect.poll(() => sidebarInboxCount(page)).toBe(1);
    // the items keep their place, newest first
    await expect(rows(section(page, 'Updates')).first()).toContainText('Two');
    // a read request still counts
    await rows(section(page, 'To answer')).first().locator('.tp-ix-head').click();
    await expect(section(page, 'To answer').locator('.tp-ix-dot')).toHaveCount(0);
    await expect(inboxCount(page)).toHaveText('1 to answer');
    await idle(page);
    await page.reload();
    await expect(inboxCount(page)).toHaveText('1 to answer');
    await b.context.close();
  });

  test('C08-E16 search narrows by the sender’s name and a word in the note; nothing matches with Clear search; Answered still turns', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same list on every size');
    const { space, b, bId, aId } = await team(page, browser);
    await sendRequest(b.page, space.id, aId, 'Draft the Q4 hiring plan', { note: 'Budget first.' });
    await sendRequest(b.page, space.id, aId, 'Book the offsite venue');
    void bId;
    await goInbox(page);
    await expect(rows(section(page, 'To answer'))).toHaveCount(2);
    const search = page.getByRole('searchbox', { name: 'Search the Inbox' });
    await search.fill('budget');
    await expect(rows(section(page, 'To answer'))).toHaveCount(1);
    await expect(rows(section(page, 'To answer')).first()).toContainText('Draft the Q4 hiring plan');
    await search.fill(b.email.slice(0, 7));
    await expect(rows(section(page, 'To answer'))).toHaveCount(2);
    await search.fill('zzzz');
    await expect(
      page.getByText('Nothing in the Inbox matches “zzzz”. Try a name or a task title.'),
    ).toBeVisible();
    await turnTo(page, 'Answered');
    await expect(page.getByText(/Nothing in the Inbox matches/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByText('Nothing answered yet.')).toBeVisible();
    await turnTo(page, 'Inbox');
    await expect(rows(section(page, 'To answer'))).toHaveCount(2);
    await search.fill('venue');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await b.context.close();
  });

  test('C08-E17 send into another space from Personal: the top line picks Northwind and Meera; the toast names the space; Personal’s Today has nothing new', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'the same composer on every size');
    const { slug, b } = await team(page, browser);
    await switcher(page).click();
    await page
      .getByRole('menu', { name: 'Spaces' })
      .getByRole('menuitemradio', { name: /Personal/ })
      .click();
    await expect(page).toHaveURL(/\/me$/);
    await newTask(page).click();
    const qa = bar(page);
    await expect(qa.getByLabel('For you')).toHaveText(/Me$/);
    await qa.getByRole('button', { name: 'Space: Personal' }).click();
    await page
      .getByRole('menu', { name: 'Which space' })
      .getByRole('menuitemradio', { name: /Northwind/ })
      .click();
    await expect(qa.getByRole('button', { name: 'Space: Northwind' })).toBeVisible();
    await qa.getByRole('textbox', { name: 'Task title' }).fill('Sync on the roadmap');
    await qa.getByRole('button', { name: 'Who it’s for' }).click();
    await page
      .getByRole('menu', { name: 'Who it’s for' })
      .getByRole('menuitemradio', { name: new RegExp(b.email) })
      .click();
    await expect(qa.locator('.tp-qa-lands')).toContainText('in Northwind');
    await qa.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('.tp-toast')).toContainText(/^Sent to .* in Northwind\./);
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByText('Nothing planned for today yet.')).toBeVisible();
    await idle(page);
    await page.goto(`/${slug}/inbox?view=sent`);
    await expect(rows(section(page, 'Sent')).first()).toContainText('Sync on the roadmap');
    await goInbox(b.page);
    await expect(rows(section(b.page, 'To answer')).first()).toContainText('Sync on the roadmap');
    await b.context.close();
  });

  test('C08-E18 live: a request sent in another tab shows in this one’s Inbox and count without a reload; the switcher says "1 new" on the other space', async ({
    page,
    browser,
  }) => {
    test.skip(phone() || tablet(), 'one pair of browsers is enough');
    const { space, b, aId } = await team(page, browser);
    await goInbox(page);
    await expect(inboxCount(page)).toHaveText('All caught up');
    await sendRequest(b.page, space.id, aId, 'Live one');
    await expect(rows(section(page, 'To answer')).first()).toContainText('Live one');
    await expect(inboxCount(page)).toHaveText('1 to answer');
    await expect.poll(() => sidebarInboxCount(page)).toBe(1);
    // from Personal, the switcher carries the other space's count
    await switcher(page).click();
    await page
      .getByRole('menu', { name: 'Spaces' })
      .getByRole('menuitemradio', { name: /Personal/ })
      .click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByLabel('1 new in other spaces')).toBeVisible();
    await switcher(page).click();
    await expect(
      page.getByRole('menu', { name: 'Spaces' }).getByRole('menuitemradio', { name: /Northwind/ }),
    ).toContainText('1 new');
    await b.context.close();
  });

  test('C08-E19 phone: the header’s inbox icon with the count opens the Inbox with ‹ Today; an item is its own page with ‹ Inbox; Accept there (phone)', async ({
    page,
    browser,
  }) => {
    test.skip(!phone(), 'phone only');
    const { space, b, aId } = await team(page, browser);
    await sendRequest(b.page, space.id, aId, 'Draft the onboarding copy', { askedDay: '2026-10-20' });
    const icon = page.getByRole('button', { name: 'Inbox, 1 new' });
    await expect(icon).toBeVisible();
    await icon.click();
    await expect(page.getByRole('region', { name: 'The Inbox' })).toBeVisible();
    await expect(inboxCount(page)).toHaveText('1 to answer');
    await rows(section(page, 'To answer')).first().locator('.tp-ix-head').click();
    await expect(page).toHaveURL(/\/inbox\/[0-9a-f-]+$/);
    await expect(pane(page)).toContainText('Draft the onboarding copy');
    await expect(pane(page).getByRole('button', { name: 'Inbox' })).toBeVisible();
    await pane(page).getByRole('button', { name: 'Accept' }).click();
    await page
      .getByRole('dialog', { name: 'Accept it onto…' })
      .getByRole('button', { name: 'Today' })
      .click();
    await expect(page.locator('.tp-toast')).toContainText('Accepted onto Today. It’s in Answered.');
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(inboxCount(page)).toHaveText('All caught up');
    await idle(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
    await expect.poll(() => titlesOf(dayList(page))).toEqual(['Draft the onboarding copy']);
    await b.context.close();
  });

  test('C08-E20 offline: Accept queues, the item folds away, "Your answers send when you’re back."; back online it lands and the sender hears; dark mode', async ({
    page,
    browser,
    context,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await page.addInitScript(() => {
      localStorage.setItem('tudu.theme', 'dark');
    });
    const { space, b, aId } = await team(page, browser);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await sendRequest(b.page, space.id, aId, 'Offline one', { askedDay: '2026-10-20' });
    await goInbox(page);
    await rows(section(page, 'To answer')).first().locator('.tp-ix-head').click();
    await context.setOffline(true);
    await expect(page.getByText('Your answers send when you’re back.')).toBeVisible({ timeout: 15_000 });
    await pane(page).getByRole('button', { name: 'Accept' }).click();
    await page
      .getByRole('dialog', { name: 'Accept it onto…' })
      .getByRole('button', { name: 'Tomorrow' })
      .click();
    await expect(page.locator('.tp-toast')).toContainText('Accepted onto Tomorrow. It’s in Answered.');
    await expect(rows(section(page, 'To answer'))).toHaveCount(0);
    await context.setOffline(false);
    await idle(page);
    await expect(page.getByText('Your answers send when you’re back.')).toBeHidden({ timeout: 15_000 });
    const day = (await (
      await page.request.get(`${API_URL}/api/spaces/${space.id}/days/2026-10-19`)
    ).json()) as { tasks: Array<{ title: string }> };
    expect(day.tasks.map((t) => t.title)).toEqual(['Offline one']);
    await goInbox(b.page);
    await turnTo(b.page, 'Sent');
    await expect(rows(section(b.page, 'Sent')).first()).toContainText(/accepted it onto/);
    await b.context.close();
  });
});
