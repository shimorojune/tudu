import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';

/**
 * Chunk 19 · Send feedback. Group `feedback`. The API mails each report to reports@tudu.test, which the tests read
 * from the outbox, and files it as an issue on the fake GitHub it serves under /__test/github-issues; each test's
 * words are its own, so parallel runs never read each other's mail or issues.
 */

const phone = () => test.info().project.name === 'phone';
const desktop = () => test.info().project.name === 'desktop';
const REPORTS = 'reports@tudu.test';

interface FakeIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  repo: string;
}

interface OutMail {
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; type: string; size: number }>;
}

const form = (page: Page) => page.getByRole('dialog', { name: 'Send feedback' });
const filed = (page: Page) => page.getByRole('dialog', { name: 'Thanks, it’s filed' });
const anyDialog = (page: Page) => page.locator('.tp-dlg');
const ISSUE_URL = /^https:\/\/github\.com\/shimorojune\/tudu\/issues\/(\d+)$/;
const words = (f: Locator) => f.getByRole('textbox', { name: /^What (happened|would help)\?$/ });
const caption = (f: Locator) => f.locator('.tp-fb-shot figcaption');
const toast = (page: Page) => page.locator('.tp-toast');

/** A small real PNG (one pixel), as a screenshot would arrive. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** The header's bug, on every size. */
async function openByBug(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Report a bug or idea' }).click();
  const f = form(page);
  await expect(f).toBeVisible();
  return f;
}

async function openForm(page: Page): Promise<Locator> {
  if (phone()) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
    await page.locator('.app-more-item', { hasText: 'Send feedback' }).click();
  } else {
    await page.getByRole('button', { name: /^You: / }).click();
    await page.getByRole('menuitem', { name: 'Send feedback' }).click();
  }
  const f = form(page);
  await expect(f).toBeVisible();
  return f;
}

async function mailsAbout(page: Page, marker: string): Promise<OutMail[]> {
  const res = await page.request.get(`${API_URL}/__test/outbox?to=${encodeURIComponent(REPORTS)}`);
  return ((await res.json()) as { mails: OutMail[] }).mails.filter((m) => m.text.includes(marker));
}

async function oneMail(page: Page, marker: string): Promise<OutMail> {
  await expect.poll(async () => (await mailsAbout(page, marker)).length, { timeout: 10_000 }).toBe(1);
  return (await mailsAbout(page, marker))[0]!;
}

async function issuesAbout(page: Page, marker: string): Promise<FakeIssue[]> {
  const res = await page.request.get(
    `${API_URL}/__test/github-issues/issues?has=${encodeURIComponent(marker)}`,
  );
  return ((await res.json()) as { issues: FakeIssue[] }).issues;
}

async function oneIssue(page: Page, marker: string): Promise<FakeIssue> {
  await expect.poll(async () => (await issuesAbout(page, marker)).length, { timeout: 10_000 }).toBe(1);
  return (await issuesAbout(page, marker))[0]!;
}

/** Makes the fake GitHub answer reports holding `marker` as down (503), or as itself again. */
async function github(page: Page, marker: string, mode: 'down' | 'up') {
  await page.request.post(`${API_URL}/__test/github-issues/mode`, { data: { when: marker, mode } });
}

/** Write and send; Filed shows the number and the link. Returns the number. */
async function fileIt(page: Page, f: Locator, text: string): Promise<number> {
  await words(f).fill(text);
  await f.getByRole('button', { name: 'Send' }).click();
  const done = filed(page);
  await expect(done).toBeVisible();
  const url = (await done.locator('.tp-issue-url').textContent())!;
  const n = Number(/issues\/(\d+)$/.exec(url)![1]);
  await expect(done.locator('.tp-fb-num')).toContainText(`#${n}`);
  return n;
}

/** Write, send, see Filed, then Done: the dialog goes and the toast keeps the number. */
async function sendIt(page: Page, f: Locator, text: string): Promise<number> {
  const n = await fileIt(page, f, text);
  await filed(page).getByRole('button', { name: 'Done' }).click();
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(toast(page)).toContainText(`Filed as #${n} on GitHub`);
  return n;
}

