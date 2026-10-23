import type { Locator, Page } from '@playwright/test';
import { API_URL, expect, signInFresh, test } from '../../fixtures/app';

/**
 * Chunk 19 · Send feedback. Group `feedback`. The API mails each report to reports@tudu.test, which the tests read
 * from the outbox; each test's words are its own, so parallel runs never read each other's mail.
 */

const phone = () => test.info().project.name === 'phone';
const desktop = () => test.info().project.name === 'desktop';
const REPORTS = 'reports@tudu.test';

interface OutMail {
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; type: string; size: number }>;
}

const form = (page: Page) => page.getByRole('dialog', { name: 'Send feedback' });
const words = (f: Locator) => f.getByRole('textbox', { name: /^What (happened|would help)\?$/ });
const caption = (f: Locator) => f.locator('.tp-fb-shot figcaption');
const toast = (page: Page) => page.locator('.tp-toast');

/** A small real PNG (one pixel), as a screenshot would arrive. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

/** Write, send, see "Sent", and the thanks once the dialog has gone. */
async function sendIt(page: Page, f: Locator, text: string) {
  await words(f).fill(text);
  await f.getByRole('button', { name: 'Send' }).click();
  await expect(f.getByRole('button', { name: /Sent/ })).toBeVisible();
  await expect(form(page)).toHaveCount(0);
  await expect(toast(page)).toContainText('Thanks. That’s with the Tudu team now.');
}

async function pickShot(page: Page, f: Locator, name = 'Screenshot.png') {
  const chooser = page.waitForEvent('filechooser');
  await f.getByRole('button', { name: 'Add a screenshot' }).click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(caption(f)).toHaveText(`${name}1 KB`);
}

/** E01's flow: the avatar's Send feedback, words, Send; the mail carries them, the details and a reply-to. */
async function sendFlow(page: Page) {
  const email = await signInFresh(page);
  const marker = `e01-${crypto.randomUUID()}`;
  const f = await openForm(page);
  await expect(f.getByText('It goes straight to the people who make Tudu.').first()).toBeVisible();
  await expect(f.getByRole('switch', { name: 'Include app details' })).toBeChecked();
  await expect(f.getByText(/^Tudu .* on the web, .*, the Today page\. Never your tasks\.$/)).toBeVisible();
  await sendIt(page, f, `The tick came back after a reload. ${marker}`);
  const mail = await oneMail(page, marker);
  expect(mail.replyTo).toBe(email);
  expect(mail.subject).toMatch(/^Something’s wrong: The tick came back after a reload\. e01-[0-9a-f-]+…$/);
  expect(mail.text).toContain('App: Tudu on the web');
  expect(mail.text).toContain('Page: Today, in a personal space');
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
  await expect(f.getByText('or paste or drop one')).toBeVisible();
  await pickShot(page, f, 'Board.png');
  await sendIt(page, f, `With a picture ${marker}`);
  const mail = await oneMail(page, marker);
  expect(mail.attachments?.map((a) => [a.filename, a.type, a.size])).toEqual([
    ['Board.png', 'image/png', PNG.length],
  ]);
}

test.describe('send feedback', () => {
  test('C19-E01 avatar › Send feedback: write, Send, "Sent", the dialog goes and thanks you; the mail has the details', async ({
    page,
  }) => {
    test.skip(phone(), 'phones are E07');
    await sendFlow(page);
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

  test('C19-E05 offline: Send saves with the offline toast; back online, one mail arrives', async ({
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
    await expect(toast(page)).toContainText('Saved. It sends when you’re back online.');
    expect(await mailsAbout(page, marker)).toHaveLength(0);
    await context.setOffline(false);
    const mail = await oneMail(page, marker);
    expect(mail.attachments?.map((a) => a.filename)).toEqual(['Screenshot.png']);
    // And only once, however often the connection comes and goes.
    await context.setOffline(true);
    await context.setOffline(false);
    await page.waitForTimeout(500);
    expect(await mailsAbout(page, marker)).toHaveLength(1);
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

  test('C19-E07 phone: More › Send feedback opens the sheet and sends', async ({ page }) => {
    test.skip(!phone(), 'phone only');
    await signInFresh(page);
    const marker = `e07-${crypto.randomUUID()}`;
    const f = await openForm(page);
    await expect(f).toHaveClass(/sheet/);
    await sendIt(page, f, `From my phone ${marker}`);
    const mail = await oneMail(page, marker);
    expect(mail.text).toMatch(/System: Android \d+, Chrome \d+/);
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

  test('C19-E09 the kit: empty, with a screenshot, sending and sent, light and dark; nothing overflows at phone width', async ({
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
    ] as const) {
      const block = page.getByRole('region', { name: title, exact: true });
      // Light, then dark: each Pair draws both.
      for (const i of [0, 1]) await check(block.locator('.kit-desk').nth(i));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const over = await page.evaluate(() => {
      const past: string[] = [];
      for (const el of document.querySelectorAll('#send-feedback .tp-fb *')) {
        const r = el.getBoundingClientRect();
        const box = el.closest('.kit-desk')!.getBoundingClientRect();
        if (r.width && r.right > box.right + 1) past.push(el.className.toString());
      }
      return past;
    });
    expect(over).toEqual([]);
  });
});
