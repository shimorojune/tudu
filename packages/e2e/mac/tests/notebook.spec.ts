import { spawnSync } from 'node:child_process';
import {
  asPage,
  expect,
  go,
  signIn,
  test,
  writeTask,
  type AppState,
  type Space,
  type TuduApp as App,
} from '../harness';

/**
 * Chunk 22, the note window on the Mac: Tudu Test's own `note` window, a panel like Quick Add that stays when you
 * click into another app. Each test launches the app on a fresh folder with its own user.
 */

const today = () => new Date().toLocaleDateString('en-CA');
const noteShown = (a: App) => a.waitState((s) => s.windows.note.visible);
const noteHidden = (a: App) => a.waitState((s) => !s.windows.note.visible);

/** The note window's page is ready on a note (its editor drawn). */
const noteReady = (a: App) =>
  a.until(`return !!document.querySelector('.tp-nb-win .tp-nb-ed .tp-rte-area')`, 'note');

/** Open the note window from the desk, as the task panel or Search would (a note, or a blank one). */
async function openNote(app: App, id: string | null = null): Promise<void> {
  await app.eval(
    `await window.__TAURI_INTERNALS__.invoke('open_note', { id: ${JSON.stringify(id)}, linkTo: null })`,
  );
  await noteShown(app);
  await noteReady(app);
}

async function personal(app: App): Promise<Space> {
  const me = await asPage<{ spaces: Space[] }>(app, 'GET', '/api/me');
  return me.spaces.find((s) => s.kind === 'personal')!;
}

/** A note of the page's person, straight through sync. */
async function writeNote(app: App, title: string, html = '<p>Day one</p>', linkTo?: string): Promise<string> {
  const id = crypto.randomUUID();
  await asPage(app, 'POST', '/api/sync', {
    clientId: 'mac-seed',
    mutations: [
      {
        id: crypto.randomUUID(),
        type: 'note.create',
        payload: { id, folderId: null, title, html, ...(linkTo ? { linkTo } : {}) },
        at: new Date().toISOString(),
      },
    ],
  });
  return id;
}

const BUNDLES: Record<string, string> = { Finder: 'com.apple.finder' };
function frontApp(): string {
  const asn = spawnSync('lsappinfo', ['front'], { encoding: 'utf8' }).stdout.trim();
  const info = spawnSync('lsappinfo', ['info', '-only', 'bundleid', asn], { encoding: 'utf8' }).stdout;
  return /"CFBundleIdentifier"="([^"]+)"/.exec(info)?.[1] ?? 'none';
}
/** Another app comes forward, as a click on it would bring it. */
async function bringForward(name = 'Finder'): Promise<void> {
  const id = BUNDLES[name] ?? name;
  for (const [cmd, args] of [
    ['open', ['-b', id]],
    ['osascript', ['-e', `tell application "${name}" to activate`]],
  ] as Array<[string, string[]]>) {
    if (spawnSync(cmd, args).status !== 0) continue;
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (frontApp() === id) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`${name} never came forward`);
}

const near = (a: number, b: number) => Math.abs(a - b) <= 2;

