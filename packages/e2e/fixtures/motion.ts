import type { Locator, Page } from '@playwright/test';
import { expect } from './app';

/**
 * Checks that only a real browser can make: where text is actually painted, and whether something leaves with an
 * animation or vanishes in one frame. jsdom has no layout and the rest of the suite runs with reduced motion, so
 * neither shows up anywhere else. Use these for any element that swaps for another (a label for a field) or folds away.
 */

export interface Ink {
  /** First and last pixel rows (in device pixels, from the top of the clip) with anything drawn on them. */
  top: number;
  bottom: number;
}

type Clip = { x: number; y: number; width: number; height: number };

/**
 * The rows of `clip` that carry ink: a pixel that differs from the clip's top-left pixel (the background) by more than
 * `threshold` in any channel. Decoded in the page with createImageBitmap, so no image library is needed.
 */
export async function inkBounds(page: Page, clip: Clip, threshold = 48): Promise<Ink | null> {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(
    async ({ png, threshold }) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const bg = [data[0]!, data[1]!, data[2]!];
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (bg.some((v, c) => Math.abs(data[i + c]! - v) > threshold)) {
            if (top < 0) top = y;
            bottom = y;
            break;
          }
        }
      }
      return top < 0 ? null : { top, bottom };
    },
    { png, threshold },
  );
}

/** The sub-pixel positions a row is tried at: rounding differences only show at some of them. */
export const SUBPIXEL_OFFSETS = [0, 0.25, 0.5, 0.75];

/**
 * Fails if the text inside `text` is painted at a different height after `act` than before, with `row` nudged to each
 * of SUBPIXEL_OFFSETS. `text` is the part to compare (a label that becomes a field covers the same box in both
 * states); the caret is hidden so its blink cannot count as ink. `undo` puts the row back between offsets.
 */
export async function expectNoInkShift(
  page: Page,
  row: Locator,
  text: Locator,
  act: () => Promise<void>,
  undo: () => Promise<void>,
): Promise<void> {
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  for (const off of SUBPIXEL_OFFSETS) {
    await row.evaluate((e, off) => {
      (e as HTMLElement).style.marginTop = `${off}px`;
    }, off);
    await page.mouse.move(0, 0);
    await settle(page, row);
    // The clip follows the row, so a page that scrolls the field into view (phones) or a sheet still arriving does not
    // count: only text moving inside its row does.
    const box = (await text.boundingBox())!;
    const rowTop = (await row.boundingBox())!.y;
    const clipAt = async () => {
      const y = (await row.boundingBox())!.y + (box.y - rowTop);
      return { x: box.x, y, width: box.width, height: box.height };
    };
    const before = await inkBounds(page, await clipAt());
    await act();
    await page.mouse.move(0, 0);
    await settle(page, row);
    const after = await inkBounds(page, await clipAt());
    expect(before, `ink before, offset ${off}`).not.toBeNull();
    expect(after, `ink after, offset ${off}px`).toEqual(before);
    await undo();
  }
  await row.evaluate((e) => {
    (e as HTMLElement).style.marginTop = '';
  });
}

/** Wait until finite animations on the page are over and `el` has stayed put for a few frames. */
export async function settle(page: Page, el: Locator): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity))
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await el.evaluate(
    (e) =>
      new Promise<void>((done) => {
        let last = '';
        let still = 0;
        const tick = () => {
          const r = e.getBoundingClientRect();
          const now = `${r.x},${r.y},${r.width},${r.height}`;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 3) done();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

/** The element's height on every animation frame from just before `act` until `ms` after it. */
export async function sampleHeights(
  page: Page,
  el: Locator,
  act: () => Promise<void>,
  ms = 500,
): Promise<number[]> {
  await el.evaluate((e) => {
    const w = window as unknown as { __heights: number[]; __sampling: boolean };
    w.__heights = [];
    w.__sampling = true;
    const tick = () => {
      w.__heights.push(e.getBoundingClientRect().height);
      if (w.__sampling) requestAnimationFrame(tick);
    };
    tick();
  });
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as { __heights: number[]; __sampling: boolean };
    w.__sampling = false;
    return w.__heights;
  });
}

/** The series closes from open to 0 through at least `frames` heights in between; a snap has none. */
export function expectFolds(heights: number[], frames = 3): void {
  const start = heights[0]!;
  const end = heights[heights.length - 1]!;
  expect(start, 'open before').toBeGreaterThan(0);
  expect(end, 'closed after').toBe(0);
  const between = heights.filter((h) => h > end + 0.5 && h < start - 0.5);
  expect(
    between.length,
    `frames between open and closed: ${heights.map(Math.round).join(' ')}`,
  ).toBeGreaterThanOrEqual(frames);
}
