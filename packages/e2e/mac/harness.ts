import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { API_PORT, WEB_PORT } from './playwright.config';

/**
 * The desktop group's harness: launch Tudu Test on a folder of its own, read its state and act on it over the
 * control channel, and drive its windows' pages with small scripts run in the real WKWebView.
 */
export const API = `http://localhost:${API_PORT}`;
export const WEB = `http://localhost:${WEB_PORT}`;
const ROOT = new URL('../../..', import.meta.url).pathname;
export const RUN_DIR = join(ROOT, '.local/mac-run');

interface Built {
  version: string;
  app: string;
  update: string;
  signature: string;
}
export interface Run {
  current: Built;
  next: Built;
  pubkey: string;
}
export function run(): Run {
  return JSON.parse(readFileSync(join(RUN_DIR, 'run.json'), 'utf8')) as Run;
}

export interface WindowState {
  visible: boolean;
  focused: boolean;
  minimized: boolean;
  alwaysOnTop: boolean;
  decorated: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  screen: { x: number; y: number; width: number; height: number } | null;
  url: string;
}
export interface AppState {
  track: string;
  name: string;
  identifier: string;
  version: string;
  pid: number;
  windows: { main: WindowState; floating: WindowState };
  tray: {
    tooltip: string;
    items: Array<{ id?: string; text?: string; accelerator?: string | null; separator?: boolean }>;
  };
  shortcut: { accelerator: string; registered: boolean };
  badge: string | null;
  updater: {
    checks: number;
    downloads: number;
    lastCheck: string | null;
    lastResult: 'none' | 'ready' | 'error' | null;
    ready: { version: string; notes: string; date: string | null } | null;
    error: string | null;
  };
  seen: { signedIn: boolean; badge: number | null; opened: string[]; saved: string[] };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

/** Helpers every page script can use: find by role and name, click, fill, press a key, read text. */
const LIB = String.raw`
const T = {
  visible: (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  name: (el) => (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim(),
  roles: {
    button: 'button,[role=button],[role=menuitem],[role=menuitemradio],[role=tab],[role=option]',
    textbox: 'input:not([type=checkbox]):not([type=file]),textarea,[contenteditable=true]',
    link: 'a[href]',
    heading: 'h1,h2,h3,h4,[role=heading]',
    article: 'article,[role=article]',
  },
  all(role, name, root = document) {
    const els = [...root.querySelectorAll(T.roles[role] || role)].filter(T.visible);
    if (name === undefined) return els;
    return els.filter((el) => (name instanceof RegExp ? name.test(T.name(el)) : T.name(el) === name));
  },
  get(role, name, root) {
    const el = T.all(role, name, root)[0];
    if (!el) throw new Error('no ' + role + ' named ' + name);
    return el;
  },
  click(el) {
    el.scrollIntoView({ block: 'center' });
    const o = { bubbles: true, cancelable: true, view: window, button: 0, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.focus && el.focus();
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  },
  fill(el, value) {
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  press(key, el = document.activeElement || document.body) {
    const o = { key, code: key === 'Escape' ? 'Escape' : key === 'Enter' ? 'Enter' : key, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', o));
    el.dispatchEvent(new KeyboardEvent('keyup', o));
  },
  text: (sel = 'body') => (document.querySelector(sel) || document.body).innerText,
};
`;

export class TuduApp {
  child: ChildProcess | null = null;
  port = 0;
  readonly log: string;
  private pids = new Set<number>();

  constructor(
    readonly dir: string,
    readonly bundle: string,
  ) {
    this.log = join(dir, 'app.log');
  }

  /** The app's executable inside its bundle. */
  get binary(): string {
    return join(this.bundle, 'Contents/MacOS/Tudu Test');
  }

  async launch(): Promise<void> {
    if (!this.port) this.port = await freePort();
    rmSync(join(this.dir, 'control.json'), { force: true });
    const out = openSync(this.log, 'a');
    this.child = spawn(this.binary, [], {
      stdio: ['ignore', out, out],
      env: {
        ...process.env,
        TUDU_TEST_PORT: String(this.port),
        TUDU_TEST_DATA: this.dir,
        TUDU_TEST_WEB: WEB,
        TUDU_TEST_API: API,
      },
    });
    await this.ready();
  }

