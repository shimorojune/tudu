import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asPage, expect, signIn, test, type TuduApp as App } from '../harness';

/**
 * ⌘V, ⌘C, ⌘X, ⌘A, ⌘Z and ⇧⌘Z in Tudu's floating windows while another app is the active one (#119,
 * docs/plans/panel-edit-keys.md). The note window and Quick Add are non-activating panels: they take the keyboard
 * over Finder without Tudu coming forward. The presses are real ones: System Events posts them to the window
 * server, which hands them to whichever window has the keyboard, as the keyboard does. (A key-down handed straight
 * to NSApp.sendEvent, the `edit-key` act, pasted on the unfixed app too, so it proved nothing about #119.)
 */

const noteShown = (a: App) => a.waitState((s) => s.windows.note.visible && s.windows.note.focused);
const noteReady = (a: App) =>
  a.until(`return !!document.querySelector('.tp-nb-win .tp-nb-ed .ProseMirror')`, 'note');

function frontApp(): string {
  const asn = spawnSync('lsappinfo', ['front'], { encoding: 'utf8' }).stdout.trim();
  const info = spawnSync('lsappinfo', ['info', '-only', 'bundleid', asn], { encoding: 'utf8' }).stdout;
  return /"([^"]+)"\s*$/.exec(info.trim())?.[1] ?? '';
}

async function finderInFront(): Promise<void> {
  for (const [cmd, args] of [
    ['open', ['-b', 'com.apple.finder']],
    ['osascript', ['-e', 'tell application "Finder" to activate']],
  ] as Array<[string, string[]]>) {
    if (spawnSync(cmd, args).status !== 0) continue;
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      if (frontApp() === 'com.apple.finder') return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Finder never came forward');
}

const copyText = (text: string) => spawnSync('pbcopy', { input: text });
const pasteboard = () => spawnSync('pbpaste', { encoding: 'utf8' }).stdout;

/** A tiny red PNG on the general pasteboard, as a screenshot copied from another app would be. */
function copyPng(): void {
  const dir = mkdtempSync(join(tmpdir(), 'tudu-edit-keys-'));
  const file = join(dir, 'red.png');
  writeFileSync(
    file,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
      'base64',
    ),
  );
  const r = spawnSync('osascript', [
    '-e',
    `set the clipboard to (read (POSIX file "${file}") as «class PNGf»)`,
  ]);
  if (r.status !== 0) throw new Error(`could not copy the picture: ${r.stderr}`);
}

/** A real ⌘ press, through the window server. */
function key(k: string, shift = false): void {
  const mods = shift ? '{command down, shift down}' : 'command down';
  const r = spawnSync(
    'osascript',
    ['-e', `tell application "System Events" to keystroke "${k}" using ${mods}`],
    {
      encoding: 'utf8',
    },
  );
  if (r.status !== 0) throw new Error(`System Events could not press ⌘${k}: ${r.stderr}`);
}

/** A note of the page's person, straight through sync. */
async function writeNote(app: App, title: string, html: string): Promise<string> {
  const id = crypto.randomUUID();
  await asPage(app, 'POST', '/api/sync', {
    clientId: 'mac-seed',
    mutations: [
      {
        id: crypto.randomUUID(),
        type: 'note.create',
        payload: { id, folderId: null, title, html },
        at: new Date().toISOString(),
      },
    ],
  });
  return id;
}

/** The note window on a note over Finder: Finder stays the active app, the note window has the keyboard. */
async function noteOverFinder(app: App, html: string): Promise<string> {
  await signIn(app);
  const id = await writeNote(app, 'Groceries', html);
  await app.act('close', { window: 'main' });
  await app.waitState((x) => !x.windows.main.visible);
  await finderInFront();
  await app.eval(
    `await window.__TAURI_INTERNALS__.invoke('open_note', { id: ${JSON.stringify(id)}, linkTo: null })`,
  );
  await noteShown(app);
  await noteReady(app);
  await app.until(`return document.querySelector('.tp-nb-win .ProseMirror').textContent.length > 0`, 'note');
  // The caret at the end of the note's text.
  await app.eval(
    `const ed = document.querySelector('.tp-nb-win .tp-nb-ed .ProseMirror');
     ed.focus();
     const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
     const s = getSelection(); s.removeAllRanges(); s.addRange(r);
     return true;`,
    'note',
  );
  expect(frontApp()).toBe('com.apple.finder');
  return id;
}

