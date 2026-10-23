import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  alive,
  API,
  asPage,
  copyBundle,
  expect,
  feedDown,
  freshFolder,
  go,
  onToday,
  person,
  publish,
  run,
  sidebarInbox,
  signIn,
  teamSpace,
  test,
  TuduApp,
  WEB,
  writeTask,
  type Space,
  type TuduApp as App,
} from '../harness';

/**
 * Tudu Test, the real app, on this Mac: its windows, tray, summon, updater, dock badge and links, driven over the
 * control channel. Each test launches the app on a fresh folder with its own user on the run's throwaway database.
 */

/** The day as the app sees it (your Mac's calendar). */
const today = () => new Date().toLocaleDateString('en-CA');
const floatingShown = (a: App) => a.waitState((s) => s.windows.floating.visible);
const floatingHidden = (a: App) => a.waitState((s) => !s.windows.floating.visible);

const sheetShown = (a: App) => a.waitState((s) => s.windows.menubar.visible);
const sheetHidden = (a: App) => a.waitState((s) => !s.windows.menubar.visible);

/** A click on the tick: the sheet under it, its page ready. */
async function openSheet(app: App): Promise<void> {
  await app.act('tray');
  await sheetShown(app);
  await app.until(`return !!document.querySelector('.tp-mb')`, 'menubar');
}

/** The sheet on your day (signed in, its days read), not the signed-out face it starts with. */
const sheetDay = (app: App) =>
  app.until(`return !!document.querySelector('[role=dialog][aria-label="Today"]')`, 'menubar');

/** ⋯ › Quit Tudu Test, in the sheet, signed in. */
async function quitFromSheet(app: App): Promise<void> {
  await openSheet(app);
  await sheetDay(app);
  await app.eval(
    `if (!T.all('button', /^Quit Tudu Test/).length) T.click(T.get('button', 'More'))`,
    'menubar',
  );
  await app.until(`return T.all('button', /^Quit Tudu Test/).length > 0`, 'menubar');
  // After the answer goes back: the app may be gone before it could reply.
  await app.eval(`const q = T.get('button', /^Quit Tudu Test/); setTimeout(() => T.click(q), 50)`, 'menubar');
}

/** Another app comes forward, as a click on it would bring it. */
function clickAnotherApp(): void {
  spawnSync('osascript', ['-e', 'tell application "Finder" to activate']);
}

/** Your Personal space, as the page's person. */
async function personal(app: App): Promise<Space> {
  const me = await asPage<{ spaces: Space[] }>(app, 'GET', '/api/me');
  return me.spaces.find((s) => s.kind === 'personal')!;
}

