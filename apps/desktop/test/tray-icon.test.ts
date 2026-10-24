import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = resolve(desktop, 'src-tauri/icons');
const ink = readFileSync(resolve(desktop, '../../packages/ui/src/lib/ink.tsx'), 'utf8');
const shape = /INK_SHAPE\s*=\s*\n?\s*['"`]([^'"`]+)['"`]/.exec(ink)?.[1];

/** An 8-bit RGBA PNG as width, height and its alpha per pixel (what a template image is made of). */
function alpha(file: string): { width: number; height: number; at: (x: number, y: number) => number } {
  const png = readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect([body[8], body[9]]).toEqual([8, 6]);
    }
    if (type === 'IDAT') data.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const cur = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? out[y * stride + i - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][filter];
      out[y * stride + i] = (cur + pred) & 0xff;
    }
  }
  return { width, height, at: (x, y) => out[y * stride + x * 4 + 3] };
}

describe('the menu bar tick', () => {
  it('MB-S01 tray.svg is the bare ink tick: one path, no box, black on clear, 36 by 36', () => {
    const svg = readFileSync(resolve(icons, 'tray.svg'), 'utf8');
    expect(svg).toContain('width="36" height="36"');
    expect(svg).not.toMatch(/<rect/);
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).toContain(`d="${shape}"`);
    expect(svg).toContain('fill="#000"');
  });

  it('MB-S02 tray.png is that tick drawn: 36 by 36, ink in the middle, clear where the old box sat', () => {
    const png = alpha(resolve(icons, 'tray.png'));
    expect([png.width, png.height]).toEqual([36, 36]);
    let inked = 0;
    for (let y = 0; y < 36; y++) for (let x = 0; x < 36; x++) if (png.at(x, y) > 128) inked++;
    // The tick is ink, but far less of the square than a box and a tick.
    expect(inked).toBeGreaterThan(40);
    expect(inked).toBeLessThan(260);
    // The box's bottom edge and its left side ran here; the bare tick leaves them clear.
    for (let x = 0; x < 36; x++) for (let y = 32; y < 36; y++) expect(png.at(x, y)).toBeLessThan(16);
    for (let y = 0; y < 36; y++) for (let x = 0; x < 3; x++) expect(png.at(x, y)).toBeLessThan(16);
  });
});
