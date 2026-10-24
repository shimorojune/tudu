import type { Page } from '@playwright/test';
import { expect } from './app';

/** The page column and what sits in it on the desk: the sheet, and the banner above it when there is one. */
export async function pageBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    return {
      column: box(document.querySelector('.app-page')),
      sheet: box(document.querySelector('.app-page > .tp-sheet')),
      banner: box(document.querySelector('.app-page > .tp-banner-wrap')),
    };
  });
}

/** The sheet is `width` wide (or the whole column when that is narrower) and centred in the page column. */
export async function expectSheetWidth(page: Page, width: number): Promise<void> {
  await expect
    .poll(async () => {
      const { column, sheet } = await pageBoxes(page);
      if (!column || !sheet) return 'no sheet';
      const want = Math.min(width, column.width);
      const gapL = sheet.left - column.left;
      const gapR = column.right - sheet.right;
      return Math.abs(sheet.width - want) <= 1 && Math.abs(gapL - gapR) <= 1
        ? 'ok'
        : `${sheet.width} in ${column.width}`;
    })
    .toBe('ok');
}
