import { join } from 'node:path';
import { request, createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { HOLD_PORT } from '../playwright.config';
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
  inboxPip,
  signIn,
  teamSpace,
  test,
  TuduApp,
  WEB,
  writeTask,
  type Space,
  type AppState,
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

const BUNDLES: Record<string, string> = { Finder: 'com.apple.finder', Calculator: 'com.apple.calculator' };

/** The bundle identifier of the app macOS has in front (lsappinfo needs no Accessibility permission). */
function frontApp(): string {
  const asn = spawnSync('lsappinfo', ['front'], { encoding: 'utf8' }).stdout.trim();
  const info = spawnSync('lsappinfo', ['info', '-only', 'bundleid', asn], { encoding: 'utf8' }).stdout;
  return /"CFBundleIdentifier"="([^"]+)"/.exec(info)?.[1] ?? `none (${asn || 'no front app'})`;
}

/**
 * Another app comes forward, as a click on it would bring it, and is in front before this returns. An activation
 * asked for from the background can be turned down by macOS while the command still succeeds, so this checks.
 */
async function bringForward(name = 'Finder'): Promise<void> {
  const id = BUNDLES[name] ?? name;
  const tries: Array<[string, string[]]> = [
    ['open', ['-b', id]],
    ['osascript', ['-e', `tell application "${name}" to activate`]],
  ];
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status !== 0) continue;
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (frontApp() === id) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`${name} never came forward (in front: ${frontApp()})`);
}