const noteText = (app: App) =>
  app.eval<string>(`return document.querySelector('.tp-nb-win .tp-nb-ed .ProseMirror').textContent`, 'note');

test.describe('#119 edit keys in the floating windows', () => {
  test('C22-D53 over Finder, ⌘V pastes text into the note window, and it stays after the window opens again', async ({
    app,
  }) => {
    const id = await noteOverFinder(app, '<p>Shopping: </p>');
    copyText('Bought milk');
    key('v');
    await app.until(
      `return document.querySelector('.tp-nb-win .ProseMirror').textContent.includes('Bought milk')`,
      'note',
    );
    // Saved: the window closed and opened again on the same note still has it.
    await new Promise((r) => setTimeout(r, 1200));
    await app.act('close', { window: 'note' });
    await app.waitState((x) => !x.windows.note.visible);
    await app.eval(
      `await window.__TAURI_INTERNALS__.invoke('open_note', { id: ${JSON.stringify(id)}, linkTo: null })`,
    );
    await noteShown(app);
    await noteReady(app);
    await app.until(
      `return document.querySelector('.tp-nb-win .ProseMirror').textContent.includes('Bought milk')`,
      'note',
    );
  });

  test('C22-D54 over Finder: ⌘A ⌘C copy the note, ⌘X empties it, ⌘Z brings it back, ⇧⌘Z takes it away again', async ({
    app,
  }) => {
    await noteOverFinder(app, '<p>Draft line</p>');
    copyText('nothing yet');
    key('a');
    key('c');
    await expect.poll(pasteboard, { message: '⌘A then ⌘C copies the note' }).toBe('Draft line');
    key('x');
    await expect.poll(() => noteText(app), { message: '⌘X empties the note' }).toBe('');
    key('z');
    await expect.poll(() => noteText(app), { message: '⌘Z brings it back' }).toBe('Draft line');
    key('z', true);
    await expect.poll(() => noteText(app), { message: '⇧⌘Z takes it away again' }).toBe('');
  });

  test('C22-D55 over Finder, a picture on the pasteboard and ⌘V in the note window: it uploads as it does on the desk', async ({
    app,
  }) => {
    await noteOverFinder(app, '<p>Receipt: </p>');
    copyPng();
    key('v');
    await app.until(
      `const a = document.querySelector('.tp-nb-win .tp-att');
       return !!a && !a.classList.contains('tp-att-up') && !a.classList.contains('tp-att-err');`,
      'note',
      20_000,
    );
  });

  test('C20-D10 over Finder, Quick Add: ⌘V pastes into the title; ⌘A then ⌘X empties it', async ({ app }) => {
    await signIn(app);
    await app.act('close', { window: 'main' });
    await app.waitState((x) => !x.windows.main.visible);
    await finderInFront();
    await app.act('summon');
    await app.waitState((x) => x.windows.floating.visible && x.windows.floating.focused);
    await app.until(`return document.activeElement === T.get('textbox', 'Task title')`, 'floating');
    expect(frontApp()).toBe('com.apple.finder');
    copyText('Call the bank');
    key('v');
    await app.until(`return T.get('textbox', 'Task title').value === 'Call the bank'`, 'floating');
    key('a');
    key('x');
    await app.until(`return T.get('textbox', 'Task title').value === ''`, 'floating');
    await expect.poll(pasteboard).toBe('Call the bank');
  });

  test('C20-D11 Tudu’s own ⌘ keys still reach the page in a panel: ⌘Enter in Quick Add adds the task', async ({
    app,
  }) => {
    await signIn(app);
    await app.act('summon');
    await app.waitState((x) => x.windows.floating.visible && x.windows.floating.focused);
    await app.until(`return document.activeElement === T.get('textbox', 'Task title')`, 'floating');
    await app.eval(`T.fill(T.get('textbox', 'Task title'), 'Water the plants')`, 'floating');
    await app.act('edit-key', { window: 'floating', key: 'enter', shift: false });
    await app.waitState((x) => !x.windows.floating.visible);
    const day = new Date().toLocaleDateString('en-CA');
    const me = await asPage<{ spaces: Array<{ id: string; kind: string }> }>(app, 'GET', '/api/me');
    const personal = me.spaces.find((s) => s.kind === 'personal')!;
    await expect
      .poll(async () => {
        const r = await asPage<{ tasks: Array<{ title: string }> }>(
          app,
          'GET',
          `/api/spaces/${personal.id}/days/${day}`,
        );
        return r.tasks.map((t) => t.title);
      })
      .toContain('Water the plants');
  });
});
