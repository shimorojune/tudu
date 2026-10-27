import { expect, type Browser, type Page } from '@playwright/test';
import { codeFor, enterCode, freshEmail, quietFirstRun, signInFresh } from './app';
import { createSpace, joinLink, me, secondPerson } from './spaces';
import { fixClock, SUNDAY } from './today';

/**
 * The macOS app's side of the page, faked: what the app would answer and every call the page makes, on
 * window.__tuduDesktopFake (apps/web/src/app/desktop.ts reads it). Installed before every load of the page.
 */
export interface FakeInit {
  window?: 'main' | 'floating' | 'menubar';
  info?: { track?: string; name?: string; version?: string; noteShortcut?: string };
  update?: { version: string; notes: string; date: string | null } | null;
  failCheck?: boolean;
  refuseRestart?: boolean;
  /** Settings › This Mac as the app has it; the login switch answers `loginAnswer` when set. */
  thisMac?: { openAtLogin?: 'off' | 'on' | 'approval' | 'refused'; dock?: 'open' | 'always' };
  loginAnswer?: 'off' | 'on' | 'approval' | 'refused';
  /** An app older than update_status: no Check now. */
  noStatus?: boolean;
  /** A check's steps this far apart, so a test sees Checking… and Downloading. */
  stepMs?: number;
  /** The updater as the fake app has it. */
  status?: Partial<FakeStatus>;
  /** An app from before the note window: open_note is refused. */
  refuseOpenNote?: boolean;
  /** What a failed check failed at (`failCheck`): the feed by default. */
  errorKind?: 'check' | 'download' | 'signature';
}

/** The updater's state as the app sends it (`update:status`). */
export interface FakeStatus {
  checks: number;
  lastCheck: string | null;
  lastResult: 'none' | 'ready' | 'error' | null;
  lastManual: boolean;
  ready: { version: string; notes: string; date: string | null } | null;
  error: string | null;
  errorKind?: 'check' | 'download' | 'signature' | null;
  errorVersion?: string | null;
  downloads: number;
  checking: boolean;
  downloading: { version: string; received: number; total: number | null } | null;
}

/** The fake app's updater moves on: its status changes and every window hears `update:status`. */
export async function updaterSays(page: Page, patch: Partial<FakeStatus>): Promise<void> {
  await page.evaluate((p) => {
    const f = (
      window as unknown as {
        __tuduDesktopFake: { status?: object; listeners: Record<string, Array<(x: unknown) => void>> };
      }
    ).__tuduDesktopFake;
    f.status = {
      checks: 1,
      lastCheck: new Date().toISOString(),
      lastResult: 'none',
      lastManual: false,
      ready: null,
      error: null,
      downloads: 0,
      checking: false,
      downloading: null,
      ...f.status,
      ...p,
    };
    for (const fn of f.listeners['update:status'] ?? []) fn(f.status);
  }, patch);
}

export const NOTES = '### Features\n\n* The floating bar keeps your draft\n* Search finds a task by its key';
export const READY = { version: '0.38.0', notes: NOTES, date: '2026-10-18T09:00:00.000Z' };

export async function installFake(page: Page, init: FakeInit = {}): Promise<void> {
  await page.addInitScript((i) => {
    (window as unknown as { __tuduDesktopFake: unknown }).__tuduDesktopFake = {
      calls: [],
      listeners: {},
      ...i,
      info: { track: 'production', name: 'Tudu', version: '0.37.0', ...(i.info ?? {}) },
    };
  }, init);
}

type Call = { name: string; args: unknown[] };

/** The calls the page made to the app, optionally one kind. */
export async function calls(page: Page, name?: string): Promise<Call[]> {
  const all = await page.evaluate(
    () => (window as unknown as { __tuduDesktopFake: { calls: Call[] } }).__tuduDesktopFake.calls,
  );
  return name ? all.filter((c) => c.name === name) : all;
}

/** The last count the page put on the dock. */
export async function badge(page: Page): Promise<number | undefined> {
  return (await calls(page, 'setBadge')).at(-1)?.args[0] as number | undefined;
}

/** The app tells the page something: `go` (show a page) or `floating:shown` (the summon). */
export async function emit(page: Page, event: string, payload?: unknown): Promise<void> {
  await page.evaluate(
    ([e, p]) => {
      const f = (
        window as unknown as { __tuduDesktopFake: { listeners: Record<string, Array<(x: unknown) => void>> } }
      ).__tuduDesktopFake;
      for (const fn of f.listeners[e as string] ?? []) fn(p);
    },
    [event, payload] as const,
  );
}

/** Change what the fake answers from now on. */
export async function setFake(page: Page, patch: FakeInit): Promise<void> {
  await page.evaluate((p) => {
    Object.assign((window as unknown as { __tuduDesktopFake: object }).__tuduDesktopFake, p);
  }, patch);
}

/** Signed in, in the app, in a team space of your own (the Inbox lives in team spaces). */
export async function inAppWithTeam(page: Page, init: FakeInit = {}, name = 'Northwind'): Promise<string> {
  await fixClock(page);
  await installFake(page, init);
  await signInFresh(page);
  return createSpace(page, name);
}

/** You and a second person in one team space; the second person's page is a plain browser. */
export async function teamOfTwo(page: Page, browser: Browser, init: FakeInit = {}) {
  await fixClock(page);
  await installFake(page, init);
  await signInFresh(page);
  const b = await secondPerson(browser);
  await fixClock(b.page, new Date(SUNDAY.getTime() - 60_000));
  const slug = await createSpace(page, 'Northwind', [b.email]);
  await b.page.goto(await joinLink(page, b.email));
  await b.page.getByRole('button', { name: 'Join Northwind' }).click();
  await expect(b.page).toHaveURL(new RegExp(`/${slug}$`), { timeout: 10_000 });
  const mine = await me(page);
  const space = mine.spaces.find((s) => s.slug === slug)!;
  return { slug, space, b, aId: mine.userId, bId: (await me(b.page)).userId };
}

/** Sign in on a page that is already at Sign in (the floating flow hands you to it). */
export async function signInHere(page: Page, email = freshEmail()): Promise<string> {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await enterCode(page, await codeFor(page, email));
  await expect(
    page.getByRole('heading', { name: /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/ }),
  ).toBeVisible({ timeout: 10_000 });
  await quietFirstRun(page);
  return email;
}