async function pickShot(page: Page, f: Locator, name = 'Screenshot.png') {
  const chooser = page.waitForEvent('filechooser');
  await f.getByRole('button', { name: 'Add a screenshot' }).click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(caption(f)).toHaveText(`${name}1 KB`);
}

/**
 * E01's flow: the header's bug, words, Send; Filed has the number and the link. The issue holds the words and the
 * details and never the email; the mail still carries them, a reply-to and the issue.
 */
async function sendFlow(page: Page) {
  const email = await signInFresh(page);
  const marker = `e01-${crypto.randomUUID()}`;
  const f = await openByBug(page);
  // The page behind the dialog is hidden from the accessibility tree, so by its class: pressed while open.
  await expect(page.locator('.tp-tb-bug')).toHaveClass(/tp-on/);
  await expect(
    f.getByText('It’s filed as a public issue on GitHub, so you can follow it.').first(),
  ).toBeVisible();
  await expect(f.getByRole('switch', { name: 'Include app details' })).toBeChecked();
  await expect(
    f.getByText(/^Tudu .* on the web, .*, the Today page\. Shown on the issue\. Never your tasks\.$/),
  ).toBeVisible();
  const n = await sendIt(page, f, `The tick came back after a reload. ${marker}`);
  const issue = await oneIssue(page, marker);
  expect(issue.number).toBe(n);
  expect(issue.repo).toBe('shimorojune/tudu');
  expect(issue.title.startsWith('The tick came back after a reload. e01-')).toBe(true);
  expect(issue.title).toMatch(/…$/);
  expect(issue.title.length).toBeLessThanOrEqual(70);
  expect(issue.labels).toEqual(['bug', 'from-app']);
  expect(issue.body).toContain('- App: Tudu on the web');
  expect(issue.body).not.toContain(email);
  const mail = await oneMail(page, marker);
  expect(mail.replyTo).toBe(email);
  expect(mail.subject).toMatch(/^Something’s wrong: The tick came back after a reload\. e01-[0-9a-f-]+…$/);
  expect(mail.text).toContain('App: Tudu on the web');
  expect(mail.text).toContain('Page: Today, in a personal space');
  expect(mail.text).toContain(`GitHub issue: #${n} https://github.com/shimorojune/tudu/issues/${n}`);
}

/** E02's flow: attach by the picker, × removes it, attach again and send; the mail carries the image. */
async function shotFlow(page: Page) {
  await signInFresh(page);
  const marker = `e02-${crypto.randomUUID()}`;
  const f = await openForm(page);
  await pickShot(page, f);
  await expect(f.getByRole('img', { name: 'Preview of Screenshot.png' })).toBeVisible();
  await expect(f.locator('.tp-fb-shot-img')).toHaveClass(/tp-ready/);
  await f.getByRole('button', { name: 'Remove the screenshot' }).click();
  await expect(caption(f)).toHaveCount(0);
  await expect(f.getByText('Only the Tudu team sees it')).toBeVisible();
  await pickShot(page, f, 'Board.png');
  await sendIt(page, f, `With a picture ${marker}`);
  const mail = await oneMail(page, marker);
  expect(mail.attachments?.map((a) => [a.filename, a.type, a.size])).toEqual([
    ['Board.png', 'image/png', PNG.length],
  ]);
}