/** A team space with you and a second person in it (they joined from the invite). */
async function withSecond(app: App, name = 'Northwind') {
  const b = await person();
  const space = await teamSpace(app, name, [b.email]);
  const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(b.email)}`)).json()) as {
    mails: Array<{ subject: string; text: string }>;
  };
  const token = /\/join\/([A-Za-z0-9_-]+)/.exec(
    mails.mails.filter((m) => /invited you/.test(m.subject)).at(-1)!.text,
  )![1];
  await b.call('POST', `/api/join/${token}`);
  const me = await asPage<{ user: { id: string } }>(app, 'GET', '/api/me');
  return { b, space, meId: me.user.id };
}

const ITEM = (v: string) => `Tudu Test is ready: version ${v}`;
/** The version's row in the Updates list, as a page expression. */
const row = (v: string) =>
  `T.all('article', ${JSON.stringify(ITEM(v))}).find((a) => a.closest('[aria-label="Updates"]'))`;
const hasRow = (v: string) => `return !!(${row(v)})`;
const rowIsNew = (v: string) => `return (${row(v)}).querySelector('[aria-label="New"]') !== null`;
const openRow = (v: string) => `T.click((${row(v)}).querySelector('button'))`;

test.describe('desktop', () => {
  test('C11-D01 launch: Sign in, the code typed in the real page lands on Today; the track, the summon, the tray, no badge', async ({
    app,
  }) => {
    const s = await app.state();
    expect(s.track).toBe('test');
    expect(s.identifier).toBe('net.ezdev.tudu.test');
    expect(s.version).toBe(run().current.version);
    expect(s.shortcut).toEqual({ accelerator: 'CommandOrControl+Shift+N', registered: true });
    expect(s.tray.tooltip).toBe('Tudu Test');
    // No native menu (chunk 20): the tick opens today from the menu bar, which has Open, New task and Quit.
    expect(s.tray.items).toEqual([]);
    expect(s.badge).toBeNull();
    expect(s.windows.main.visible).toBe(true);
    // The window opens Tudu on the web (the harness's), on Sign in.
    await app.waitState((x) => x.windows.main.url === `${WEB}/sign-in`);
    expect(s.windows.floating.visible).toBe(false);
    await signIn(app);
    await app.waitState((x) => x.seen.signedIn);
    expect((await app.state()).badge).toBeNull();
  });

  test('C11-D02 the window: no title bar, room for the lights; close hides it and drops the Dock icon; the sheet and the reopen bring it back; Quit ends it', async ({
    app,
  }) => {
    await signIn(app);
    expect(await app.eval(`return document.documentElement.dataset.app`)).toBe('desktop');
    expect(
      await app.eval(`return getComputedStyle(document.querySelector('.app-side .tp-sidebar')).paddingTop`),
    ).toBe('50px');
    expect(
      await app.eval(`return !!document.querySelector('header.tp-topbar[data-tauri-drag-region]')`),
    ).toBe(true);
    const pid = (await app.state()).pid;
    expect((await app.state()).background.policy).toBe('regular');

    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible && s.background.policy === 'accessory');
    expect(alive(pid)).toBe(true);
    await openSheet(app);
    await sheetDay(app);
    await app.eval(`T.click(T.get('button', 'Open Tudu Test'))`, 'menubar');
    await app.waitState(
      (s) =>
        s.windows.main.visible &&
        s.windows.main.focused &&
        !s.windows.menubar.visible &&
        s.background.policy === 'regular',
    );

    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible && s.background.policy === 'accessory');
    await app.act('reopen');
    await app.waitState((s) => s.windows.main.visible && s.background.policy === 'regular');

    await quitFromSheet(app);
    const code = await new Promise<number | null>((r) => app.child!.once('exit', (c) => r(c)));
    expect(code).toBe(0);
    expect(alive(pid)).toBe(false);
  });

  test('C11-D03 the summon: always on top, focused, top centre, 640 wide; the desk stays as it was; again or Esc hides it', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('summon');
    const s = await app.waitState((x) => x.windows.floating.visible && x.windows.floating.focused);
    const f = s.windows.floating;
    expect(f.alwaysOnTop).toBe(true);
    expect(f.decorated).toBe(false);
    expect(f.width).toBe(640);
    const scr = f.screen!;
    expect(Math.abs(f.x - (scr.x + (scr.width - 640) / 2))).toBeLessThanOrEqual(1);
    expect(f.y - scr.y).toBe(Math.min(140, Math.floor(scr.height / 4)));
    // The desk stays visible but never comes forward for it.
    expect(s.windows.main.visible).toBe(true);
    expect(s.windows.main.focused).toBe(false);
    // The line is ready to write in.
    await app.until(`return document.activeElement === T.get('textbox', 'Task title')`, 'floating');

    await app.act('summon');
    await floatingHidden(app);
    // A hidden desk stays hidden.
    await app.act('close', { window: 'main' });
    await app.waitState((x) => !x.windows.main.visible);
    await app.act('summon');
    await floatingShown(app);
    expect((await app.state()).windows.main.visible).toBe(false);
    await app.eval(`T.press('Escape')`, 'floating');
    await floatingHidden(app);
    expect((await app.state()).windows.main.visible).toBe(false);
  });

  test('C11-D04 add from the floating bar: the tick, then gone; the task on the server and on the desk’s Today live; a draft stays', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('summon');
    await floatingShown(app);
    await app.until(`return !!T.all('textbox', 'Task title')[0]`, 'floating');
    await app.eval(
      `T.fill(T.get('textbox', 'Task title'), 'Call the venue'); T.click(T.get('button', 'Add task'));`,
      'floating',
    );
    await app.until(`return T.all('button', 'Added').length > 0`, 'floating', 3000);
    const added = Date.now();
    await floatingHidden(app);
    expect(Date.now() - added).toBeLessThan(1500);
    // On the server, and on the desk without a reload.
    const space = await personal(app);
    const day = await asPage<{ tasks: Array<{ title: string }> }>(
      app,
      'GET',
      `/api/spaces/${space.id}/days/${today()}`,
    );
    expect(day.tasks.map((t) => t.title)).toContain('Call the venue');
    await app.until(`return document.body.innerText.includes('Call the venue')`);

    await app.act('summon');
    await floatingShown(app);
    await app.eval(`T.fill(T.get('textbox', 'Task title'), 'Half a thought')`, 'floating');
    await app.act('summon');
    await floatingHidden(app);
    await app.act('summon');
    await floatingShown(app);
    expect(await app.eval(`return T.get('textbox', 'Task title').value`, 'floating')).toBe('Half a thought');
  });

  test('C11-D05 not signed in: the summon shows the desk on Sign in and the floating window stays hidden; after signing in it works', async ({
    app,
  }) => {
    await app.waitState((s) => s.windows.main.url.endsWith('/sign-in'));
    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible);
    await app.act('summon');
    const s = await app.waitState((x) => x.windows.main.visible && x.windows.main.focused);
    expect(s.windows.floating.visible).toBe(false);
    expect(s.windows.main.url).toBe(`${WEB}/sign-in`);
    await signIn(app);
    await app.waitState((x) => x.seen.signedIn);
    await app.act('summon');
    await floatingShown(app);
    await app.until(`return !!T.all('textbox', 'Task title')[0]`, 'floating');
  });

  test.describe('with the next version on the feed', () => {
    test.use({ release: 'next' });

    test('C11-D06 an update is ready: checked on launch, downloaded and verified; the Inbox count rises; read stays read', async ({
      app,
    }) => {
      const next = run().next.version;
      const s = await app.waitState((x) => x.updater.lastResult === 'ready');
      expect(s.updater.ready?.version).toBe(next);
      expect(s.updater.downloads).toBe(1);
      expect(s.updater.error).toBeNull();
      await signIn(app);
      const space = await teamSpace(app, 'Northwind');
      await expect.poll(() => sidebarInbox(app)).toBe(1);
      await go(app, `/${space.slug}/inbox`);
      await app.until(hasRow(next));
      expect(await app.eval(rowIsNew(next))).toBe(true);
      await app.eval(openRow(next));
      await app.until(
        `return !!document.querySelector('.tp-ix-full') && document.querySelector('.tp-ix-full').innerText.includes('The floating bar keeps your draft')`,
      );
      await app.until(
        `return T.all('button', 'What’s new').length === 1 && T.all('button', 'Restart to update').length === 1`,
      );
      await expect.poll(() => sidebarInbox(app)).toBe(0);
      // Hide and show: still read.
      await app.act('close', { window: 'main' });
      await app.act('reopen');
      await app.waitState((x) => x.windows.main.visible);
      await go(app, `/${space.slug}/inbox`);
      await app.until(hasRow(next));
      expect(await app.eval(rowIsNew(next))).toBe(false);
    });

    test('C11-D07 Restart to update: Restarting…, the app relaunches on the new version, the item is gone, still signed in', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'ready');
      await signIn(app);
      const space = await teamSpace(app, 'Northwind');
      await go(app, `/${space.slug}/inbox`);
      await app.until(hasRow(next));
      await app.eval(openRow(next));
      const old = (await app.state()).pid;
      await app.eval(`T.click(T.get('button', 'Restart to update'))`);
      // The old process goes, a new one answers on the same channel with the new version.
      await app.waitState((x) => x.pid !== old && x.version === next, 60_000);
      expect(alive(old)).toBe(false);
      await app.ready();
      // Up to date now: nothing ready, no item.
      await app.waitState((x) => x.updater.lastResult === 'none', 20_000);
      await onToday(app);
      expect(new URL((await app.state()).windows.main.url).origin).toBe(WEB);
      await go(app, `/${space.slug}/inbox`);
      await app.until(`return !!document.querySelector('[aria-label="The Inbox"]')`);
      expect(await app.eval(hasRow(next))).toBe(false);
      expect(await sidebarInbox(app)).toBe(0);
    });

    test('C11-D12 two spaces in the app: the version in both Inboxes, read together; the dock counts it once', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'ready');
      await signIn(app);
      const nw = await teamSpace(app, 'Northwind');
      const acme = await teamSpace(app, 'Acme');
      await app.waitState((x) => x.badge === '1');
      for (const sp of [nw, acme]) {
        await go(app, `/${sp.slug}/inbox`);
        await app.until(hasRow(next));
        expect(await app.eval(rowIsNew(next))).toBe(true);
      }
      await app.eval(openRow(next));
      await app.waitState((x) => x.badge === null);
      await go(app, `/${nw.slug}/inbox`);
      await app.until(hasRow(next));
      expect(await app.eval(rowIsNew(next))).toBe(false);
    });
  });

  test.describe('with a bad signature on the feed', () => {
    test.use({ release: 'bad' });

    test('C11-D08 update failures: a bad signature is refused, a dead feed shows nothing, a good bundle next time shows the item', async ({
      app,
    }) => {
      const r = run();
      const s = await app.waitState((x) => x.updater.lastResult === 'error');
      expect(s.updater.ready).toBeNull();
      expect(s.updater.error).toMatch(/signature/i);
      await signIn(app);
      const space = await teamSpace(app, 'Northwind');
      await go(app, `/${space.slug}/inbox`);
      await app.until(`return !!document.querySelector('[aria-label="The Inbox"]')`);
      expect(await app.eval(hasRow(r.next.version))).toBe(false);

      await feedDown();
      await app.act('check-update');
      const down = await app.state();
      expect(down.updater.lastResult).toBe('error');
      expect(down.updater.ready).toBeNull();
      expect(await sidebarInbox(app)).toBe(0);

      await publish(r.next.version, r.next.update, r.next.signature);
      await app.act('check-update');
      await app.waitState((x) => x.updater.ready?.version === r.next.version);
      await app.until(hasRow(r.next.version));
      await expect.poll(() => sidebarInbox(app)).toBe(1);
    });
  });

  test('C11-D09 the dock badge: a task sent to you is 1, a comment 2, across two spaces one count; answering and reading clear it', async ({
    app,
  }) => {
    await signIn(app);
    const { b, space, meId } = await withSecond(app);
    const sync = (mutations: unknown[]) => b.call('POST', '/api/sync', { clientId: 'b', mutations });
    const at = () => new Date().toISOString();
    const requestId = crypto.randomUUID();
    await sync([
      {
        id: crypto.randomUUID(),
        type: 'request.send',
        payload: {
          id: requestId,
          spaceId: space.id,
          toId: meId,
          title: 'Proofread the brochure',
          askedDay: today(),
        },
        at: at(),
      },
    ]);
    await app.waitState((x) => x.badge === '1');
    const taskId = await writeTask(app, space.id, 'Plan the retro', today());
    await sync([
      {
        id: crypto.randomUUID(),
        type: 'comment.create',
        payload: { id: crypto.randomUUID(), taskId, html: '<p>Thursday?</p>' },
        at: at(),
      },
    ]);
    await app.waitState((x) => x.badge === '2');
    // A second space, a request there too: one count on the dock.
    const acme = await withSecond(app, 'Acme');
    const second = crypto.randomUUID();
    await acme.b.call('POST', '/api/sync', {
      clientId: 'c',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'request.send',
          payload: {
            id: second,
            spaceId: acme.space.id,
            toId: meId,
            title: 'Order the badges',
            askedDay: today(),
          },
          at: at(),
        },
      ],
    });
    await app.waitState((x) => x.badge === '3');
    // Reading the comment in the Inbox, then answering both requests there.
    const inbox = await asPage<{ updates: Array<{ id: string }> }>(
      app,
      'GET',
      `/api/spaces/${space.id}/inbox`,
    );
    await go(app, `/${space.slug}/inbox/${inbox.updates[0]!.id}`);
    await app.waitState((x) => x.badge === '2');
    for (const [sp, id] of [
      [space, requestId],
      [acme.space, second],
    ] as const) {
      await go(app, `/${sp.slug}/inbox`);
      await app.until(`return T.all('article', /Proofread the brochure|Order the badges/).length > 0`);
      await app.eval(
        `T.click(T.all('article', /Proofread the brochure|Order the badges/)[0].querySelector('button'))`,
      );
      await app.until(`return T.all('button', 'Decline').length > 0`);
      await app.eval(`T.click(T.get('button', 'Decline'))`);
      await app.until(`return T.all('textbox', 'Reason for declining').length > 0`);
      await app.eval(
        `T.fill(T.get('textbox', 'Reason for declining'), 'Not this week'); T.click(T.get('button', 'Send'))`,
      );
      void id;
    }
    await app.waitState((x) => x.badge === null);
  });

  test('C11-D10 links and files: Open in Jira and an outside link go to the default browser, never the window; a chip lands in Downloads', async ({
    app,
    folder,
  }) => {
    await signIn(app);
    const space = await personal(app);
    // Open in Jira: connected to the fake Jira, from the issue's preview.
    await asPage(app, 'POST', `/api/spaces/${space.id}/jira`, {
      site: `${API}/__test/jira`,
      token: `good-${crypto.randomUUID()}`,
    });
    await go(app, `/${space.slug}?jira=TUDU-212`);
    await app.until(`return T.all('button', 'Open TUDU-212 in Jira').length > 0`, 'main', 15_000);
    const before = (await app.state()).windows.main.url;
    await app.eval(`T.click(T.get('button', 'Open TUDU-212 in Jira'))`);
    await app.waitState((x) => x.seen.opened.includes(`${API}/__test/jira/browse/TUDU-212`));

    // A file in a task's notes, and a link out.
    const file = await app.eval<{ id: string; name: string; size: number }>(`
      const form = new FormData();
      form.append('file', new File([new Uint8Array(2048).fill(7)], 'Q3 plan.pdf', { type: 'application/pdf' }));
      const r = await fetch(${JSON.stringify(`${API}/api/spaces/`)} + ${JSON.stringify(space.id)} + '/files', { method: 'POST', credentials: 'include', body: form });
      return r.json();`);
    const notes = `<p>The plan: <a class="tp-att" href="/api/files/${file.id}" data-id="${file.id}" data-name="Q3 plan.pdf" data-size="2048"><span class="tp-att-i"></span>Q3 plan.pdf<span class="tp-att-s">2 KB</span></a></p>`;
    const taskId = await writeTask(app, space.id, 'Read the plan', today(), notes);
    // A link out, in a comment (links in the notes editor are for editing; in a comment they are followed).
    await asPage(app, 'POST', '/api/sync', {
      clientId: 'mac-seed',
      mutations: [
        {
          id: crypto.randomUUID(),
          type: 'comment.create',
          payload: {
            id: crypto.randomUUID(),
            taskId,
            html: '<p><a href="https://example.com/brief">The brief</a></p>',
          },
          at: new Date().toISOString(),
        },
      ],
    });
    await go(app, `/${space.slug}`);
    // Open the task: the day list redraws once it settles, so the click is tried again until the panel is open.
    await app.until(`
      if (document.querySelector('[role=dialog] a.tp-att')) return true;
      const row = T.all('button', 'Read the plan')[0];
      if (row && !document.querySelector('[role=dialog]')) T.click(row);
      return false;`);
    await app.eval(`document.querySelector('[role=dialog] a.tp-att').click()`);
    const saved = join(folder, 'Downloads', 'Q3 plan.pdf');
    await app.waitState((x) => x.seen.saved.includes(saved));
    expect(readFileSync(saved).length).toBe(2048);
    await app.until(
      `return [...document.querySelectorAll('.tp-toast')].some((t) => t.innerText.includes('Saved to Downloads.'))`,
    );
    await app.eval(
      `[...document.querySelectorAll('[role=dialog] a')].find((a) => a.textContent === 'The brief').click()`,
    );
    await app.waitState((x) => x.seen.opened.includes('https://example.com/brief'));
    // Even a page moving itself elsewhere is handed out, and the window stays put.
    await app.eval(`location.href = 'https://example.com/elsewhere'`).catch(() => {});
    const s = await app.waitState((x) => x.seen.opened.includes('https://example.com/elsewhere'));
    expect(new URL(s.windows.main.url).origin).toBe(new URL(before).origin);
  });

  test('C20-D01 a click on the tick shows the sheet under it; again hides it; either button opens it; no native menu', async ({
    app,
  }) => {
    await signIn(app);
    const before = await app.state();
    expect(before.tray.items).toEqual([]);
    expect(before.windows.menubar.visible).toBe(false);
    await openSheet(app);
    const s = await app.state();
    const m = s.windows.menubar;
    expect(m.alwaysOnTop).toBe(true);
    expect(m.decorated).toBe(false);
    expect(m.width).toBe(360);
    // Under the tick, on its screen.
    const r = s.tray.rect;
    if (r && m.screen) {
      const scale = (await app.eval<number>(`return window.devicePixelRatio`, 'menubar')) || 1;
      expect(m.y).toBeGreaterThanOrEqual((r.y + r.height) / scale - 1);
      expect(m.x).toBeGreaterThanOrEqual(m.screen.x);
      expect(m.x + m.width).toBeLessThanOrEqual(m.screen.x + m.screen.width);
    }
    // The desk stays where it was.
    expect(s.windows.main.focused).toBe(false);
    await app.act('tray');
    await sheetHidden(app);
    await app.act('tray', { button: 'right' });
    await sheetShown(app);
    await app.act('tray');
    await sheetHidden(app);
  });

  test('C20-D02 with the desk hidden: tick a task in the sheet, Open Tudu, and the desk shows it ticked', async ({
    app,
  }) => {
    await signIn(app);
    const space = await personal(app);
    await writeTask(app, space.id, 'Water the plants', today());
    await app.act('close', { window: 'main' });
    await app.waitState((x) => !x.windows.main.visible);
    await openSheet(app);
    await app.until(`return T.all('checkbox', 'Water the plants').length > 0`, 'menubar');
    await app.eval(`T.click(T.get('checkbox', 'Water the plants'))`, 'menubar');
    await app.until(
      `return T.get('checkbox', 'Water the plants').getAttribute('aria-checked') === 'true'`,
      'menubar',
    );
    await app.eval(`T.click(T.get('button', 'Open Tudu Test'))`, 'menubar');
    await app.waitState((x) => x.windows.main.visible && !x.windows.menubar.visible);
    await app.until(
      `return T.all('checkbox', /Water the plants/).some((c) => c.getAttribute('aria-checked') === 'true')`,
    );
  });

  test('C20-D03 a title brings the desk forward on that task with its panel open, and the sheet goes', async ({
    app,
  }) => {
    await signIn(app);
    const space = await personal(app);
    await writeTask(app, space.id, 'Renew the passport', today());
    await openSheet(app);
    await app.until(`return T.all('button', 'Open Renew the passport in Tudu').length > 0`, 'menubar');
    await app.eval(`T.click(T.get('button', 'Open Renew the passport in Tudu'))`, 'menubar');
    await app.waitState(
      (x) => x.windows.main.visible && x.windows.main.focused && !x.windows.menubar.visible,
    );
    await app.until(`return location.search.includes('task=')`);
    await app.until(`return !!document.querySelector('[role=dialog][aria-label="Task details"]')`);
  });

  test('C20-D04 clicking another app hides the sheet; so does Esc', async ({ app }) => {
    await signIn(app);
    await openSheet(app);
    clickAnotherApp();
    await sheetHidden(app);
    // Past the grace that keeps the blurring click on the tick from reopening it.
    await new Promise((r) => setTimeout(r, 400));
    await openSheet(app);
    await app.eval(`T.press('Escape')`, 'menubar');
    await sheetHidden(app);
  });

  test('C20-D05 ⋯ › Quit ends the process, signed in and signed out', async ({ app }) => {
    // Signed out first: the sheet says Sign in, and ⋯ has Quit alone.
    await openSheet(app);
    await app.until(`return T.all('heading', 'Sign in to see your day.').length > 0`, 'menubar');
    await app.eval(`T.click(T.get('button', 'More'))`, 'menubar');
    expect(await app.until<number>(`return T.all('[role=menuitem]').length`, 'menubar')).toBe(1);
    // The tick puts the sheet away before signing in on the desk.
    await app.act('tray');
    await sheetHidden(app);
    await signIn(app);
    const pid = (await app.state()).pid;
    const exited = new Promise<number | null>((r) => app.child!.once('exit', (c) => r(c)));
    await quitFromSheet(app);
    expect(await exited).toBe(0);
    expect(alive(pid)).toBe(false);
  });

  test('C11-D11 across launches: still signed in, the theme holds, the floating draft holds; a fresh folder starts clean', async ({
    app,
  }) => {
    await signIn(app);
    await go(app, `/me?settings=appearance`);
    await app.until(`return T.all('[role=radio]').some((r) => r.innerText.trim().startsWith('Dark'))`);
    await app.eval(`T.click(T.all('[role=radio]').find((r) => r.innerText.trim().startsWith('Dark')))`);
    await app.until(`return document.documentElement.classList.contains('dark')`);
    await app.act('summon');
    await floatingShown(app);
    await app.until(`return !!T.all('textbox', 'Task title')[0]`, 'floating');
    await app.eval(`T.fill(T.get('textbox', 'Task title'), 'Half a thought')`, 'floating');
    await app.act('summon');
    await floatingHidden(app);
    await app.quit();

    await app.launch();
    await onToday(app);
    expect(await app.eval(`return document.documentElement.classList.contains('dark')`)).toBe(true);
    await app.waitState((x) => x.seen.signedIn);
    await app.act('summon');
    await floatingShown(app);
    await app.until(`return T.get('textbox', 'Task title').value === 'Half a thought'`, 'floating');

    // A second launch on a fresh folder knows nobody.
    const dir = freshFolder();
    await app.quit();
    const other = new TuduApp(dir, copyBundle(run().current.app, dir));
    try {
      await other.launch();
      await other.waitState((x) => x.windows.main.url === `${WEB}/sign-in`);
      expect(existsSync(join(dir, 'Downloads'))).toBe(false);
    } finally {
      await other.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('C17-D01 the summon says where: the floating bar opens on the space the desk was last on, and adds there', async ({
    app,
  }) => {
    await signIn(app);
    const space = await teamSpace(app, 'Northwind');
    await app.act('summon');
    await floatingShown(app);
    const line = await app.until<string>(
      `const l = document.querySelector('.tp-qa-toline'); return l && l.textContent`,
      'floating',
    );
    expect(line).toMatch(/^In.*Northwind.*for.*Me$/);
    await app.eval(
      `T.fill(T.get('textbox', 'Task title'), 'Book the offsite'); T.click(T.get('button', 'Add task'));`,
      'floating',
    );
    await floatingHidden(app);
    const day = await asPage<{ tasks: Array<{ title: string }> }>(
      app,
      'GET',
      `/api/spaces/${space.id}/days/${today()}`,
    );
    expect(day.tasks.map((t) => t.title)).toContain('Book the offsite');
  });
});

/** Settings › This Mac on the desk. */
async function thisMac(app: App): Promise<void> {
  await go(app, `/me?settings=mac`);
  await app.until(
    `return T.all('heading', 'This Mac').length > 0 && T.all('[role=switch]', 'Open at login').length > 0`,
  );
}
const loginSwitchOn = `return T.get('[role=switch]', 'Open at login').getAttribute('aria-checked') === 'true'`;
const loginSwitchOff = `return T.get('[role=switch]', 'Open at login').getAttribute('aria-checked') === 'false'`;
const dockChoice = (label: string) =>
  `T.click(T.get('button', ${JSON.stringify(label)}, document.querySelector('[role=group][aria-label="Show Tudu in the Dock"]')))`;

/** A request from the second person to you, in their space. */
async function sendRequest(
  b: { call: <T>(m: string, p: string, body?: unknown) => Promise<T> },
  spaceId: string,
  toId: string,
  title: string,
) {
  await b.call('POST', '/api/sync', {
    clientId: 'b',
    mutations: [
      {
        id: crypto.randomUUID(),
        type: 'request.send',
        payload: { id: crypto.randomUUID(), spaceId, toId, title, askedDay: today() },
        at: new Date().toISOString(),
      },
    ],
  });
}

test.describe('background', () => {
  test('C16-D01 close: hidden, no Dock icon, still running and awake; Open Tudu from the sheet brings it back in front', async ({
    app,
  }) => {
    await signIn(app);
    const s = await app.state();
    expect(s.background).toMatchObject({
      policy: 'regular',
      dock: 'open',
      deskOpen: true,
      atLogin: false,
      awake: true,
    });
    // The pages are never put to sleep while hidden.
    expect(s.background.webviews).toEqual({ main: 2, floating: 2, menubar: 2 });
    const pid = s.pid;

    await app.act('close', { window: 'main' });
    const hidden = await app.waitState((x) => !x.windows.main.visible && x.background.policy === 'accessory');
    expect(hidden.background.deskOpen).toBe(false);
    expect(hidden.background.awake).toBe(true);
    expect(alive(pid)).toBe(true);

    await openSheet(app);
    await sheetDay(app);
    await app.eval(`T.click(T.get('button', 'Open Tudu Test'))`, 'menubar');
    const back = await app.waitState(
      (x) => x.windows.main.visible && x.windows.main.focused && x.background.policy === 'regular',
    );
    expect(back.background.deskOpen).toBe(true);
  });

  test('C16-D02 hidden for a while: a task sent to you arrives, the count rides beside the tick, then moves to the Dock when the window opens', async ({
    app,
  }) => {
    await signIn(app);
    const { b, space, meId } = await withSecond(app);
    // Written just before closing: it reaches the API though the window is gone.
    const own = await personal(app);
    await app.eval(
      `fetch(${JSON.stringify(API)} + '/api/sync', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'mac-close', mutations: [{ id: crypto.randomUUID(), type: 'task.create', payload: { id: crypto.randomUUID(), spaceId: ${JSON.stringify(own.id)}, title: 'Last thing before closing', day: ${JSON.stringify(today())}, position: 1024 }, at: new Date().toISOString() }] }) })`,
    );
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    // A while hidden: long enough for anything that would park the page to have done so.
    await new Promise((r) => setTimeout(r, 15_000));
    await sendRequest(b, space.id, meId, 'Proofread the brochure');
    const s = await app.waitState((x) => x.background.trayTitle === '1', 15_000);
    expect(s.badge).toBeNull();
    const day = await asPage<{ tasks: Array<{ title: string }> }>(
      app,
      'GET',
      `/api/spaces/${own.id}/days/${today()}`,
    );
    expect(day.tasks.map((t) => t.title)).toContain('Last thing before closing');

    await app.act('reopen');
    await app.waitState(
      (x) => x.background.policy === 'regular' && x.badge === '1' && x.background.trayTitle === null,
    );
  });

  test('C16-D03 the summon with the window hidden: the floating bar shows and adds, and Tudu stays out of the Dock', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    await app.act('summon');
    const s = await floatingShown(app);
    expect(s.background.policy).toBe('accessory');
    expect(s.windows.main.visible).toBe(false);
    await app.until(`return !!T.all('textbox', 'Task title')[0]`, 'floating');
    await app.eval(
      `T.fill(T.get('textbox', 'Task title'), 'Call the plumber'); T.click(T.get('button', 'Add task'));`,
      'floating',
    );
    const after = await floatingHidden(app);
    expect(after.background.policy).toBe('accessory');
    expect(after.windows.main.visible).toBe(false);
    const own = await personal(app);
    const day = await asPage<{ tasks: Array<{ title: string }> }>(
      app,
      'GET',
      `/api/spaces/${own.id}/days/${today()}`,
    );
    expect(day.tasks.map((t) => t.title)).toContain('Call the plumber');
  });

  test('C16-D04 reopen: launching Tudu again while it is hidden brings the window back as a regular app', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    await app.act('reopen');
    await app.waitState(
      (x) => x.windows.main.visible && x.windows.main.focused && x.background.policy === 'regular',
    );
  });

  test('C16-D05 Settings › This Mac › Open at login: on registers with macOS, off unregisters; a launch at login starts in the menu bar', async ({
    app,
  }) => {
    await signIn(app);
    await thisMac(app);
    await app.until(loginSwitchOff);
    try {
      await app.eval(`T.click(T.get('[role=switch]', 'Open at login'))`);
      // macOS's answer, read back: on, or waiting for your OK in Login Items. Never refused.
      const on = await app.waitState(
        (x) => x.background.loginItem === 'on' || x.background.loginItem === 'approval',
      );
      await app.until(loginSwitchOn);
      if (on.background.loginItem === 'approval') {
        await app.eval(`T.click(T.get('button', 'Open Login Items'))`);
        await app.waitState((x) => x.seen.opened.some((u) => u.includes('LoginItems')));
      }
      // Across a relaunch, Settings reads macOS again.
      await app.quit();
      await app.launch();
      await onToday(app);
      await thisMac(app);
      await app.until(loginSwitchOn);
      await app.eval(`T.click(T.get('[role=switch]', 'Open at login'))`);
      await app.waitState((x) => x.background.loginItem === 'off');
      await app.until(loginSwitchOff);
    } finally {
      // Never leave Tudu Test in this Mac's Login Items.
      await app
        .eval(
          `const s = T.all('[role=switch]', 'Open at login')[0]; if (s && s.getAttribute('aria-checked') === 'true') T.click(s);`,
        )
        .catch(() => {});
    }

    // As the login item starts it: no window, no Dock icon, the tick ready.
    await app.quit();
    await app.launch({ TUDU_TEST_AT_LOGIN: '1' });
    const s = await app.state();
    expect(s.background).toMatchObject({ atLogin: true, policy: 'accessory', deskOpen: false, awake: true });
    expect(s.windows.main.visible).toBe(false);
    await app.waitState((x) => x.seen.signedIn, 20_000);
    await openSheet(app);
    await sheetDay(app);
    await app.eval(`T.click(T.get('button', 'Open Tudu Test'))`, 'menubar');
    await app.waitState((x) => x.windows.main.visible && x.background.policy === 'regular');
  });

  test('C16-D06 Quit ends the process from the shown and the hidden state: ⋯ in the sheet and ⌘Q', async ({
    app,
  }) => {
    await signIn(app);
    // ⌘Q with the window shown.
    let pid = (await app.state()).pid;
    await app.quit();
    expect(alive(pid)).toBe(false);

    // ⌘Q with the window hidden.
    await app.launch();
    await onToday(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    pid = (await app.state()).pid;
    await app.quit();
    expect(alive(pid)).toBe(false);

    // ⋯ › Quit in the sheet with the window hidden.
    await app.launch();
    await onToday(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    pid = (await app.state()).pid;
    const exited = new Promise<number | null>((r) => app.child!.once('exit', (c) => r(c)));
    await quitFromSheet(app);
    expect(await exited).toBe(0);
    expect(alive(pid)).toBe(false);
  });

  test('C16-D07 Settings › This Mac › Show Tudu in the Dock: Always keeps the icon and the badge after close; the choice holds across a relaunch', async ({
    app,
  }) => {
    await signIn(app);
    const { b, space, meId } = await withSecond(app);
    await sendRequest(b, space.id, meId, 'Order the badges');
    await app.waitState((x) => x.badge === '1');
    await thisMac(app);
    await app.eval(dockChoice('Always'));
    await app.waitState((x) => x.background.dock === 'always');

    await app.act('close', { window: 'main' });
    const kept = await app.waitState((x) => !x.windows.main.visible);
    expect(kept.background.policy).toBe('regular');
    expect(kept.badge).toBe('1');
    expect(kept.background.trayTitle).toBeNull();

    await app.quit();
    await app.launch();
    await onToday(app);
    expect((await app.state()).background.dock).toBe('always');
    await thisMac(app);
    await app.until(
      `return T.get('button', 'Always', document.querySelector('[role=group][aria-label="Show Tudu in the Dock"]')).getAttribute('aria-pressed') === 'true'`,
    );
    // Back to While the window is open: at once, the icon goes when the window does and the count moves to the tick.
    await app.eval(dockChoice('While the window is open'));
    await app.waitState((x) => x.background.dock === 'open');
    await app.act('close', { window: 'main' });
    await app.waitState(
      (x) => x.background.policy === 'accessory' && x.badge === null && x.background.trayTitle === '1',
    );
  });
});
