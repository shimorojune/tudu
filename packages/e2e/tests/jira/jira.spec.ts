import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';
import {
  addAnApp,
  addTo,
  chipOf,
  connectByApi,
  down,
  expire,
  goodToken,
  issueKeys,
  issueRow,
  JIRA_SITE,
  jiraButton,
  jiraPanel,
  openJira,
  sideJira,
} from '../../fixtures/jira';
import { hit, openSearch, search } from '../../fixtures/search';
import { createSpace, me, seedTasks, switchTo } from '../../fixtures/spaces';
import { dayList, fixClock, idle, row, writeTasks } from '../../fixtures/today';

const phone = () => test.info().project.name === 'phone';
const tablet = () => test.info().project.name === 'tablet';

/** The seven unresolved issues the fake Jira assigns to you, newest change first. */
const ASSIGNED = ['TUDU-212', 'TUDU-219', 'TUDU-220', 'TUDU-224', 'OPS-14', 'TUDU-226', 'TUDU-231'];
const SUMMARY: Record<string, string> = {
  'TUDU-212': 'Make the Jira panel remember the last view',
  'TUDU-219': 'Fix the date picker on Safari',
  'TUDU-220': 'Run the request status enum migration on production',
  'TUDU-224': 'Write the release notes for 0.38',
};

async function personalId(page: Page): Promise<string> {
  return (await me(page)).spaces.find((s) => s.kind === 'personal')!.id;
}

/** Signed in on Sunday with Jira connected through the API; the panel open on Today. */
async function connected(page: Page): Promise<string> {
  await fixClock(page);
  await signInFresh(page);
  const token = await connectByApi(page);
  await page.reload();
  await openJira(page);
  await expect.poll(() => issueKeys(page)).toEqual(ASSIGNED);
  return token;
}

/** Open a task's panel from its row on Sunday's sheet and wait for it to show the task. */
async function openTask(page: Page, title: string): Promise<Locator> {
  await row(dayList(page, 'Tasks for Sunday 18 October'), title).getByRole('button', { name: title }).click();
  const detail = page.getByRole('dialog', { name: 'Task details' });
  await expect(detail.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);
  return detail;
}

/** Close the task panel (on phones, its back control). */
async function closeTask(page: Page): Promise<void> {
  const detail = page.getByRole('dialog', { name: 'Task details' });
  if (phone()) await detail.getByRole('button', { name: /^(Today|Sunday)$/ }).click();
  else await detail.getByRole('button', { name: 'Close' }).click();
  await expect(detail).toHaveCount(0);
}

/** The panel's facts, by their labels, top to bottom. */
async function factsOf(detail: Locator): Promise<string[]> {
  return detail.locator('.tp-td-prop dt').allTextContents();
}

/** The connect form: the address and the token, then Connect. */
async function fillConnect(page: Page, site: string, token: string): Promise<void> {
  const form = jiraPanel(page);
  await form.getByLabel('Jira address').fill(site);
  await form.getByLabel('Personal access token').fill(token);
  await form.getByRole('button', { name: /^(Connect Jira|Reconnect)$/ }).click();
}