test.describe('send feedback', () => {
  test('C19-E01 the header’s bug: write, Send, Filed with #n and the link; one issue, no email on it; the mail still arrives; the avatar still opens it', async ({
    page,
  }) => {
    test.skip(phone(), 'phones are E07');
    await sendFlow(page);
    const again = await openForm(page);
    await expect(again).toBeVisible();
  });

  test('C19-E02 the file picker: the preview and name show; × removes it; the mail carries the one sent', async ({
    page,
  }) => {
    test.skip(phone(), 'the same form on every size');
    await shotFlow(page);
  });

  test('C19-E03 a pasted image and a dropped one each attach', async ({ page }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const f = await openForm(page);
    await words(f).evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG.toString('base64'));
    await expect(caption(f)).toHaveText('Pasted image.png1 KB');
    await f.getByRole('button', { name: 'Remove the screenshot' }).click();
    await expect(caption(f)).toHaveCount(0);
    const zone = f.locator('.tp-fb-drop');
    await zone.evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'Dropped.png', { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, PNG.toString('base64'));
    await expect(zone).toHaveClass(/tp-over/);
    await zone.evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'Dropped.png', { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, PNG.toString('base64'));
    await expect(zone).not.toHaveClass(/tp-over/);
    await expect(caption(f)).toHaveText('Dropped.png1 KB');
  });

  test('C19-E04 details off: the mail has none; reopening, the switch is still off', async ({ page }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const marker = `e04-${crypto.randomUUID()}`;
    const f = await openForm(page);
    await f.getByRole('button', { name: 'An idea' }).click();
    await f.getByRole('switch', { name: 'Include app details' }).click();
    await sendIt(page, f, `Snooze to a time ${marker}`);
    const mail = await oneMail(page, marker);
    expect(mail.subject).toMatch(/^An idea: Snooze to a time/);
    expect(mail.text).toContain('No app details: they switched them off.');
    expect(mail.text).not.toContain('App: ');
    const again = await openForm(page);
    await expect(again.getByRole('switch', { name: 'Include app details' })).not.toBeChecked();
    await page.reload();
    const after = await openForm(page);
    await expect(after.getByRole('switch', { name: 'Include app details' })).not.toBeChecked();
  });

  test('C19-E05 offline: Send saves with the offline toast; back online, one mail, one issue and its number in a toast', async ({
    page,
    context,
  }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const marker = `e05-${crypto.randomUUID()}`;
    const f = await openForm(page);
    await pickShot(page, f);
    await context.setOffline(true);
    await words(f).fill(`Written on a train ${marker}`);
    await f.getByRole('button', { name: 'Send' }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(toast(page)).toContainText('Saved. It’s filed when you’re back online.');
    expect(await mailsAbout(page, marker)).toHaveLength(0);
    await context.setOffline(false);
    const mail = await oneMail(page, marker);
    expect(mail.attachments?.map((a) => a.filename)).toEqual(['Screenshot.png']);
    const issue = await oneIssue(page, marker);
    await expect(toast(page)).toContainText(`Filed as #${issue.number} on GitHub`);
    await expect(toast(page).getByRole('button', { name: 'Copy link' })).toBeVisible();
    // And only once, however often the connection comes and goes.
    await context.setOffline(true);
    await context.setOffline(false);
    await page.waitForTimeout(500);
    expect(await mailsAbout(page, marker)).toHaveLength(1);
    expect(await issuesAbout(page, marker)).toHaveLength(1);
  });

  test('C19-E06 closing with words keeps the draft and the screenshot', async ({ page }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const f = await openForm(page);
    await f.getByRole('button', { name: 'An idea' }).click();
    await words(f).fill('Half a thought');
    await pickShot(page, f);
    await f.getByRole('button', { name: 'Cancel' }).click();
    await expect(form(page)).toHaveCount(0);
    const again = await openForm(page);
    await expect(words(again)).toHaveValue('Half a thought');
    await expect(words(again)).toHaveAccessibleName('What would help?');
    await expect(caption(again)).toHaveText('Screenshot.png1 KB');
    // Esc leaves the words first, then closes; the draft stays either way.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(form(page)).toHaveCount(0);
    await expect(words(await openForm(page))).toHaveValue('Half a thought');
  });

  test('C19-E07 phone: the header’s bug opens the sheet and files it; More › Send feedback still opens it', async ({
    page,
  }) => {
    test.skip(!phone(), 'phone only');
    await signInFresh(page);
    const marker = `e07-${crypto.randomUUID()}`;
    const f = await openByBug(page);
    await expect(f).toHaveClass(/sheet/);
    const n = await fileIt(page, f, `From my phone ${marker}`);
    const sheet = filed(page);
    await expect(sheet).toHaveClass(/sheet/);
    await expect(sheet.getByRole('button', { name: 'Your reports' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(toast(page)).toContainText(`Filed as #${n} on GitHub`);
    const mail = await oneMail(page, marker);
    expect(mail.text).toMatch(/System: Android \d+, Chrome \d+/);
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(await openForm(page)).toHaveClass(/sheet/);
  });

  test('C19-E08 dark: send with a screenshot, on the dark surfaces', async ({ page }) => {
    test.skip(!desktop(), 'the same form on every size');
    await page.addInitScript(() => {
      if (!localStorage.getItem('tudu.theme')) localStorage.setItem('tudu.theme', 'dark');
    });
    await sendFlow(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.context().clearCookies();
    await shotFlow(page);
    const f = await openForm(page);
    const bg = await words(f).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('C19-E09 the kit: every state of the form and Your reports, light and dark; nothing overflows at phone width', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the kit is one page');
    await page.goto('/kit#send-feedback');
    for (const [title, check] of [
      [
        'Send feedback, empty',
        (l: Locator) => expect(l.getByRole('button', { name: 'Send' })).toBeDisabled(),
      ],
      [
        'Send feedback, with a screenshot',
        (l: Locator) => expect(l.locator('.tp-fb-shot-img')).toHaveClass(/tp-ready/),
      ],
      [
        'Send feedback, sending',
        (l: Locator) => expect(l.getByRole('button', { name: /Sending…/ })).toBeVisible(),
      ],
      ['Send feedback, sent', (l: Locator) => expect(l.getByRole('button', { name: /Sent/ })).toBeVisible()],
      [
        'Send feedback, public on GitHub',
        (l: Locator) =>
          expect(l.getByRole('button', { name: 'Public on GitHub: what’s shared' })).toBeVisible(),
      ],
      [
        'Send feedback, filing',
        (l: Locator) => expect(l.getByRole('button', { name: /Filing…/ })).toBeVisible(),
      ],
      ['Send feedback, filed', (l: Locator) => expect(l.locator('.tp-fb-num')).toContainText('#142')],
      [
        'Send feedback, issue to follow',
        (l: Locator) =>
          expect(l.getByText('The GitHub issue follows in a few minutes.').first()).toBeVisible(),
      ],
      [
        'Send feedback, couldn’t send',
        (l: Locator) => expect(l.getByRole('alert')).toContainText('That’s a lot of reports in an hour.'),
      ],
      ['Your reports', (l: Locator) => expect(l.locator('.tp-fbr-row')).toHaveCount(4)],
      ['Your reports, loading', (l: Locator) => expect(l.locator('.tp-fbr-skel')).toHaveCount(4)],
      ['Your reports, empty', (l: Locator) => expect(l.getByText('Nothing sent yet')).toBeVisible()],
      [
        'Your reports, couldn’t load',
        (l: Locator) => expect(l.getByRole('button', { name: 'Try again' })).toBeVisible(),
      ],
    ] as const) {
      const block = page.getByRole('region', { name: title, exact: true });
      // Light, then dark: each Pair draws both.
      for (const i of [0, 1]) await check(block.locator('.kit-desk').nth(i));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const over = await page.evaluate(() => {
      const past: string[] = [];
      for (const el of document.querySelectorAll(
        '#send-feedback :is(.tp-fb, .tp-fb-done, .tp-fbr-list, .tp-fbr-empty, .tp-dlg-f) *',
      )) {
        const r = el.getBoundingClientRect();
        const box = el.closest('.kit-desk')!.getBoundingClientRect();
        if (r.width && r.right > box.right + 1) past.push(el.className.toString());
      }
      return past;
    });
    expect(over).toEqual([]);
  });

  test('C19-E10 a double click on Send files one issue and sends one mail', async ({ page }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const marker = `e10-${crypto.randomUUID()}`;
    const f = await openByBug(page);
    await words(f).fill(`Twice is once ${marker}`);
    await f.getByRole('button', { name: 'Send' }).dblclick();
    await expect(filed(page)).toBeVisible();
    await oneIssue(page, marker);
    await oneMail(page, marker);
    await page.waitForTimeout(500);
    expect(await issuesAbout(page, marker)).toHaveLength(1);
    expect(await mailsAbout(page, marker)).toHaveLength(1);
  });

  test('C19-E11 GitHub down: Sent with the issue to follow; Your reports shows it waiting; back up, the sweep files it', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const marker = `e11-${crypto.randomUUID()}`;
    await github(page, marker, 'down');
    const f = await openByBug(page);
    await words(f).fill(`While GitHub sleeps ${marker}`);
    await f.getByRole('button', { name: 'Send' }).click();
    const sent = page.getByRole('dialog', { name: 'Thanks, it’s sent' });
    await expect(sent.getByText('The GitHub issue follows in a few minutes.').first()).toBeVisible();
    await oneMail(page, marker);
    expect(await issuesAbout(page, marker)).toHaveLength(0);
    await sent.getByRole('button', { name: 'Your reports' }).click();
    const list = page.getByRole('dialog', { name: 'Your reports' });
    const row = list.locator('.tp-fbr-row', { hasText: 'While GitHub sleeps' });
    await expect(row).toContainText('Today · Waiting for GitHub');
    await expect(row.locator('.tp-fbr-shim')).toBeVisible();
    await expect(row).not.toHaveAttribute('href');
    await list.getByRole('button', { name: 'Back' }).click();
    await expect(sent).toBeVisible();
    await sent.getByRole('button', { name: 'Done' }).click();
    await expect(anyDialog(page)).toHaveCount(0);

    await github(page, marker, 'up');
    await page.request.post(`${API_URL}/__test/feedback/sweep`);
    const issue = await oneIssue(page, marker);
    await page.reload();
    const again = await openByBug(page);
    await again.getByRole('button', { name: /^Your reports/ }).click();
    const link = page
      .getByRole('dialog', { name: 'Your reports' })
      .getByRole('link', { name: new RegExp(`^Issue #${issue.number}: While GitHub sleeps`) });
    await expect(link).toHaveAttribute('href', `https://github.com/shimorojune/tudu/issues/${issue.number}`);
  });

  test('C19-E12 Public on GitHub lists what is public and what stays with the team; the screenshot hint says so', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const f = await openByBug(page);
    await expect(f.getByText('Only the Tudu team sees it')).toBeVisible();
    await expect(words(f)).toHaveAttribute('placeholder', /Leave out anything private\.$/);
    await words(f).fill('Kept while I look');
    await f.getByRole('button', { name: 'Public on GitHub: what’s shared' }).click();
    const pop = page.getByRole('dialog', { name: 'What’s shared' });
    await expect(pop).toBeVisible();
    await expect(pop.getByRole('listitem')).toHaveText([
      'What you write',
      'Bug or idea',
      'App details, when switched on: version, system, page, window, theme',
      'Your name and email (so we can reply)',
      'The screenshot',
    ]);
    await expect(pop).toContainText('Never sent anywhere: your tasks, notes, people or space names.');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(form(page)).toBeVisible();
    await expect(words(f)).toHaveValue('Kept while I look');
  });

  test('C19-E13 Your reports: empty for a new person, then the filed report linking to its issue', async ({
    page,
  }) => {
    test.skip(!desktop(), 'the same form on every size');
    await signInFresh(page);
    const marker = `e13-${crypto.randomUUID()}`;
    const f = await openByBug(page);
    await f.getByRole('button', { name: /^Your reports/ }).click();
    const list = page.getByRole('dialog', { name: 'Your reports' });
    await expect(list.getByText('Nothing sent yet')).toBeVisible();
    await list.getByRole('button', { name: 'Back' }).click();
    await f.getByRole('button', { name: 'An idea' }).click();
    const n = await fileIt(page, form(page), `Pin a task to the top ${marker}`);
    await filed(page).getByRole('button', { name: 'Your reports' }).click();
    const link = list.getByRole('link', { name: new RegExp(`^Issue #${n}: Pin a task to the top`) });
    await expect(link).toHaveAttribute('href', `https://github.com/shimorojune/tudu/issues/${n}`);
    await expect(link).toContainText('Today · An idea');
    await list.getByRole('button', { name: 'Back' }).click();
    await expect(filed(page)).toBeVisible();
  });

  test('C19-E14 Copy in Filed puts the issue link on the clipboard', async ({ page, context }) => {
    test.skip(!desktop(), 'clipboard permission in Chrome');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await signInFresh(page);
    const marker = `e14-${crypto.randomUUID()}`;
    const n = await fileIt(page, await openByBug(page), `Copy me ${marker}`);
    const done = filed(page);
    await done.getByRole('button', { name: 'Copy the issue link' }).click();
    await expect(done.getByRole('button', { name: 'Copied the issue link' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (copied !== null) expect(copied).toMatch(ISSUE_URL);
    if (copied !== null) expect(copied).toBe(`https://github.com/shimorojune/tudu/issues/${n}`);
  });
});