test.describe('chunk 22 · the note window', () => {
  test('C22-D01 menu bar sheet New note: the sheet hides, the note window shows on a blank note, the desk stays hidden', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible);
    await app.act('tray');
    await app.waitState((s) => s.windows.menubar.visible);
    await app.until(`return T.all('button', 'New note').length > 0`, 'menubar');
    await app.eval(`T.click(T.get('button', 'New note'))`, 'menubar');
    const s = await app.waitState((x) => x.windows.note.visible && !x.windows.menubar.visible);
    expect(s.windows.main.visible).toBe(false);
    expect(s.windows.note.decorated).toBe(false);
    expect(s.note.state.ask).toMatchObject({ id: null });
    await noteReady(app);
    // A blank note, ready to type: the bar says New note and the list has it on.
    await app.until(`return document.querySelector('.tp-nb-win-title')?.textContent === 'New note'`, 'note');
    await app.until(`return T.get('button', 'New note').getAttribute('aria-selected') === 'true'`, 'note');
  });

  test('C22-D02 the note window stays when another app comes forward; it hides on close; it opens again where it was, at the same size', async ({
    app,
  }) => {
    await signIn(app);
    await openNote(app);
    await bringForward('Finder');
    let s = await app.state();
    expect(s.windows.note.visible).toBe(true);
    // Dragged and resized by hand.
    const screen = s.windows.note.screen!;
    const place = { x: screen.x + 140, y: screen.y + 120, width: 640, height: 480 };
    await app.act('frame', { window: 'note', ...place });
    await app.waitState((x) => near(x.windows.note.width, 640) && near(x.windows.note.x, place.x));
    await app.act('close', { window: 'note' });
    s = await noteHidden(app);
    expect(s.note.frame).not.toBeNull();
    await openNote(app);
    s = await app.state();
    expect(near(s.windows.note.x, place.x)).toBe(true);
    expect(near(s.windows.note.y, place.y)).toBe(true);
    expect(near(s.windows.note.width, 640)).toBe(true);
    expect(near(s.windows.note.height, 480)).toBe(true);
  });

  test('C22-D03 pin keeps it on top and starts off; fill the screen and back', async ({ app }) => {
    await signIn(app);
    await openNote(app);
    let s = await app.state();
    expect(s.note.state.pinned).toBe(false);
    expect(s.windows.note.alwaysOnTop).toBe(false);
    await app.eval(`T.click(T.get('button', 'Keep on top of other windows'))`, 'note');
    s = await app.waitState((x) => x.note.state.pinned && x.windows.note.alwaysOnTop);
    await app.until(`return T.all('button', 'Pinned on top · click to unpin').length > 0`, 'note');
    const was = s.windows.note;
    await app.eval(`T.click(T.get('button', 'Fill the screen'))`, 'note');
    s = await app.waitState((x) => x.note.state.expanded && x.windows.note.width > was.width + 100);
    // The whole screen but a small margin (the menu bar and the Dock may take some of its height).
    const scr = s.windows.note.screen!;
    expect(near(s.windows.note.width, scr.width - 16)).toBe(true);
    expect(s.windows.note.height).toBeGreaterThan(scr.height * 0.7);
    await app.eval(`T.click(T.get('button', 'Back to its size'))`, 'note');
    s = await app.waitState((x) => !x.note.state.expanded && near(x.windows.note.width, was.width));
    expect(near(s.windows.note.x, was.x)).toBe(true);
    await app.eval(`T.click(T.get('button', 'Pinned on top · click to unpin'))`, 'note');
    await app.waitState((x) => !x.note.state.pinned && !x.windows.note.alwaysOnTop);
  });

  test('C22-D04 Open in your Notebook shows the desk on /notebook/<id> and hides the window', async ({
    app,
  }) => {
    await signIn(app);
    const id = await writeNote(app, 'Venue shortlist');
    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible);
    await openNote(app, id);
    await app.until(
      `return document.querySelector('.tp-nb-win-title')?.textContent === 'Venue shortlist'`,
      'note',
    );
    await app.eval(`T.click(T.get('button', 'Open in your Notebook'))`, 'note');
    await app.waitState((s: AppState) => s.windows.main.visible && !s.windows.note.visible);
    await app.until(`return location.pathname === ${JSON.stringify(`/notebook/${id}`)}`);
    await app.until(`return T.get('textbox', 'Note title').value === 'Venue shortlist'`);
  });

  test('C22-D05 clicking a note in the desk’s task panel opens it in the note window, not the desk’s Notebook page', async ({
    app,
  }) => {
    await signIn(app);
    const space = await personal(app);
    const taskId = await writeTask(app, space.id, 'Plan the offsite', today());
    await writeNote(app, 'Offsite agenda draft', '<p>Day one</p>', taskId);
    await go(app, '/me?task=ME-1');
    await app.until(`return T.all('button', /Offsite agenda draft/).length > 0`);
    await app.eval(`T.click(T.get('button', /Offsite agenda draft/))`);
    await noteShown(app);
    await app.until(
      `return document.querySelector('.tp-nb-win-title')?.textContent === 'Offsite agenda draft'`,
      'note',
    );
    // The desk stays on the task, its panel open.
    expect(await app.eval<string>(`return location.pathname`)).toBe('/me');
    expect(
      await app.eval<boolean>(`return !!document.querySelector('[role=dialog][aria-label="Task details"]')`),
    ).toBe(true);
  });

  test('C22-D06 a note edited in the window shows the change on the desk’s Notebook page (NOTEBOOK_CHANGED)', async ({
    app,
  }) => {
    await signIn(app);
    const id = await writeNote(app, 'Gift ideas');
    await go(app, `/notebook/${id}`);
    await app.until(`return T.get('textbox', 'Note title').value === 'Gift ideas'`);
    await openNote(app, id);
    await app.eval(`T.fill(T.get('textbox', 'Note title'), 'Gift ideas for Mum')`, 'note');
    const start = Date.now();
    // The save waits for 600 ms of quiet, then the desk hears and reads the note again.
    await app.until(`return T.get('textbox', 'Note title').value === 'Gift ideas for Mum'`, 'main', 5_000);
    expect(Date.now() - start).toBeLessThan(2_500);
    await app.until(`return T.all('button', 'Gift ideas for Mum').length > 0`);
  });

  test('C22-D08 Make a task in the note window: the floating New task shows filled in with the pill, the desk stays hidden; Add links it', async ({
    app,
  }) => {
    await signIn(app);
    const id = await writeNote(app, 'Offsite agenda draft', '<p>Call the venue about the garden room</p>');
    await app.act('close', { window: 'main' });
    await app.waitState((s) => !s.windows.main.visible);
    await openNote(app, id);
    await app.until(`return !!document.querySelector('.tp-nb-win .tp-rte-area p')?.firstChild`, 'note');
    await app.eval(
      `const t = document.querySelector('.tp-nb-win .tp-rte-area p').firstChild;
       const r = document.createRange();
       r.setStart(t, 0);
       r.setEnd(t, 14);
       const s = getSelection();
       s.removeAllRanges();
       s.addRange(r);`,
      'note',
    );
    await app.until(`return T.all('button', 'Make a task').length > 0`, 'note');
    await app.eval(`T.click(T.get('button', 'Make a task'))`, 'note');
    const s = await app.waitState((x) => x.windows.floating.visible);
    expect(s.windows.main.visible).toBe(false);
    await app.until(`return T.get('textbox', 'Task title').value === 'Call the venue'`, 'floating');
    await app.until(
      `return document.querySelector('.tp-qa-from')?.textContent?.includes('Offsite agenda draft') ?? false`,
      'floating',
    );
    await app.eval(`T.click(T.get('button', 'Add task'))`, 'floating');
    await app.waitState((x) => !x.windows.floating.visible);
    // The chip comes into the note window once the link is through (NOTEBOOK_CHANGED).
    await app.until(
      `return document.querySelector('.tp-nb-win .tp-nb-tchip')?.textContent?.includes('Call the venue') ?? false`,
      'note',
      10_000,
    );
    expect((await app.state()).windows.main.visible).toBe(false);
  });

  test('C22-D09 the note window is clear around the note: html and body paint nothing, only the note does', async ({
    app,
  }) => {
    await signIn(app);
    await openNote(app);
    const bg = await app.eval<{ html: string; body: string; note: string }>(
      `const c = (el) => getComputedStyle(el).backgroundColor;
       return { html: c(document.documentElement), body: c(document.body), note: c(document.querySelector('.tp-nb-win')) };`,
      'note',
    );
    const clear = /^(transparent|rgba\(0, 0, 0, 0\))$/;
    expect(bg.html).toMatch(clear);
    expect(bg.body).toMatch(clear);
    expect(bg.note).not.toMatch(clear);
  });
});
