import { expect, type Locator } from '@playwright/test';

/**
 * Assertions about what a person sees, beside "the HTML is right" and "the text is there". They read computed styles
 * and boxes in the browser, so a rule lost to Tailwind's preflight or a chip that wraps fails here.
 */

/** Every list item's marker under `root`: there (not `list-style: none`), and readable on its background (3:1). */
export async function expectListMarkers(root: Locator): Promise<void> {
  // Measured until it settles: right after a theme change the colours are still easing across.
  let found: Marker[] = [];
  await expect
    .poll(
      async () => {
        found = await measureMarkers(root);
        return found.length > 0 && found.every((m) => m.contrast >= 3);
      },
      { timeout: 3000 },
    )
    .toBe(true)
    .catch(() => undefined);
  expect(found.length, 'the lists to check').toBeGreaterThan(0);
  for (const m of found) {
    expect(m.type, `the marker of "${m.text}"`).not.toBe('none');
    // outside markers need the list's padding to show in
    if (m.position === 'outside')
      expect(m.room, `room for the marker of "${m.text}"`).toBeGreaterThanOrEqual(12);
    expect(
      m.contrast,
      `the marker of "${m.text}" (${m.color} on ${m.bg}) against its background`,
    ).toBeGreaterThanOrEqual(3);
  }
}

interface Marker {
  text: string;
  type: string;
  position: string;
  room: number;
  contrast: number;
  color: string;
  bg: string;
}

function measureMarkers(root: Locator): Promise<Marker[]> {
  return root.evaluate((el) => {
    // Any CSS colour (oklch, color-mix…) to sRGB through a canvas, so contrast can be worked out.
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgb = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    /** The colour behind `node`: the first ancestor with a background that is not see-through. */
    const behind = (node: Element): [number, number, number] => {
      for (let n: Element | null = node; n; n = n.parentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c[3] > 0.95) return [c[0], c[1], c[2]];
      }
      const c = rgb(getComputedStyle(document.body).backgroundColor);
      return [c[0], c[1], c[2]];
    };
    const items = Array.from(el.querySelectorAll('ul:not(.tp-checks) > li, ol > li'));
    return items.map((li) => {
      const list = li.parentElement!;
      const marker = getComputedStyle(li, '::marker');
      const mc = rgb(marker.color);
      const bg = behind(li);
      // A marker drawn over its background (alpha blended) as the eye gets it.
      const seen = [0, 1, 2].map((i) => mc[i]! * mc[3] + bg[i]! * (1 - mc[3]));
      const [hi, lo] = [lum(seen), lum(bg)].sort((a, b) => b - a) as [number, number];
      return {
        text: (li.textContent ?? '').trim().slice(0, 30),
        type: getComputedStyle(li).listStyleType,
        position: getComputedStyle(li).listStylePosition,
        room: parseFloat(getComputedStyle(list).paddingLeft),
        contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
        color: marker.color,
        bg: `rgb(${bg.join(', ')})`,
      };
    });
  });
}

export interface ChipLook {
  /** The stem is cut with an ellipsis (a name too long for the chip). */
  cut: boolean;
  height: number;
  width: number;
}

/**
 * A file chip is one line: 26px high, its words inside it, inside `container`, and over no other line of the block
 * it sits in.
 */
export async function expectOneLineChip(chip: Locator, container: Locator): Promise<ChipLook> {
  await expect(chip).toBeVisible();
  const box = await container.boundingBox();
  const look = await chip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const stem = el.querySelector<HTMLElement>('.tp-att-stem');
    const ext = el.querySelector<HTMLElement>('.tp-att-ext');
    const size = el.querySelector<HTMLElement>('.tp-att-s');
    const block = el.closest('p, li, h2, h3, blockquote, div') ?? el.parentElement!;
    // the line boxes of the words around the chip in its block
    const others: DOMRect[] = [];
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (el.contains(n) || !(n.textContent ?? '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      others.push(...Array.from(range.getClientRects()));
    }
    const overlaps = others.filter((o) => {
      const x = Math.min(o.right, r.right) - Math.max(o.left, r.left);
      const y = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top);
      return x > 1 && y > 1;
    }).length;
    const oneLine = (e: HTMLElement | null) => !e || e.getClientRects().length <= 1;
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      height: r.height,
      width: r.width,
      rects: el.getClientRects().length,
      overflow: el.scrollWidth - el.clientWidth,
      cut: !!stem && stem.scrollWidth > stem.clientWidth + 1,
      ellipsis: stem ? getComputedStyle(stem).textOverflow : 'clip',
      partsOnOneLine: oneLine(stem) && oneLine(ext) && oneLine(size),
      extShown:
        !ext || (ext.getBoundingClientRect().width > 0 && ext.getBoundingClientRect().right <= r.right + 1),
      sizeShown:
        !size ||
        (size.getBoundingClientRect().width > 0 && size.getBoundingClientRect().right <= r.right + 1),
      overlaps,
    };
  });
  expect(look.height, 'the chip is one line high').toBeGreaterThanOrEqual(25);
  expect(look.height, 'the chip is one line high').toBeLessThanOrEqual(27.5);
  expect(look.rects, 'the chip is one box').toBe(1);
  expect(look.partsOnOneLine, 'the name and size each sit on one line').toBe(true);
  expect(look.overflow, 'nothing spills out of the chip').toBeLessThanOrEqual(1);
  expect(look.extShown, 'the extension shows').toBe(true);
  expect(look.sizeShown, 'the size shows').toBe(true);
  if (look.cut) expect(look.ellipsis, 'a long name ends with …').toBe('ellipsis');
  expect(look.overlaps, 'the chip lies over no other line').toBe(0);
  expect(box, 'the container').not.toBeNull();
  expect(look.left, 'inside the container (left)').toBeGreaterThanOrEqual(box!.x - 1);
  expect(look.right, 'inside the container (right)').toBeLessThanOrEqual(box!.x + box!.width + 1);
  return { cut: look.cut, height: look.height, width: look.width };
}
