import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
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
    expect(s.tray.items).toEqual([
      { id: 'open', text: 'Open Tudu Test', accelerator: null },
      { id: 'new', text: 'New task', accelerator: 'CommandOrControl+Shift+N' },
      { separator: true },
      { id: 'quit', text: 'Quit Tudu Test', accelerator: null },
    ]);
    expect(s.badge).toBeNull();
    expect(s.windows.main.visible).toBe(true);
    // The window opens Tudu on the web (the harness's), on Sign in.
    await app.waitState((x) => x.windows.main.url === `${WEB}/sign-in`);
    expect(s.windows.floating.visible).toBe(false);
    await signIn(app);
    await app.waitState((x) => x.seen.signedIn);
    expect((await app.state()).badge).toBeNull();
  });

  test('C11-D02 the window: no title bar, room for the lights; close hides it; the tray and the dock bring it back; Quit ends it', async ({
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

    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible);
    expect(alive(pid)).toBe(true);
    await app.act('tray', { item: 'open' });
    await app.waitState((s) => s.windows.main.visible && s.windows.main.focused);

    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible);
    await app.act('reopen');
    await app.waitState((s) => s.windows.main.visible);

    await app.act('tray', { item: 'quit' });
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
      await app.act('tray', { item: 'open' });
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
    // The row's own button, not just its words (the list may draw the title before the row is ready).
    await app.until(`return T.all('button', 'Read the plan').length > 0`);
    await app.eval(`T.click(T.get('button', 'Read the plan'))`);
    await app.until(`return !!document.querySelector('[role=dialog] a.tp-att')`);
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
});