function quitApp(name: string): void {
  spawnSync('osascript', ['-e', `tell application "${name}" to quit`]);
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

  test.describe('with this version on the feed', () => {
    // A check finds nothing newer (none), as on staging and production; with no release at all the feed answers 404,
    // which the updater counts as an error.
    test.use({ release: 'current' });

    test('C11-D14 regression (24 Oct): a version published while the app runs shows once the desk comes back, no relaunch', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'none');
      await signIn(app);
      const pid = (await app.state()).pid;
      // Published after the launch check; the four-hour check is hours away.
      await publish(next, run().next.update, run().next.signature);
      await app.act('age-check', { minutes: 31 });
      // The desk put away and brought back: it comes to the front, and that checks.
      await app.act('close', { window: 'main' });
      await app.act('reopen');
      const s = await app.waitState((x) => x.updater.ready?.version === next, 30_000);
      expect(s.updater.lastManual).toBe(false);
      expect(s.pid).toBe(pid);
      await expect.poll(() => inboxPip(app)).toBe(1);
    });

    test('C11-D15 the floor: coming to the front within 30 minutes asks nothing; a wake past it checks once', async ({
      app,
    }) => {
      const first = await app.waitState((x) => x.updater.lastResult === 'none' && !x.updater.checking);
      await app.act('close', { window: 'main' });
      await app.act('reopen');
      await app.waitState((x) => x.windows.main.visible && x.windows.main.focused);
      expect(await app.act('check-update', { auto: true })).toEqual({ started: false });
      expect((await app.state()).updater.checks).toBe(first.updater.checks);
      await app.act('age-check', { minutes: 31 });
      await app.act('wake');
      await app.waitState((x) => x.updater.checks === first.updater.checks + 1 && !x.updater.checking);
      // And not again straight after.
      await app.act('wake');
      expect((await app.state()).updater.checks).toBe(first.updater.checks + 1);
    });

    test('C11-D16 Settings › This Mac › Check now on the real app: Downloading, Ready, then Restart to update relaunches on it', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'none');
      await signIn(app);
      await publish(next, run().next.update, run().next.signature);
      await go(app, '/me?settings=mac');
      const updates = `document.querySelector('[aria-label="Updates"]')`;
      await app.until(`return !!${updates} && ${updates}.innerText.includes('Up to date.')`);
      await app.eval(`T.click(${updates}.querySelector('button'))`);
      await app.until(`return ${updates}.innerText.includes('is ready. Restart to use it.')`, 'main', 30_000);
      const s = await app.state();
      expect(s.updater.ready?.version).toBe(next);
      expect(s.updater.lastManual).toBe(true);
      await expect.poll(() => inboxPip(app)).toBe(1);
      const old = s.pid;
      await app.eval(`T.click(${updates}.querySelector('button'))`);
      await app.waitState((x) => x.pid !== old && x.version === next, 60_000);
      await app.ready();
    });
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
      await teamSpace(app, 'Northwind');
      await expect.poll(() => inboxPip(app)).toBe(1);
      await go(app, '/inbox');
      await app.until(hasRow(next));
      expect(await app.eval(rowIsNew(next))).toBe(true);
      await app.eval(openRow(next));
      await app.until(
        `return !!document.querySelector('.tp-ix-full') && document.querySelector('.tp-ix-full').innerText.includes('The floating bar keeps your draft')`,
      );
      await app.until(`return T.all('button', 'Restart to update').length === 1`);
      await expect.poll(() => inboxPip(app)).toBe(0);
      // Hide and show: still read.
      await app.act('close', { window: 'main' });
      await app.act('reopen');
      await app.waitState((x) => x.windows.main.visible);
      await go(app, '/inbox');
      await app.until(hasRow(next));
      expect(await app.eval(rowIsNew(next))).toBe(false);
    });

    test('C11-D07 Restart to update: Restarting…, the app relaunches on the new version, the item is gone, still signed in', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'ready');
      await signIn(app);
      await teamSpace(app, 'Northwind');
      await go(app, '/inbox');
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
      await go(app, '/inbox');
      await app.until(`return !!document.querySelector('[aria-label="The Inbox"]')`);
      expect(await app.eval(hasRow(next))).toBe(false);
      expect(await inboxPip(app)).toBe(0);
    });

    test('C11-D20 What’s new is offered only where there is a release page: Tudu Test has none, Restart to update stays', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'ready');
      expect((await app.state()).track).toBe('test');
      await signIn(app);
      await go(app, '/inbox');
      await app.until(hasRow(next));
      await app.eval(openRow(next));
      await app.until(`return T.all('button', 'Restart to update').length === 1`);
      // Production opens its tag and staging its release (C11-U25, C11-E02); the test build never shows a dead button.
      expect(await app.eval(`return T.all('button', /What’s new/).length`)).toBe(0);
      expect((await app.state()).seen.opened).toEqual([]);
    });

    test('C11-D12 two spaces in the app: the version once in the one Inbox; read once; the dock counts it once', async ({
      app,
    }) => {
      const next = run().next.version;
      await app.waitState((x) => x.updater.lastResult === 'ready');
      await signIn(app);
      await teamSpace(app, 'Northwind');
      await teamSpace(app, 'Acme');
      await app.waitState((x) => x.badge === '1');
      await go(app, '/inbox');
      await app.until(hasRow(next));
      expect(await app.eval(`return T.all('article', ${JSON.stringify(ITEM(next))}).length`)).toBe(1);
      expect(await app.eval(rowIsNew(next))).toBe(true);
      await app.eval(openRow(next));
      await app.waitState((x) => x.badge === null);
      await go(app, '/inbox');
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
      await teamSpace(app, 'Northwind');
      await go(app, '/inbox');
      await app.until(`return !!document.querySelector('[aria-label="The Inbox"]')`);
      expect(await app.eval(hasRow(r.next.version))).toBe(false);

      await feedDown();
      await app.act('check-update');
      const down = await app.state();
      expect(down.updater.lastResult).toBe('error');
      expect(down.updater.ready).toBeNull();
      expect(await inboxPip(app)).toBe(0);

      await publish(r.next.version, r.next.update, r.next.signature);
      await app.act('check-update');
      await app.waitState((x) => x.updater.ready?.version === r.next.version);
      await app.until(hasRow(r.next.version));
      await expect.poll(() => inboxPip(app)).toBe(1);
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
    await go(app, `/inbox/${inbox.updates[0]!.id}`);
    await app.waitState((x) => x.badge === '2');
    for (const [sp, id] of [
      [space, requestId],
      [acme.space, second],
    ] as const) {
      await go(app, `/inbox?space=${sp.slug}`);
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
    await asPage(app, 'POST', '/api/connectors/jira', {
      site: `${API}/__test/jira`,
      token: `good-${crypto.randomUUID()}`,
      spaceId: space.id,
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
    await app.waitState((x) => x.seen.opened.some((u) => u === 'https://example.com/brief'));
    // Even a page moving itself elsewhere is handed out, and the window stays put.
    await app.eval(`location.href = 'https://example.com/elsewhere'`).catch(() => {});
    const s = await app.waitState((x) => x.seen.opened.some((u) => u === 'https://example.com/elsewhere'));
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
    // Tudu in front first, so this is the path where the sheet loses its focus.
    await app.act('reopen');
    await app.waitState((x) => x.windows.main.focused);
    await openSheet(app);
    await bringForward('Finder');
    await sheetHidden(app);
    // Past the grace that keeps the blurring click on the tick from reopening it.
    await new Promise((r) => setTimeout(r, 400));
    await openSheet(app);
    await app.eval(`T.press('Escape')`, 'menubar');
    await sheetHidden(app);
  });

  test('C20-D06 with another app already in front: another app coming forward hides the sheet', async ({
    app,
  }) => {
    await signIn(app);
    // Confirmed in front, so Tudu is not the active app and the sheet never takes focus from anything.
    await bringForward('Calculator');
    await app.waitState((x) => !x.windows.main.focused);
    try {
      await openSheet(app);
      await bringForward('Finder');
      await sheetHidden(app);
    } finally {
      quitApp('Calculator');
    }
  });

  test('C20-D07 with another app already in front: a click in it hides the sheet; the tick opens it again after the grace', async ({
    app,
  }) => {
    await signIn(app);
    await bringForward('Finder');
    await app.waitState((x) => !x.windows.main.focused);
    await openSheet(app);
    // What the global mouse monitor hears for a click in Finder; CI cannot post a real one into another app.
    await app.act('outside-click');
    await sheetHidden(app);
    await new Promise((r) => setTimeout(r, 400));
    await openSheet(app);
    await app.act('tray');
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
    expect(s.background.webviews).toEqual({ main: 2, floating: 2, menubar: 2, note: 2 });
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

  test("C16-D02 hidden for a while: a task sent to you arrives as the tick's dot, today's task beside it; the Inbox count moves to the Dock when the window opens", async ({
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
    const s = await app.waitState((x) => x.background.trayDot, 15_000);
    expect(s.badge).toBeNull();
    // The one task written before closing is today's one left.
    expect(s.background.trayTitle).toBe('1');
    const day = await asPage<{ tasks: Array<{ title: string }> }>(
      app,
      'GET',
      `/api/spaces/${own.id}/days/${today()}`,
    );
    expect(day.tasks.map((t) => t.title)).toContain('Last thing before closing');

    await app.act('reopen');
    await app.waitState(
      (x) =>
        x.background.policy === 'regular' &&
        x.badge === '1' &&
        x.background.trayTitle === '1' &&
        x.background.trayDot,
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

  test('C11-D13 Settings shows the app’s own name and version, Tudu Test, as plain text: it is never released', async ({
    app,
  }) => {
    await signIn(app);
    await go(app, `/me?settings=account`);
    const version = run().current.version;
    await app.until(
      `const v = document.querySelector('.tp-set-ver'); return !!v && v.textContent === ${JSON.stringify(`Tudu Test${version}`)} && v.tagName === 'SPAN' && !v.querySelector('.tp-ver-dot')`,
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
    // Nothing planned today: no number beside the tick; the dot says something is new.
    expect(kept.background.trayTitle).toBeNull();
    expect(kept.background.trayDot).toBe(true);

    await app.quit();
    await app.launch();
    await onToday(app);
    expect((await app.state()).background.dock).toBe('always');
    await thisMac(app);
    await app.until(
      `return T.get('button', 'Always', document.querySelector('[role=group][aria-label="Show Tudu in the Dock"]')).getAttribute('aria-pressed') === 'true'`,
    );
    // Back to While the window is open: at once, the icon and its badge go when the window does; the dot stays.
    await app.eval(dockChoice('While the window is open'));
    await app.waitState((x) => x.background.dock === 'open');
    await app.act('close', { window: 'main' });
    await app.waitState(
      (x) => x.background.policy === 'accessory' && x.badge === null && x.background.trayDot,
    );
  });
});

/** The tick's saved place lives in Tudu Test's own defaults, under macOS's key for its status item. */
const TRAY_KEY = 'NSStatusItem Preferred Position Item-0';
/** Where Tudu seeds it on a first launch (TRAY_SEED in background.rs). */
const TRAY_SEED = 20;
const defaults = (...args: string[]) => spawnSync('defaults', args, { encoding: 'utf8' });
/** The page reports the Inbox count to the app as it would (set_badge), so a big count needs no hundred requests. */
const reportBadge = (app: App, count: number) =>
  app.eval(`await window.__TAURI_INTERNALS__.invoke('set_badge', { count: ${count} }); return true`);

/** The page reports today's count to the app as it would (set_tick), so a big day needs no hundred tasks. */
const reportTick = (app: App, left: number, total: number) =>
  app.eval(
    `await window.__TAURI_INTERNALS__.invoke('set_tick', { left: ${left}, total: ${total} }); return true`,
  );

/** Tasks on today in a space, written as the page's person would from another device. */
async function addToday(app: App, spaceId: string, titles: string[]): Promise<string[]> {
  const ids = titles.map(() => crypto.randomUUID());
  await asPage(app, 'POST', '/api/sync', {
    clientId: 'other-device',
    mutations: titles.map((title, i) => ({
      id: crypto.randomUUID(),
      type: 'task.create',
      payload: { id: ids[i], spaceId, title, day: today(), position: 1024 * (i + 1) },
      at: new Date(Date.now() + i).toISOString(),
    })),
  });
  return ids;
}

/** Ticked off from another device (the phone). */
async function crossElsewhere(app: App, ids: string[]): Promise<void> {
  await asPage(app, 'POST', '/api/sync', {
    clientId: 'other-device',
    mutations: ids.map((id, i) => ({
      id: crypto.randomUUID(),
      type: 'task.cross',
      payload: { id, done: true },
      at: new Date(Date.now() + i).toISOString(),
    })),
  });
}

test.describe('the number beside the tick', () => {
  test('MC-D05 signed out: the bare tick, no dot, the name alone as its tooltip', async ({ app }) => {
    const s = await app.waitState((x) => x.tray.rect !== null);
    expect(s.background.trayTitle).toBeNull();
    expect(s.background.trayDot).toBe(false);
    expect(s.tray.tooltip).toBe('Tudu Test');
  });

  test("MC-D01 window closed: today's tasks left beside the tick; a tick in the sheet counts down; all done is the bare tick", async ({
    app,
  }) => {
    await signIn(app);
    const own = await personal(app);
    const ids = await addToday(app, own.id, [
      'Pay the electricity bill',
      'Call the bank',
      'Renew the domain',
    ]);
    await app.act('close', { window: 'main' });
    const s = await app.waitState(
      (x) => x.background.policy === 'accessory' && x.background.trayTitle === '3',
      15_000,
    );
    expect(s.tray.tooltip).toBe('Tudu Test · 3 left today');
    expect(s.background.trayDot).toBe(false);

    await openSheet(app);
    await sheetDay(app);
    await app.until(`return T.all('checkbox', 'Call the bank').length > 0`, 'menubar');
    await app.eval(`T.click(T.get('checkbox', 'Call the bank'))`, 'menubar');
    await app.waitState((x) => x.background.trayTitle === '2', 15_000);

    await crossElsewhere(app, [ids[0]!, ids[2]!]);
    const done = await app.waitState((x) => x.background.trayTitle === null, 20_000);
    expect(done.tray.tooltip).toBe('Tudu Test · All done for today');
  });

  test("MC-D02 window open: the tick keeps today's count; the Dock badge is the Inbox, not today", async ({
    app,
  }) => {
    await signIn(app);
    const own = await personal(app);
    await addToday(app, own.id, ['Book the dentist', 'Send the invoice']);
    const s = await app.waitState((x) => x.background.trayTitle === '2', 20_000);
    expect(s.background.policy).toBe('regular');
    expect(s.badge).toBeNull();
  });

  test("MC-D03 new in the Inbox: the dot, the tooltip, the sheet's line; the line opens the desk on the Inbox", async ({
    app,
  }) => {
    await signIn(app);
    const { b, space, meId } = await withSecond(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    await sendRequest(b, space.id, meId, 'Proofread the brochure');
    const s = await app.waitState((x) => x.background.trayDot, 15_000);
    expect(s.tray.tooltip).toBe('Tudu Test · Nothing planned today · 1 new in your Inbox');

    await openSheet(app);
    await sheetDay(app);
    await app.until(`return T.all('button', '1 new in your Inbox, open the Inbox').length > 0`, 'menubar');
    await app.eval(`T.click(T.get('button', '1 new in your Inbox, open the Inbox'))`, 'menubar');
    const shown = await app.waitState(
      (x) => x.windows.main.visible && /\/inbox/.test(x.windows.main.url),
      15_000,
    );
    expect(shown.windows.menubar.visible).toBe(false);

    // Nothing new any more: the dot goes.
    await reportBadge(app, 0);
    await app.waitState((x) => !x.background.trayDot);
  });
});

test.describe('the menu bar tick', () => {
  test('MB-D01 first launch: no saved place, so Tudu seeds the one next to the system icons under the item’s own name', async ({
    app,
  }) => {
    const { identifier } = await app.state();
    await app.quit();
    defaults('delete', identifier, TRAY_KEY);
    await app.launch();
    const s = await app.waitState((x) => x.tray.rect !== null && x.background.trayAutosave !== null);
    expect(s.background.trayAutosave).toBe('Item-0');
    expect(s.background.trayPosition).toBe(TRAY_SEED);
    expect(Number(defaults('read', identifier, TRAY_KEY).stdout.trim())).toBe(TRAY_SEED);
  });

  test('MB-D02 a saved place (your ⌘-drag) is never moved: kept at launch and across a relaunch', async ({
    app,
  }) => {
    const { identifier } = await app.state();
    await app.quit();
    defaults('write', identifier, TRAY_KEY, '-float', '400');
    try {
      await app.launch();
      expect((await app.waitState((x) => x.tray.rect !== null)).background.trayPosition).toBe(400);
      await app.quit();
      await app.launch();
      expect((await app.waitState((x) => x.tray.rect !== null)).background.trayPosition).toBe(400);
    } finally {
      await app.quit();
      defaults('delete', identifier, TRAY_KEY);
    }
  });

  test('MB-D03 the count beside the tick stops at 99+ either way; the Dock badge keeps the real Inbox number', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    await reportTick(app, 120, 130);
    await reportBadge(app, 150);
    const hidden = await app.waitState((x) => x.background.trayTitle === '99+' && x.background.trayDot);
    expect(hidden.badge).toBeNull();
    await reportTick(app, 99, 130);
    await app.waitState((x) => x.background.trayTitle === '99');
    await reportTick(app, 120, 130);
    await app.waitState((x) => x.background.trayTitle === '99+');
    await app.act('reopen');
    await app.waitState(
      (x) => x.background.policy === 'regular' && x.badge === '150' && x.background.trayTitle === '99+',
    );
  });

  test('MB-D04 macOS hides the tick in a full menu bar: the Dock icon and its badge stay while the window is closed', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => x.background.policy === 'accessory');
    await reportBadge(app, 3);
    await reportTick(app, 2, 4);
    await app.waitState((x) => x.background.trayTitle === '2' && x.background.trayDot);
    try {
      await app.act('tick', { hidden: true });
      const kept = await app.waitState(
        (x) => x.background.tickHidden && x.background.policy === 'regular',
        15_000,
      );
      expect(kept.windows.main.visible).toBe(false);
      // The Dock icon carries the Inbox count; the tick keeps today's number and its dot, ready for when it shows.
      await app.waitState((x) => x.badge === '3' && x.background.trayTitle === '2' && x.background.trayDot);
      // Room again: out of the Dock, the badge gone with it.
      await app.act('tick', { hidden: false });
      await app.waitState(
        (x) =>
          !x.background.tickHidden &&
          x.background.policy === 'accessory' &&
          x.badge === null &&
          x.background.trayTitle === '2',
        15_000,
      );
    } finally {
      await app.act('tick', { hidden: null });
    }
  });
});

/** What macOS shows now: the theme System follows. */
const macDark = () =>
  /Dark/.test(spawnSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8' }).stdout);
/** The pick that differs from macOS, so following it can't pass by accident. */
const against = () => (macDark() ? 'Light' : 'Dark');

/** Settings › Appearance on the desk: pick a theme and wait for the app to have it. */
async function pickTheme(app: App, label: 'Light' | 'Dark' | 'System'): Promise<void> {
  // Already open (a second pick in one test): stay, since re-going to the same address passes its check on the old
  // page and the click would land mid-reload.
  const open = await app.eval<boolean>(
    `return location.pathname === '/me' && T.all('[role=radio]').some((r) => r.innerText.trim().startsWith('${label}'))`,
  );
  if (!open) await go(app, `/me?settings=appearance`);
  await app.until(`const r = T.all('[role=radio]').find((r) => r.innerText.trim().startsWith('${label}'));
    if (!r) return false;
    T.click(r);
    return true;`);
  await app.waitState((s) => s.look.saved.theme === label.toLowerCase());
}

const BACKGROUND = { light: '#eeece6', dark: '#111211' } as const;
const themes = (s: AppState) =>
  (['main', 'floating', 'menubar', 'note'] as const).map((w) => s.windows[w].theme);

/**
 * A stand-in for the web on HOLD_PORT, passing everything to the real one: down until `up()`, and `/` answered only
 * after `holdMs` (the loader's reachability check and the page itself).
 */
function standIn() {
  let server: Server | null = null;
  let holdMs = 0;
  const up = (hold = 0) =>
    new Promise<void>((resolve) => {
      holdMs = hold;
      server = createServer((req, res) => {
        const pass = () => {
          const out = request(`${WEB}${req.url}`, { method: req.method, headers: req.headers }, (r) => {
            res.writeHead(r.statusCode ?? 502, r.headers);
            r.pipe(res);
          });
          out.on('error', () => res.destroy());
          req.pipe(out);
        };
        if (req.url === '/' && holdMs) setTimeout(pass, holdMs);
        else pass();
      });
      server.listen(Number(HOLD_PORT), '127.0.0.1', () => resolve());
    });
  const down = () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.closeAllConnections();
      server.close(() => resolve());
      server = null;
    });
  return { url: `http://localhost:${HOLD_PORT}`, up, down };
}

test.describe('the look', () => {
  test('C11-D17 Settings › Appearance sets every window’s macOS appearance (the traffic lights) and the desk’s background; System follows macOS', async ({
    app,
  }) => {
    await signIn(app);
    const pick = against();
    const want = pick.toLowerCase() as 'light' | 'dark';
    await pickTheme(app, pick);
    let s = await app.waitState((x) => themes(x).every((t) => t === want));
    expect(s.look.deskBackground).toBe(BACKGROUND[want]);
    expect(await app.eval(`return document.documentElement.classList.contains('dark')`)).toBe(
      want === 'dark',
    );

    const other = want === 'light' ? 'dark' : 'light';
    await pickTheme(app, other === 'light' ? 'Light' : 'Dark');
    s = await app.waitState((x) => themes(x).every((t) => t === other));
    expect(s.look.deskBackground).toBe(BACKGROUND[other]);

    // System: no override, every window back on macOS's own appearance.
    await pickTheme(app, 'System');
    const mac = macDark() ? 'dark' : 'light';
    s = await app.waitState((x) => themes(x).every((t) => t === mac));
    expect(s.look.deskBackground).toBe(BACKGROUND[mac]);
  });

  test('C11-D18 across launches: the desk is built in the picked theme, with its background, before any page loads', async ({
    app,
  }) => {
    await signIn(app);
    const pick = against();
    const want = pick.toLowerCase() as 'light' | 'dark';
    await pickTheme(app, pick);
    await app.quit();

    await app.launch();
    // The first answer from the channel: the app has built its windows, the page may not have run yet.
    const s = await app.state();
    expect(s.look.saved.theme).toBe(want);
    expect(s.look.deskBackground).toBe(BACKGROUND[want]);
    expect(themes(s).every((t) => t === want)).toBe(true);
    await onToday(app);
    expect(
      await app.eval(
        `return [window.__TUDU_LOOK__.theme, document.documentElement.classList.contains('dark')]`,
      ),
    ).toEqual([want, want === 'dark']);
  });

  test('C11-D19 the web slow or down: the loader shows the mark in the picked theme, offline words under it, and the web carries the mark on held', async ({
    app,
  }) => {
    await signIn(app);
    const pick = against();
    const dark = pick === 'Dark';
    await pickTheme(app, pick);
    await app.quit();
    const web = standIn();
    try {
      // Down: the loader's mark, still, in the picked theme, with the offline words beneath.
      await app.launch({ TUDU_TEST_WEB: web.url });
      await app.until(`return location.protocol !== 'http:' && !document.getElementById('offline').hidden`);
      expect(
        await app.eval(`const b = document.getElementById('boot');
          return [b.classList.contains('tl-offline'), getComputedStyle(b).opacity, document.documentElement.classList.contains('dark'), T.text('#offline').includes('Try again')]`),
      ).toEqual([true, '1', dark, true]);
      // Back: Try again reaches the app.
      await web.up();
      await app.eval(`T.click(document.getElementById('again'))`);
      await onToday(app);
      // The stand-in is its own origin, with nothing stored: the page there followed System and told the app so.
      // Give it the pick as well, so the next launch is built in it again.
      await app
        .eval(`localStorage.setItem('tudu.theme', '${pick.toLowerCase()}'); location.reload()`)
        .catch(() => {});
      await onToday(app);
      await app.waitState((s) => s.look.saved.theme === pick.toLowerCase());
      await app.quit();

      // Slow: the loader shows the mark after 300ms; the web, arriving later, starts held (no second intro).
      await web.down();
      await web.up(2_000);
      await app.launch({ TUDU_TEST_WEB: web.url });
      await app.until(
        `return location.protocol !== 'http:' && getComputedStyle(document.getElementById('boot')).opacity === '1'`,
      );
      expect(await app.eval(`return document.documentElement.classList.contains('dark')`)).toBe(dark);
      await onToday(app);
      expect(await app.eval(`return document.documentElement.dataset.boot`)).toBe('held');
      await app.until(`return !document.getElementById('boot')`);
    } finally {
      await web.down();
    }
  });
});
