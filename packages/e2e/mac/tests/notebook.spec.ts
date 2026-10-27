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

/** Settings › Appearance on the desk: pick a theme and wait for the app to keep it. */
async function pickTheme(app: App, label: 'Light' | 'Dark'): Promise<void> {
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

/** A pointer down on the note window's edge handle, moved by dx, dy on the screen, and let go. */
const dragEdge = (edge: string, dx: number, dy: number) => `
  const h = document.querySelector('[data-edge="${edge}"]');
  const r = h.getBoundingClientRect();
  const o = (x, y) => ({ bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: r.left + r.width / 2 + x, clientY: r.top + r.height / 2 + y, screenX: 500 + x, screenY: 400 + y });
  h.dispatchEvent(new PointerEvent('pointerdown', o(0, 0)));
  for (let i = 1; i <= 4; i++) {
    document.dispatchEvent(new PointerEvent('pointermove', o((${dx} * i) / 4, (${dy} * i) / 4)));
    await new Promise((res) => requestAnimationFrame(res));
  }
  document.dispatchEvent(new PointerEvent('pointerup', { ...o(${dx}, ${dy}), buttons: 0 }));
  return true;`;

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
    // Clear means alpha 0, whatever colour WebKit reports with it (rgba(238, 236, 230, 0) is as clear as transparent).
    const alpha = (c: string) =>
      c === 'transparent' ? 0 : Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(c)?.[1] ?? 1);
    expect(alpha(bg.html)).toBe(0);
    expect(alpha(bg.body)).toBe(0);
    expect(alpha(bg.note)).toBeGreaterThan(0);
  });

  test('C22-D30 ⌥⌘N opens the note window on a blank note over another app; with the sheet open, the sheet goes first', async ({
    app,
  }) => {
    await signIn(app);
    let s = await app.state();
    expect(s.shortcuts.notes).toEqual({ accelerator: 'CommandOrControl+Alt+N', registered: true });
    expect(s.shortcuts.summon.registered).toBe(true);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => !x.windows.main.visible);
    await bringForward('Finder');
    await app.act('notes-shortcut');
    s = await noteShown(app);
    expect(s.windows.main.visible).toBe(false);
    expect(s.note.state.ask).toMatchObject({ id: null });
    await noteReady(app);
    await app.until(`return document.querySelector('.tp-nb-win-title')?.textContent === 'New note'`, 'note');
    // The app says so to the page: the sheet's New note shows it.
    const info = await app.eval<{ noteShortcut?: string }>(
      `return await window.__TAURI_INTERNALS__.invoke('app_info')`,
    );
    expect(info.noteShortcut).toBe('⌥⌘N');
    await app.act('close', { window: 'note' });
    await noteHidden(app);
    await app.act('tray');
    await app.waitState((x) => x.windows.menubar.visible);
    await app.act('notes-shortcut');
    s = await app.waitState((x) => x.windows.note.visible && !x.windows.menubar.visible);
    expect(s.windows.main.visible).toBe(false);
  });

  test('C22-D31 pinned, closed and opened again: it opens unpinned, and says so', async ({ app }) => {
    await signIn(app);
    await openNote(app);
    await app.eval(`T.click(T.get('button', 'Keep on top of other windows'))`, 'note');
    await app.waitState((x) => x.note.state.pinned && x.windows.note.alwaysOnTop);
    await app.eval(`T.click(T.get('button', 'Close'))`, 'note');
    let s = await noteHidden(app);
    expect(s.note.state.pinned).toBe(false);
    await openNote(app);
    s = await app.state();
    expect(s.note.state.pinned).toBe(false);
    expect(s.windows.note.alwaysOnTop).toBe(false);
    await app.until(
      `const b = T.get('button', 'Keep on top of other windows'); return b.getAttribute('aria-pressed') === 'false'`,
      'note',
    );
    // Pinned again and closed from the app's side (⌘W): the same.
    await app.eval(`T.click(T.get('button', 'Keep on top of other windows'))`, 'note');
    await app.waitState((x) => x.note.state.pinned);
    await app.act('close', { window: 'note' });
    s = await noteHidden(app);
    expect(s.note.state.pinned).toBe(false);
    expect(s.windows.note.alwaysOnTop).toBe(false);
  });

  test('C22-D32 fill the screen glides there and back', async ({ app }) => {
    await signIn(app);
    await openNote(app);
    const before = await app.state();
    const was = before.windows.note;
    // The glide is instant with Less motion or macOS Reduce motion; this run has neither, or it says which.
    expect({ less: before.look.saved.lessMotion, reduce: before.reduceMotion }).toEqual({
      less: false,
      reduce: false,
    });
    const until = async (done: (s: AppState) => boolean) => {
      const end = Date.now() + 3000;
      let s = await app.state();
      while (!done(s) && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 30));
        s = await app.state();
      }
      return s;
    };
    await app.eval(`T.click(T.get('button', 'Fill the screen'))`, 'note');
    const out = await until((x) => near(x.windows.note.width, x.windows.note.screen!.width - 16));
    // It got there in steps (about one every 16ms over 200ms), not in one jump.
    expect(out.note.glideSteps - before.note.glideSteps).toBeGreaterThanOrEqual(5);
    await app.eval(`T.click(T.get('button', 'Back to its size'))`, 'note');
    const back = await until((x) => near(x.windows.note.width, was.width));
    expect(back.note.glideSteps - out.note.glideSteps).toBeGreaterThanOrEqual(5);
    // Where it was, as C22-D03 has it; the glide's in-between frames were not kept.
    expect(near(back.windows.note.x, was.x)).toBe(true);
    await app.act('close', { window: 'note' });
    await noteHidden(app);
    await openNote(app);
    const again = (await app.state()).windows.note;
    expect(near(again.width, was.width) && near(again.x, was.x)).toBe(true);
  });

  test('C22-D33 the note window paints the theme picked on the desk: picked while hidden, and live while open', async ({
    app,
  }) => {
    await signIn(app);
    await pickTheme(app, 'Dark');
    await openNote(app);
    const look = () =>
      app.eval<{ dark: boolean; bg: string }>(
        `return { dark: document.documentElement.classList.contains('dark'), bg: getComputedStyle(document.querySelector('.tp-nb-win')).backgroundColor }`,
        'note',
      );
    const lum = (c: string) => {
      const [r, g, b] = (/rgba?\(([^)]+)\)/.exec(c)?.[1] ?? '255,255,255').split(/[ ,]+/).map(Number);
      return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
    };
    let l = await look();
    expect(l.dark).toBe(true);
    expect(lum(l.bg)).toBeLessThan(0.3);
    await pickTheme(app, 'Light');
    await app.until(`return !document.documentElement.classList.contains('dark')`, 'note', 1000);
    l = await look();
    expect(lum(l.bg)).toBeGreaterThan(0.7);
  });

  test('C22-D34 every edge and corner resizes the window, its far edges staying put, never below 420×320', async ({
    app,
  }) => {
    await signIn(app);
    await openNote(app);
    for (const [edge, dx, dy] of [
      ['e', -60, 0],
      ['s', 0, -60],
      ['w', 60, 0],
      ['n', 0, 60],
      ['se', 40, 40],
      ['sw', -40, 40],
      ['ne', 40, -40],
      ['nw', -40, -40],
    ] as Array<[string, number, number]>) {
      const a = (await app.state()).windows.note;
      await app.eval(dragEdge(edge, dx, dy), 'note');
      const b = (
        await app.waitState(
          (x) => !near(x.windows.note.width, a.width) || !near(x.windows.note.height, a.height),
        )
      ).windows.note;
      const left = edge.includes('w') ? dx : 0;
      const top = edge.includes('n') ? dy : 0;
      const right = edge.includes('e') ? dx : 0;
      const bottom = edge.includes('s') ? dy : 0;
      expect(near(b.x - a.x, left), `${edge} left`).toBe(true);
      expect(near(b.y - a.y, top), `${edge} top`).toBe(true);
      expect(near(b.x + b.width - (a.x + a.width), right), `${edge} right`).toBe(true);
      expect(near(b.y + b.height - (a.y + a.height), bottom), `${edge} bottom`).toBe(true);
    }
    await app.eval(dragEdge('se', -2000, -2000), 'note');
    await app.waitState((x) => near(x.windows.note.width, 420) && near(x.windows.note.height, 320));
  });
});