test.describe('jira', () => {
  test('C10-E01 no apps: no Jira anywhere; Add an app opens Apps; Connect opens the form; ‹ Apps goes back, nothing saved', async ({
    page,
  }) => {
    test.skip(phone(), 'phones reach Apps from More (E11)');
    await fixClock(page);
    await signInFresh(page);
    await expect(addAnApp(page)).toBeVisible();
    await expect(sideJira(page)).toHaveCount(0);
    await expect(jiraButton(page)).toHaveCount(0);
    // The task panel too: no Jira fact while Jira isn't connected here.
    await writeTasks(page, ['Tidy the buckets']);
    await idle(page);
    const detail = await openTask(page, 'Tidy the buckets');
    await expect(detail.getByRole('button', { name: 'Jira' })).toHaveCount(0);
    await expect(detail.getByText('Link a Jira issue')).toHaveCount(0);
    expect(await factsOf(detail)).toEqual(['Planned', 'Due', 'Project', 'Visible to']);
    await closeTask(page);
    await addAnApp(page).click();
    const apps = page.getByRole('dialog', { name: 'Apps' });
    await expect(apps.getByRole('heading', { name: 'Apps' })).toBeVisible();
    await expect(apps).toContainText('Everything here is optional; Tudu works fine on its own.');
    await apps.getByRole('button', { name: 'Connect Jira' }).click();
    await expect(page).toHaveURL(/[?&]jira/);
    await expect(
      jiraPanel(page).getByRole('heading', { name: 'Your Jira issues, next to your day' }),
    ).toBeVisible();
    await jiraPanel(page).getByLabel('Jira address').fill('https://jira.northwind.io');
    await jiraPanel(page).getByRole('button', { name: 'Apps' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Apps' }).getByRole('button', { name: 'Connect Jira' }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/jira/);
    const read = await page.request.get(`${API_URL}/api/spaces/${await personalId(page)}/jira`);
    expect(await read.json()).toEqual({ connected: false });
  });

  test('C10-E02 connect: each refusal under its field and cleared on edit; Checking…, Connected, the list; Jira appears with the count', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same form on every size');
    await fixClock(page);
    await signInFresh(page);
    await addAnApp(page).click();
    await page.getByRole('dialog', { name: 'Apps' }).getByRole('button', { name: 'Connect Jira' }).click();
    const form = jiraPanel(page);
    const alert = form.getByRole('alert');

    await fillConnect(page, JIRA_SITE, 'short');
    await expect(alert).toHaveText('Jira didn’t accept this token. Check it, or make a new one.');
    await expect(form.getByLabel('Personal access token')).toHaveAttribute('aria-invalid', 'true');
    await form.getByLabel('Personal access token').press('End');
    await form.getByLabel('Personal access token').pressSequentially('x');
    await expect(alert).toHaveCount(0);

    await fillConnect(page, 'http://localhost:9', goodToken());
    await expect(alert).toHaveText(
      'Couldn’t reach Jira at this address. Check it, or that you’re on your company network.',
    );
    await expect(form.getByLabel('Jira address')).toHaveAttribute('aria-invalid', 'true');

    await fillConnect(page, 'jira.northwind', goodToken());
    await expect(alert).toHaveText('That doesn’t look like a web address. It starts with https://');

    await fillConnect(page, JIRA_SITE, `noread-${Date.now()}`);
    await expect(alert).toHaveText('This token can’t read issues. Make one that can.');

    await fillConnect(page, JIRA_SITE, goodToken());
    await expect(form.getByRole('button', { name: /Connected/ })).toBeVisible();
    await expect.poll(() => issueKeys(page)).toEqual(ASSIGNED);
    await expect(form.locator('.tp-jp-sync')).toContainText('Synced just now');
    await expect(sideJira(page)).toContainText('7');
    await expect(jiraButton(page)).toContainText('7');
    await expect(jiraButton(page)).toHaveAttribute('aria-pressed', 'true');
    // Apps says so.
    await form.getByRole('button', { name: 'Close Jira' }).click();
    await addAnApp(page).click();
    await expect(page.getByRole('dialog', { name: 'Apps' })).toContainText('Connected');
  });

  test('C10-E03 the panel beside Today: the day turns under it; Refresh; × closes; a reload keeps it; Esc closes it', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the desk; the tablet has E12');
    await connected(page);
    // The panel sits over the sheet's arrows; the sidebar's week turns the day.
    await page.locator('.tp-sidebar button.tp-nav').filter({ hasText: 'Monday' }).click();
    await expect(page.getByRole('heading', { name: 'Monday', level: 1 })).toBeVisible();
    await expect(jiraPanel(page)).toBeVisible();
    await jiraPanel(page).getByRole('button', { name: 'Refresh' }).click();
    await expect(jiraPanel(page).locator('.tp-jp-sync')).toContainText('Synced just now');
    await jiraPanel(page).getByRole('button', { name: 'Close Jira' }).click();
    await expect(jiraPanel(page)).toHaveCount(0);
    await expect(jiraButton(page)).toHaveAttribute('aria-pressed', 'false');
    await jiraButton(page).click();
    await expect(page).toHaveURL(/[?&]jira/);
    await page.reload();
    await expect.poll(() => issueKeys(page)).toEqual(ASSIGNED);
    // Esc in the search box only leaves the box; from anywhere else in the panel it closes it.
    await jiraPanel(page).getByRole('textbox', { name: 'Search issues across Jira' }).click();
    await page.keyboard.press('Escape');
    await expect(jiraPanel(page)).toBeVisible();
    await issueRow(page, 'TUDU-212').focus();
    await page.keyboard.press('Escape');
    await expect(jiraPanel(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/jira/);
  });

  test('C10-E04 add to Today: the row on the sheet, the key in its byline, the chip, the count drops, Created from KEY', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the phone and tablet add in E11 and E12');
    await connected(page);
    await expect(jiraButton(page)).toContainText('7');
    await addTo(page, 'TUDU-212', 'Today');
    const list = dayList(page, 'Tasks for Sunday 18 October');
    await expect(row(list, SUMMARY['TUDU-212']!)).toBeVisible();
    await expect(
      row(list, SUMMARY['TUDU-212']!).getByRole('button', { name: /Linked to Jira · TUDU-212/ }),
    ).toBeVisible();
    await expect(chipOf(page, 'TUDU-212')).toHaveAccessibleName(/^Show the linked task ME-\d+ on Today$/);
    await expect(chipOf(page, 'TUDU-212')).toContainText('· Today');
    await expect(jiraButton(page)).toContainText('6');
    await idle(page);
    await row(list, SUMMARY['TUDU-212']!).getByRole('button', { name: SUMMARY['TUDU-212']! }).click();
    const detail = page.getByRole('dialog', { name: 'Task details' });
    await detail.getByRole('button', { name: /History/ }).click();
    await expect(detail).toContainText('Created from TUDU-212');
    await expect(detail.getByRole('button', { name: 'Jira' })).toContainText('TUDU-212In progress');
  });

  test('C10-E05 another day and the Backlog: the chip says where; Show turns the day or opens the Backlog; crossing off marks it', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await connected(page);
    await addTo(page, 'TUDU-219', 'Tomorrow');
    await expect(chipOf(page, 'TUDU-219')).toContainText('Tomorrow');
    await addTo(page, 'TUDU-220', 'Backlog');
    await expect(chipOf(page, 'TUDU-220')).toContainText('Backlog');
    await idle(page);

    await chipOf(page, 'TUDU-219').click();
    const monday = dayList(page, 'Tasks for Monday 19 October');
    await expect(row(monday, SUMMARY['TUDU-219']!)).toBeVisible();
    await expect(jiraPanel(page)).toBeVisible();

    await chipOf(page, 'TUDU-220').click();
    await expect(page).toHaveURL(/\/me\/backlog\?jira/);
    await expect(page.getByRole('list', { name: 'Tasks in the Backlog', includeHidden: true })).toContainText(
      SUMMARY['TUDU-220']!,
    );

    // Cross the Monday task off: its chip says so.
    await chipOf(page, 'TUDU-219').click();
    await row(dayList(page, 'Tasks for Monday 19 October'), SUMMARY['TUDU-219']!)
      .getByRole('checkbox')
      .click();
    await expect(chipOf(page, 'TUDU-219')).toHaveAccessibleName(/crossed off$/);
    await expect(chipOf(page, 'TUDU-219')).toHaveClass(/tp-done/);
  });

  test('C10-E06 preview: facts, description, comments, In Tudu; Open in Jira; add from the foot; Show; ‹ All issues; Esc steps back', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the phone has the sheet (E11), the tablet E12');
    await connected(page);
    await issueRow(page, 'TUDU-212').click();
    await expect(page).toHaveURL(/jira=TUDU-212/);
    const pv = page.getByRole('dialog', { name: /^TUDU-212 / });
    await expect(pv.locator('.tp-jp-facts')).toContainText('Asha Rao');
    await expect(pv.locator('.tp-jp-facts')).toContainText('High');
    await expect(pv).toContainText('When you close the panel and open it again');
    await expect(pv).toContainText('No task for it yet.');
    await expect(pv.locator('.tp-td-cmt')).toHaveCount(3);
    await pv.getByRole('button', { name: 'Show 2 earlier comments' }).click();
    await expect(pv.locator('.tp-td-cmt')).toHaveCount(5);
    const tab = page.waitForEvent('popup');
    await pv.getByRole('button', { name: 'Open TUDU-212 in Jira' }).click();
    expect((await tab).url()).toBe(`${JIRA_SITE}/browse/TUDU-212`);

    await pv.getByRole('button', { name: 'Add to a day' }).click();
    await page
      .getByRole('dialog', { name: 'Add TUDU-212 to a day as a linked task' })
      .getByRole('button', { name: 'Today', exact: true })
      .click();
    await expect(pv.locator('.tp-jp-pvfoot')).toContainText('This issue already has a Tudu task, on Today.');
    await expect(pv.locator('.tp-jp-links')).toContainText(SUMMARY['TUDU-212']!);
    await pv.getByRole('button', { name: /^Show the linked task/ }).click();
    await expect(row(dayList(page, 'Tasks for Sunday 18 October'), SUMMARY['TUDU-212']!)).toBeVisible();

    await pv.getByRole('button', { name: 'All issues' }).click();
    await expect(pv).toHaveCount(0);
    await expect(page).not.toHaveURL(/jira=TUDU/);
    await issueRow(page, 'TUDU-219').click();
    await expect(page.getByRole('dialog', { name: /^TUDU-219 / })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /^TUDU-219 / })).toHaveCount(0);
    await expect(jiraPanel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(jiraPanel(page)).toHaveCount(0);
  });

  test('C10-E07 views: a JQL typo shows Jira’s reason and keeps the list; a good query; Save as a view; a reload keeps it; Remove with Undo', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await connected(page);
    const p = jiraPanel(page);
    await p.getByRole('button', { name: 'View: Assigned to me' }).click();
    await p.getByRole('menuitem', { name: 'Custom JQL…' }).click();
    const jql = p.getByRole('textbox', { name: 'Custom JQL' });
    await jql.fill('stauts = Done');
    await jql.press('Enter');
    await expect(p.getByRole('alert')).toContainText("Jira couldn’t run this. Field 'stauts' does not exist");
    expect(await issueKeys(page)).toEqual(ASSIGNED);
    await jql.fill('issuetype = Bug ORDER BY updated DESC');
    await jql.press('Enter');
    await expect.poll(() => issueKeys(page)).toEqual(['TUDU-219', 'TUDU-240']);
    await p.getByRole('button', { name: 'Save as a view' }).click();
    await p.getByRole('textbox', { name: 'View name' }).fill('My open bugs');
    await p.getByRole('button', { name: 'Save view' }).click();
    await expect(page.locator('.tp-toast')).toContainText('Saved “My open bugs” to your views');
    await expect(p.getByRole('button', { name: 'View: My open bugs' })).toBeVisible();
    await page.reload();
    await expect(jiraPanel(page).getByRole('button', { name: 'View: My open bugs' })).toBeVisible();
    await expect.poll(() => issueKeys(page)).toEqual(['TUDU-219', 'TUDU-240']);
    // Remove it from the editor, then Undo.
    await jiraPanel(page).getByRole('button', { name: 'View: My open bugs' }).click();
    await jiraPanel(page).getByRole('menuitem', { name: 'Custom JQL…' }).click();
    await jiraPanel(page).getByRole('button', { name: 'Remove view' }).click();
    await expect(jiraPanel(page).getByRole('button', { name: 'View: Assigned to me' })).toBeVisible();
    await expect(page.locator('.tp-toast')).toContainText('Removed “My open bugs”');
    await page.locator('.tp-toast').getByRole('button', { name: 'Undo' }).click();
    await expect(jiraPanel(page).getByRole('button', { name: 'View: My open bugs' })).toBeVisible();
  });

  test('C10-E08 search across Jira: a key, a word, the count, no match, Clear search', async ({ page }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await connected(page);
    const box = jiraPanel(page).getByRole('textbox', { name: 'Search issues across Jira' });
    await box.fill('OPS-14');
    await expect(jiraPanel(page).locator('.tp-jp-scope')).toHaveText('1 issue across Jira');
    await expect.poll(() => issueKeys(page)).toEqual(['OPS-14']);
    await box.fill('staging');
    await expect(jiraPanel(page).locator('.tp-jp-scope')).toHaveText('2 issues across Jira');
    await expect.poll(() => issueKeys(page)).toEqual(['OPS-14', 'TUDU-226']);
    await box.fill('nothing like this');
    await expect(jiraPanel(page)).toContainText('No issues in Jira match “nothing like this”.');
    await jiraPanel(page).locator('button.tp-jp-q', { hasText: 'Clear search' }).click();
    await expect.poll(() => issueKeys(page)).toEqual(ASSIGNED);
  });

  test('C10-E09 a token that expires: the banner over the faded list; Add a new token keeps the address; Jira unreachable', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    const token = await connected(page);
    await expire(page, token);
    await jiraPanel(page).getByRole('button', { name: 'Refresh' }).click();
    await expect(jiraPanel(page).getByRole('status')).toContainText('Your Jira token has expired.');
    await expect(jiraPanel(page).locator('.tp-jp-list')).toHaveClass(/tp-stale/);
    expect(await issueKeys(page)).toEqual(ASSIGNED);
    await jiraPanel(page).getByRole('button', { name: 'Add a new token' }).click();
    await expect(jiraPanel(page).getByRole('heading', { name: 'Add a new token' })).toBeVisible();
    await expect(jiraPanel(page).getByLabel('Jira address')).toHaveValue(/__test\/jira$/);
    const fresh = goodToken();
    await jiraPanel(page).getByLabel('Personal access token').fill(fresh);
    await jiraPanel(page).getByRole('button', { name: 'Reconnect' }).click();
    await expect(jiraPanel(page).locator('.tp-jp-banner')).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(() => issueKeys(page)).toEqual(ASSIGNED);

    await down(page, fresh);
    await jiraPanel(page).getByRole('button', { name: 'Refresh' }).click();
    await expect(jiraPanel(page).getByRole('status')).toContainText('Couldn’t refresh. Showing issues from');
    await down(page, fresh, false);
    await jiraPanel(page).locator('.tp-banner').getByRole('button', { name: 'Try again' }).click();
    await expect(jiraPanel(page).locator('.tp-jp-banner')).toHaveCount(0);
  });

  test('C10-E10 the task panel: link by key, the fact and the byline; search by key; Unlink; Disconnect keeps the keys', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await connected(page);
    await jiraPanel(page).getByRole('button', { name: 'Close Jira' }).click();
    const list = dayList(page, 'Tasks for Sunday 18 October');
    await writeTasks(page, ['Tidy the buckets']);
    await idle(page);
    await row(list, 'Tidy the buckets').getByRole('button', { name: 'Tidy the buckets' }).click();
    const detail = page.getByRole('dialog', { name: 'Task details' });
    await detail.getByRole('button', { name: 'Jira' }).click();
    await detail.getByRole('textbox', { name: 'Jira issue key' }).fill('tudu-226');
    await detail.getByRole('textbox', { name: 'Jira issue key' }).press('Enter');
    await expect(detail.getByRole('button', { name: 'Jira' })).toContainText('TUDU-226');
    await expect(detail.getByRole('button', { name: 'Jira' })).toContainText('Backlog');
    // The panel is modal: the row under it is read by its class, not its role.
    await expect(row(list, 'Tidy the buckets').locator('.tp-sg-jira')).toHaveText('TUDU-226');
    await idle(page);
    await detail.getByRole('button', { name: 'Close' }).click();

    await openSearch(page);
    await search(page, 'TUDU-226');
    await expect(hit(page, 'Tidy the buckets')).toBeVisible();
    await expect(hit(page, 'Tidy the buckets').locator('.tp-sh-jira')).toHaveText('TUDU-226');
    await page.keyboard.press('Escape');

    await row(list, 'Tidy the buckets').getByRole('button', { name: 'Tidy the buckets' }).click();
    await detail.getByRole('button', { name: 'Jira' }).click();
    await detail.getByRole('menuitem', { name: 'Unlink the issue' }).click();
    await expect(page.locator('.tp-toast')).toContainText('Unlinked TUDU-226');
    await expect(detail.getByRole('button', { name: 'Jira' })).toContainText('Link a Jira issue');
    await detail.getByRole('button', { name: 'Close' }).click();

    // A task from Jira, then Disconnect: Jira leaves the shell, the task keeps its key.
    await openJira(page);
    await addTo(page, 'TUDU-224', 'Today');
    await expect(row(list, SUMMARY['TUDU-224']!)).toBeVisible();
    await idle(page);
    await jiraPanel(page).getByRole('button', { name: 'More' }).click();
    await jiraPanel(page).getByRole('menuitem', { name: 'Disconnect Jira' }).click();
    await expect(page.locator('.tp-toast')).toContainText(
      'Jira disconnected. Your tasks keep their Jira keys.',
    );
    await expect(jiraPanel(page)).toHaveCount(0);
    await expect(jiraButton(page)).toHaveCount(0);
    await expect(sideJira(page)).toHaveCount(0);
    await expect(
      row(list, SUMMARY['TUDU-224']!).getByRole('button', { name: /Linked to Jira · TUDU-224/ }),
    ).toBeVisible();
    // Its panel: the key alone, no status, and no Open in Jira.
    const kept = await openTask(page, SUMMARY['TUDU-224']!);
    await expect(kept.getByRole('button', { name: 'Jira' })).toHaveText('TUDU-224');
    await kept.getByRole('button', { name: 'Jira' }).click();
    await expect(kept.getByRole('menuitem', { name: /Open TUDU-224 in Jira/ })).toHaveCount(0);
    await expect(kept.getByRole('menuitem', { name: 'Unlink the issue' })).toBeVisible();
  });

  test('C10-E14 the Jira fact lives with the connection: none without Jira; Link once connected; a kept key alone after Disconnect; Unlink takes it away', async ({
    page,
  }) => {
    await fixClock(page);
    await signInFresh(page);
    await writeTasks(page, ['Tidy the buckets']);
    await idle(page);
    let detail = await openTask(page, 'Tidy the buckets');
    await expect(detail.getByRole('button', { name: 'Jira' })).toHaveCount(0);
    await expect(detail.getByText('Link a Jira issue')).toHaveCount(0);
    await closeTask(page);

    await connectByApi(page);
    await page.reload();
    detail = await openTask(page, 'Tidy the buckets');
    const fact = detail.getByRole('button', { name: 'Jira' });
    await expect(fact).toHaveText('Link a Jira issue');
    await fact.click();
    await detail.getByRole('textbox', { name: 'Jira issue key' }).fill('TUDU-226');
    await detail.getByRole('textbox', { name: 'Jira issue key' }).press('Enter');
    await expect(fact).toContainText('TUDU-226');
    await expect(fact).toContainText('Backlog');
    await idle(page);
    await closeTask(page);

    const res = await page.request.delete(`${API_URL}/api/spaces/${await personalId(page)}/jira`);
    expect(res.ok()).toBe(true);
    await page.reload();
    detail = await openTask(page, 'Tidy the buckets');
    await expect(fact).toHaveText('TUDU-226');
    await fact.click();
    await expect(detail.getByRole('menuitem', { name: /Open TUDU-226 in Jira/ })).toHaveCount(0);
    await detail.getByRole('menuitem', { name: 'Unlink the issue' }).click();
    await expect(page.locator('.tp-toast')).toContainText('Unlinked TUDU-226');
    await expect(fact).toHaveCount(0);
    expect(await factsOf(detail)).toEqual(['Planned', 'Due', 'Project', 'Visible to']);
  });

  test('C10-E15 per space: Jira in Personal, none in Northwind; Northwind’s task panel has no Jira fact', async ({
    page,
  }) => {
    test.skip(phone() || tablet(), 'the same panel on every size (E14)');
    await fixClock(page);
    await signInFresh(page);
    await connectByApi(page);
    await page.reload();
    const slug = await createSpace(page, 'Northwind');
    const nw = (await me(page)).spaces.find((s) => s.slug === slug)!;
    // A new team space opens on its welcome (Invite people), so the task goes in through sync.
    await seedTasks(page, nw.id, [{ title: 'Draft the offsite agenda', day: '2026-10-18' }]);
    await page.reload();
    let detail = await openTask(page, 'Draft the offsite agenda');
    await expect(detail.getByRole('button', { name: 'Jira' })).toHaveCount(0);
    await expect(detail.getByText('Link a Jira issue')).toHaveCount(0);
    await closeTask(page);

    await switchTo(page, 'Personal');
    await writeTasks(page, ['Tidy the buckets']);
    await idle(page);
    detail = await openTask(page, 'Tidy the buckets');
    await expect(detail.getByRole('button', { name: 'Jira' })).toHaveText('Link a Jira issue');
  });

  test('C10-E11 phone: More › Apps › Connect pushes the form in; ‹ Apps back; the Jira tab with its count; a sheet; Add to Today; Show', async ({
    page,
  }) => {
    test.skip(!phone(), 'phone only');
    await fixClock(page);
    await signInFresh(page);
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('button', { name: /Jira$/ })).toHaveCount(0);
    await tabs.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: /^Apps/ }).click();
    await expect(page).toHaveURL(/\/me\/apps$/);
    await page.getByRole('button', { name: 'Connect Jira' }).click();
    await expect(page).toHaveURL(/\/me\/jira$/);
    await jiraPanel(page).getByRole('button', { name: 'Apps' }).click();
    await expect(page).toHaveURL(/\/me\/apps$/);
    await page.getByRole('button', { name: 'Connect Jira' }).click();
    await fillConnect(page, JIRA_SITE, goodToken());
    await expect.poll(() => issueKeys(page)).toEqual(ASSIGNED);
    const jiraTab = tabs.getByRole('button', { name: /Jira$/ });
    await expect(jiraTab).toBeVisible();
    await expect(jiraTab).toHaveAttribute('aria-current', 'page');
    await expect(jiraTab).toContainText('7');

    await issueRow(page, 'TUDU-224').click();
    const sheet = page.getByRole('dialog', { name: /^TUDU-224 / });
    await expect(sheet).toBeVisible();
    await expect(page.locator('.tp-jp-pvwrap')).toHaveClass(/tp-sheetmode/);
    await sheet.getByRole('button', { name: 'Add to a day' }).click();
    await page
      .getByRole('dialog', { name: 'Add TUDU-224 to a day as a linked task' })
      .getByRole('button', { name: 'Today', exact: true })
      .click();
    await expect(sheet.locator('.tp-jp-pvfoot')).toContainText('on Today');
    await expect(jiraTab).toContainText('6');
    await sheet.getByRole('button', { name: /^Show the linked task/ }).click();
    await expect(tabs.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    await expect(row(dayList(page, 'Tasks for Sunday 18 October'), SUMMARY['TUDU-224']!)).toBeVisible();
  });

  test('C10-E12 tablet: the panel at 460px from the rail; the preview inside it; add from the preview', async ({
    page,
  }) => {
    test.skip(!tablet(), 'tablet only');
    await connected(page);
    const box = await jiraPanel(page).boundingBox();
    expect(Math.round(box!.width)).toBe(460);
    await issueRow(page, 'TUDU-219').click();
    const pv = page.getByRole('dialog', { name: /^TUDU-219 / });
    await expect(pv).toBeVisible();
    const inner = await pv.boundingBox();
    expect(inner!.x).toBeGreaterThanOrEqual(box!.x - 1);
    await pv.getByRole('button', { name: 'Add to a day' }).click();
    await page
      .getByRole('dialog', { name: 'Add TUDU-219 to a day as a linked task' })
      .getByRole('button', { name: 'Today', exact: true })
      .click();
    await expect(pv.locator('.tp-jp-pvfoot')).toContainText('on Today');
    await expect(row(dayList(page, 'Tasks for Sunday 18 October'), SUMMARY['TUDU-219']!)).toBeVisible();
  });

  test('C10-E13 offline: the last issues under “You’re offline.” and adding still works; dark: the panel, preview, banner and form', async ({
    page,
    context,
  }) => {
    test.skip(phone() || tablet(), 'the same flow on every size');
    await connected(page);
    await context.setOffline(true);
    await expect(jiraPanel(page).getByRole('status')).toContainText('You’re offline.');
    await expect(jiraPanel(page).getByRole('status')).toContainText(
      'Linked tasks you add now sync when you’re back.',
    );
    await addTo(page, 'TUDU-224', 'Today');
    const list = dayList(page, 'Tasks for Sunday 18 October');
    await expect(row(list, SUMMARY['TUDU-224']!)).toBeVisible();
    await context.setOffline(false);
    await idle(page);
    const day = await page.request.get(`${API_URL}/api/spaces/${await personalId(page)}/days/2026-10-18`);
    const tasks = ((await day.json()) as { tasks: Array<{ title: string; jira: string | null }> }).tasks;
    expect(tasks.map((t) => [t.title, t.jira])).toEqual([[SUMMARY['TUDU-224'], 'TUDU-224']]);

    // Dark: every Jira surface paints on the dark card.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    const dark = async (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => {
          const m = /\d+(\.\d+)?/g;
          const [r, g, b] = (getComputedStyle(el).backgroundColor.match(m) ?? ['255', '255', '255']).map(
            Number,
          );
          return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
        });
    await expect.poll(() => dark('section.tp-jp')).toBeLessThan(0.25);
    await issueRow(page, 'TUDU-212').click();
    await expect.poll(() => dark('.tp-jp-pvwrap')).toBeLessThan(0.25);
    await page
      .getByRole('dialog', { name: /^TUDU-212 / })
      .getByRole('button', { name: 'All issues' })
      .click();
    await context.setOffline(true);
    await expect(jiraPanel(page).locator('.tp-banner')).toBeVisible();
    await expect.poll(() => dark('.tp-jp-banner .tp-banner')).toBeLessThan(0.3);
    await context.setOffline(false);
    await jiraPanel(page).getByRole('button', { name: 'More' }).click();
    await jiraPanel(page).getByRole('menuitem', { name: 'Disconnect Jira' }).click();
    await addAnApp(page).click();
    await page.getByRole('dialog', { name: 'Apps' }).getByRole('button', { name: 'Connect Jira' }).click();
    await expect(
      jiraPanel(page).getByRole('heading', { name: 'Your Jira issues, next to your day' }),
    ).toBeVisible();
    await expect.poll(() => dark('section.tp-jp')).toBeLessThan(0.25);
  });
});