  /** The channel answers (after a launch or a relaunch on update). */
  async ready(timeout = 30_000): Promise<AppState> {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        const s = await this.state();
        this.pids.add(s.pid);
        return s;
      } catch {
        await sleep(150);
      }
    }
    throw new Error(`Tudu Test did not answer on ${this.port}; see ${this.log}`);
  }

  private async call(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return res.json();
  }

  async state(): Promise<AppState> {
    return (await this.call('/state')) as AppState;
  }

  /** What a person does outside the page: summon, tray (item), reopen, close (window), check-update, quit. */
  async act(what: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    return this.call('/act', { do: what, ...extra });
  }

  /** Run `script` (an async function body with T, the page helpers) in a window's page; answers its result. */
  async eval<R = unknown>(
    script: string,
    window: 'main' | 'floating' = 'main',
    timeoutMs = 10_000,
  ): Promise<R> {
    const r = (await this.call('/eval', { window, script: `${LIB}\n${script}`, timeoutMs })) as {
      ok: boolean;
      value?: R;
      error?: string;
    };
    if (!r.ok) throw new Error(`in ${window}: ${r.error}`);
    return r.value as R;
  }

  /**
   * Wait until the script answers something truthy (no sleeping: it asks again until then).
   * Each ask is short: one injected while the page is navigating never replies, and it must not eat the whole wait.
   */
  async until<R>(script: string, window: 'main' | 'floating' = 'main', timeout = 10_000): Promise<R> {
    const end = Date.now() + timeout;
    let last: unknown = null;
    while (Date.now() < end) {
      try {
        const v = await this.eval<R>(script, window, Math.max(250, Math.min(2_000, end - Date.now())));
        if (v) return v;
        last = v;
      } catch (e) {
        last = e;
      }
      await sleep(100);
    }
    throw new Error(`timed out waiting in ${window} for: ${script}\nlast: ${String(last)}`);
  }

  /** Wait until the app's state passes `ok`. */
  async waitState(ok: (s: AppState) => boolean, timeout = 10_000): Promise<AppState> {
    const end = Date.now() + timeout;
    let s: AppState | null = null;
    while (Date.now() < end) {
      try {
        s = await this.state();
        if (ok(s)) return s;
      } catch {
        /* relaunching */
      }
      await sleep(100);
    }
    throw new Error(`state never matched; last: ${JSON.stringify(s)}`);
  }

  /** Quit as ⌘Q would, and wait for the process to end. */
  async quit(): Promise<void> {
    const pid = (await this.state().catch(() => null))?.pid;
    await this.act('quit').catch(() => {});
    if (pid) await waitGone(pid);
  }

  /** End every process this test started, whatever state it is in. */
  async stop(): Promise<void> {
    await this.act('quit').catch(() => {});
    for (const pid of this.pids) {
      if (!(await waitGone(pid, 3000))) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* gone */
        }
      }
    }
  }
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitGone(pid: number, timeout = 10_000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (!alive(pid)) return true;
    await sleep(100);
  }
  return !alive(pid);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** A copy of a built bundle in the test's folder: an update replaces it, never the build. */
export function copyBundle(from: string, dir: string): string {
  const to = join(dir, 'Tudu Test.app');
  const r = spawnSync('ditto', [from, to]);
  if (r.status !== 0) throw new Error(`ditto failed: ${r.stderr}`);
  return to;
}

// ---- the API, as the harness (not the app) reaches it ----------------------------------------------------------

let n = 0;
export function freshEmail(tag = 'mac'): string {
  n += 1;
  return `${tag}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}-${n}@test.tudu`;
}

export async function codeFor(email: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const r = (await (await fetch(`${API}/__test/outbox/code?to=${encodeURIComponent(email)}`)).json()) as {
      code: string | null;
    };
    if (r.code) return r.code;
    await sleep(100);
  }
  throw new Error(`no code for ${email}`);
}

/** A person signed in outside the app (the harness itself), with their cookie. */
export async function person(email = freshEmail('other')) {
  const headers = { 'content-type': 'application/json', origin: WEB };
  await fetch(`${API}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  const res = await fetch(`${API}/api/auth/sign-in/email-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp: await codeFor(email) }),
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { ...headers, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
    return (await r.json()) as T;
  };
  const me = await call<{ user: { id: string } }>('GET', '/api/me');
  return { email, id: me.user.id, call };
}

