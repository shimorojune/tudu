import type { Locator, Page } from '@playwright/test';
import { row } from './today';

/**
 * Right-click a row's title (the menu opens at the pointer). The row is scrolled into view first and the scroll let
 * settle: the menu closes on a scroll, and the scroll event of Playwright's own scroll-before-click lands a frame
 * after the click in a scrolling sheet (the phone's week).
 */
export async function rightClick(list: Locator, title: string, at = { x: 24, y: 8 }): Promise<void> {
  const target = row(list, title).locator('.tp-title > .tp-strike');
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await target.click({ button: 'right', position: at });
}

export function menu(page: Page, title?: string): Locator {
  return page.getByRole('menu', { name: title ? `Actions for ${title}` : /^Actions for / });
}

/** Pick through the menu: a parent ("Move to") opens its submenu, the last name is the pick. */
export async function pick(page: Page, ...names: Array<string | RegExp>): Promise<void> {
  const ctx = page.locator('.tp-ctx');
  for (const name of names) {
    const by = typeof name === 'string' ? { name, exact: true } : { name };
    await ctx.getByRole('menuitem', by).or(ctx.getByRole('menuitemradio', by)).first().click();
  }
}

export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('.tp-toast').filter({ hasText: text });
}
