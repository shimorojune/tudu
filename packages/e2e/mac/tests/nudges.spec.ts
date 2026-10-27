import { asPage, expect, go, signIn, test, writeTask, type Space, type TuduApp as App } from '../harness';

/**
 * Working hours and nudges in Tudu Test, the real app. The page's nudge clock is moved with `__tuduNudgeClock` (and a
 * window focus, which makes it look at once), so a working day runs in seconds. What Tudu posted is read back over the
 * control channel (`notify-status`), whether or not macOS lets Tudu Test show it: CI's Mac never allows it, Rohit's
 * does (Tudu Test turned on in System Settings › Notifications).
 */

const today = () => new Date().toLocaleDateString('en-CA');
/** A weekday on or after today, so the default hours (Monday to Friday) apply. */
function workday(): string {
  const d = new Date();
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

interface NotifyStatus {
  available: boolean;
  permission: 'unknown' | 'allowed' | 'denied' | 'unavailable';
  delivered: number | null;
  last: { posted: { id: string; title: string; body: string } | null };
}
const status = (app: App) => app.act('notify-status') as Promise<NotifyStatus>;

/** The page's clock for nudges, then a look at it. */
async function clock(app: App, day: string, hhmm: string): Promise<void> {
  await app.eval(
    `window.__tuduNudgeClock = ${JSON.stringify(`${day}T${hhmm}:00`)}; window.dispatchEvent(new Event('focus'));`,
  );
}

async function posted(app: App, title: string): Promise<NotifyStatus> {
  await expect.poll(async () => (await status(app)).last.posted?.title, { timeout: 10_000 }).toBe(title);
  return status(app);
}

async function personal(app: App): Promise<Space> {
  const me = await asPage<{ spaces: Space[] }>(app, 'GET', '/api/me');
  return me.spaces.find((s) => s.kind === 'personal')!;
}

/** Settings › Working hours, Nudges switched on. */
async function nudgesOn(app: App): Promise<NotifyStatus['permission']> {
  await go(app, '/me?settings=hours');
  // Before any slot, so the real clock can't send one mid-test (a reload forgets it, so after the page is up).
  await clock(app, workday(), '07:00');
  await app.until(`return T.all('switch', 'Nudge me in my hours').length > 0`);
  await app.eval(`T.click(T.get('switch', 'Nudge me in my hours'))`);
  // Where nobody answers macOS's box (CI's Mac), it can stay up for Tudu's whole two-minute wait: still unknown.
  await app
    .until(`return !document.body.textContent.includes('Allow Tudu in the box macOS just showed.')`)
    .catch(() => {});
  return (await status(app)).permission;
}

test.describe('working hours and nudges', () => {
  test('WH-D01 Settings › Working hours in the app has Nudges; switching on asks macOS and shows the rows or the way to allow it', async ({
    app,
  }) => {
    await signIn(app);
    const permission = await nudgesOn(app);
    expect(await app.eval(`return T.get('heading', 'Working hours') !== null`)).toBe(true);
    expect(
      await app.eval(`return T.get('switch', 'Nudge me in my hours').getAttribute('aria-checked')`),
    ).toBe('true');
    // What Settings shows: the rows, the guide, macOS's box still up, or (asked, nobody answered) neither.
    const shows = await app.eval<string>(`
      const open = (role, name) => T.all(role, name).some((el) => !el.closest('[aria-hidden="true"]'));
      const text = document.body.textContent;
      if (open('group', 'How often')) return 'rows';
      if (text.includes('macOS has Tudu’s notifications off.')) return 'guide';
      if (text.includes('Allow Tudu in the box macOS just showed.')) return 'asking';
      return 'neither';`);
    if (permission === 'allowed') {
      expect(shows).toBe('rows');
      await app.until(`return T.all('button', 'Send now').length > 0`);
    } else if (shows === 'guide') {
      expect(permission).toBe('denied');
      await app.until(`return T.all('button', 'Open Notification settings').length > 0`);
      await app.until(`return T.all('list', 'How to allow Tudu').length > 0`);
    } else {
      // CI's Mac: nobody answers macOS's box, so it is still up or went without an answer. Neither rows nor guide.
      expect(['asking', 'neither']).toContain(shows);
      expect(permission).not.toBe('allowed');
    }
  });

  test('WH-D02 with the window hidden: 09:00 says the start of the day; three ticked by 10:00 say so', async ({
    app,
  }) => {
    await signIn(app);
    const space = await personal(app);
    const day = workday();
    const ids: string[] = [];
    for (const t of [
      'Send invoice',
      'Call the bank',
      'Pay rent',
      'Book flights',
      'Water plants',
      'Read the brief',
    ])
      ids.push(await writeTask(app, space.id, t, day));
    await nudgesOn(app);
    await app.act('close');
    await clock(app, day, '09:00');
    await posted(app, '6 on today');
    const at = new Date().toISOString();
    await asPage(app, 'POST', '/api/sync', {
      clientId: 'mac-seed',
      mutations: ids
        .slice(0, 3)
        .map((id) => ({ id: crypto.randomUUID(), type: 'task.cross', payload: { id, done: true }, at })),
    });
    await clock(app, day, '10:00');
    const s = await posted(app, '3 done, 3 left today');
    expect(s.last.posted!.id).toBe('tudu.nudge');
    expect(s.last.posted!.body).toMatch(/^3 since 09:00\. Next: /);
  });

  test('WH-D03 one nudge in Notification Center after three slots (where macOS allows Tudu Test)', async ({
    app,
  }) => {
    await signIn(app);
    await writeTask(app, (await personal(app)).id, 'Call the bank', workday());
    test.skip(
      (await nudgesOn(app)) !== 'allowed',
      'needs Tudu Test allowed in System Settings › Notifications',
    );
    for (const t of ['09:00', '10:00', '11:00']) {
      await clock(app, workday(), t);
      await expect.poll(async () => (await status(app)).last.posted !== null).toBe(true);
    }
    await expect.poll(async () => (await status(app)).delivered).toBe(1);
  });

  test('WH-D04 Pause for today: nothing at the next slot; the next working day nudges again', async ({
    app,
  }) => {
    await signIn(app);
    const day = workday();
    await writeTask(app, (await personal(app)).id, 'Call the bank', day);
    test.skip((await nudgesOn(app)) !== 'allowed', 'Pause shows once macOS allows Tudu Test');
    await clock(app, day, '09:00');
    await posted(app, '1 on today');
    await app.act('notify', { title: 'marker', body: '' });
    await app.eval(`T.click(T.get('button', 'Pause for today'))`);
    await app.until(`return T.all('button', 'Resume').length > 0`);
    await clock(app, day, '10:00');
    await app.eval(`await new Promise((r) => setTimeout(r, 1500))`);
    expect((await status(app)).last.posted?.title).toBe('marker');
    const next = new Date(`${day}T12:00:00`);
    do next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6);
    await clock(app, next.toLocaleDateString('en-CA'), '09:00');
    // The unfinished task carries to the next working day, so its first nudge has it.
    await posted(app, '1 on today');
  });

  test('WH-D05 Send now outside your hours says today as it is', async ({ app }) => {
    await signIn(app);
    await writeTask(app, (await personal(app)).id, 'Call the bank', today());
    const permission = await nudgesOn(app);
    test.skip(permission !== 'allowed', 'Send now shows only once macOS allows Tudu Test');
    await clock(app, today(), '21:30');
    await app.eval(`T.click(T.get('button', 'Send now'))`);
    await posted(app, '1 left today');
    await app.until(
      `return document.body.textContent.includes('Sent. It shows at the top right of your screen.')`,
    );
  });

  test('WH-D06 waking at 13:20 sends one; at 13:40 it waits for 14:00', async ({ app }) => {
    await signIn(app);
    await writeTask(app, (await personal(app)).id, 'Call the bank', workday());
    await nudgesOn(app);
    const day = workday();
    await clock(app, day, '12:00');
    await posted(app, '1 left today');
    await app.act('notify', { title: 'marker', body: '' });
    await clock(app, day, '13:20');
    await posted(app, '1 left today');
    await app.act('notify', { title: 'marker', body: '' });
    await clock(app, day, '13:40');
    await app.eval(`await new Promise((r) => setTimeout(r, 1500))`);
    expect((await status(app)).last.posted?.title).toBe('marker');
    await clock(app, day, '14:00');
    await posted(app, '1 left today');
  });
});