/** Publish a release on the fake GitHub and clear the feed's cache. */
export async function publish(
  version: string,
  bundle: string,
  signature: string,
  notes = '### Features\n\n* The floating bar keeps your draft',
): Promise<void> {
  await fetch(`${API}/__test/github/down`, { method: 'POST', body: JSON.stringify({ down: false }) });
  const r = await fetch(`${API}/__test/github/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tag: `tudu-${version}`,
      body: notes,
      assets: [
        { name: 'Tudu Test.app.tar.gz', file: bundle },
        { name: 'Tudu Test.app.tar.gz.sig', file: signature },
      ],
    }),
  });
  expect(r.status).toBe(200);
  await fetch(`${API}/__test/updates/reset`, { method: 'POST' });
}

export async function feedDown(down = true): Promise<void> {
  await fetch(`${API}/__test/github/down`, { method: 'POST', body: JSON.stringify({ down }) });
  await fetch(`${API}/__test/updates/reset`, { method: 'POST' });
}

export async function noReleases(): Promise<void> {
  await fetch(`${API}/__test/github/releases`, { method: 'DELETE' });
  await fetch(`${API}/__test/updates/reset`, { method: 'POST' });
}

/**
 * A new, empty folder for one launch. Its real path: macOS's temporary folder sits behind the /var symlink, and the
 * updater refuses to install over an app it finds through a symlink (an installed app never is).
 */
export function freshFolder(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'tudu-test-')));
}

// ---- the fixture ------------------------------------------------------------------------------------------------

/**
 * `app`: Tudu Test (this version) launched on a fresh folder, stopped after the test. On a failure the app's log
 * and a capture of the screen are kept with the test's results.
 */
export const test = base.extend<{ app: TuduApp; folder: string; release: 'next' | 'bad' | null }>({
  /** A release on the feed before the app launches: the next version, or the next with a signature that fails. */
  release: [null, { option: true }],
  // Playwright reads the fixtures a fixture needs from its first argument, so it stays a pattern even when empty.
  // eslint-disable-next-line no-empty-pattern
  folder: async ({}, provide) => {
    const dir = freshFolder();
    await provide(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  app: async ({ folder, release }, provide, info) => {
    await noReleases();
    const r = run();
    // A bad one: the next version's bundle with this version's signature.
    if (release === 'next') await publish(r.next.version, r.next.update, r.next.signature);
    if (release === 'bad') await publish(r.next.version, r.next.update, r.current.signature);
    const app = new TuduApp(folder, copyBundle(run().current.app, folder));
    await app.launch();
    try {
      await provide(app);
    } finally {
      if (info.status !== info.expectedStatus) {
        const shot = info.outputPath('screen.png');
        mkdirSync(info.outputDir, { recursive: true });
        spawnSync('screencapture', ['-x', shot]);
        if (existsSync(shot)) await info.attach('screen', { path: shot, contentType: 'image/png' });
        try {
          await info.attach('state', {
            body: JSON.stringify(await app.state(), null, 2),
            contentType: 'application/json',
          });
        } catch {
          /* not running */
        }
      }
      await app.stop();
      if (existsSync(app.log)) await info.attach('app.log', { path: app.log, contentType: 'text/plain' });
    }
  },
});
export { expect };

// ---- the page, in the app ---------------------------------------------------------------------------------------

/** Sign in on the desk with a fresh address, typed into the real page; lands on Today. */
export async function signIn(app: TuduApp, email = freshEmail()): Promise<string> {
  await app.until(`return location.pathname === '/sign-in' && !!T.all('textbox', 'Email')[0]`);
  await app.eval(
    `T.fill(T.get('textbox', 'Email'), ${JSON.stringify(email)}); T.click(T.get('button', 'Continue'));`,
  );
  await app.until(`return T.all('heading', 'Check your email').length > 0`);
  const code = await codeFor(email);
  await app.eval(`T.fill(T.get('textbox', 'The 6-digit code'), ${JSON.stringify(code)});`);
  await onToday(app);
  // Getting started hidden the way × hides it (the app's own hook), as the web tests do.
  await app.until(`return typeof window.__tudu?.firstRun?.hide === 'function'`);
  await app.eval(`await window.__tudu.firstRun.hide();`);
  // The desk has told the app (the summon opens the bar from now on).
  await app.waitState((s) => s.seen.signedIn);
  return email;
}

/** The desk shows a day's Today (its weekday heading). */
export async function onToday(app: TuduApp, timeout = 15_000): Promise<void> {
  await app.until(
    `return T.all('heading', /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/).length > 0`,
    'main',
    timeout,
  );
}

/** Call the API as the page's own person (its session cookie), from inside the page. */
export async function asPage<T = unknown>(
  app: TuduApp,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return app.eval<T>(`
    const r = await fetch(${JSON.stringify(API + path)}, {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: ${body === undefined ? 'undefined' : JSON.stringify(JSON.stringify(body))},
    });
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()));
    return r.json();`);
}

export interface Space {
  id: string;
  slug: string;
  name: string;
  kind: string;
}

/** Make a team space as the page's person and open its Today. */
export async function teamSpace(app: TuduApp, name: string, invites: string[] = []): Promise<Space> {
  const r = await asPage<{ space: Space }>(app, 'POST', '/api/spaces', { name, color: '#3d5a80', invites });
  await go(app, `/${r.space.slug}`);
  return r.space;
}

/** Move the desk to a page of the app, as a link would. */
export async function go(app: TuduApp, path: string): Promise<void> {
  await app.eval(`location.assign(${JSON.stringify(WEB + path)})`).catch(() => {});
  await app.until(
    `return location.pathname === ${JSON.stringify(path.split('?')[0])} && document.readyState === 'complete'`,
  );
}

/** The sidebar's Inbox count on the desk (0 when none shows). */
export async function sidebarInbox(app: TuduApp): Promise<number> {
  return app.eval<number>(`
    const b = T.all('button', /^Inbox/, document.querySelector('nav[aria-label="Main"]') || document)[0];
    const m = b && /([0-9]+)/.exec(T.name(b));
    return m ? Number(m[1]) : 0;`);
}

/** Write tasks straight through sync as the page's person. */
export async function writeTask(app: TuduApp, spaceId: string, title: string, day: string, notes?: string) {
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const mutations: unknown[] = [
    {
      id: crypto.randomUUID(),
      type: 'task.create',
      payload: { id, spaceId, title, day, position: 1024 },
      at,
    },
  ];
  if (notes) mutations.push({ id: crypto.randomUUID(), type: 'task.notes', payload: { id, notes }, at });
  await asPage(app, 'POST', '/api/sync', { clientId: 'mac-seed', mutations });
  return id;
}
