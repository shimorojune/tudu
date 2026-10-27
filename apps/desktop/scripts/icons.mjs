#!/usr/bin/env node
// The app and tray icons, drawn from the Logo board's stacked ink tick (packages/ui Logo and INK_SHAPE):
// `pnpm --filter @tudu/desktop icons` rewrites src-tauri/icons. The Dock icon sits on Apple's grid (a 1024 canvas,
// an 824 paper tile inset 100 with 22.37% corners, the mark at 76% of the tile); the tray icon is a 36px template
// (black on clear, 18pt @2x): the bare ink tick, as every menu bar board draws it, and the same tick with the Inbox
// dot (tray-dot).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const icons = join(desktop, 'src-tauri/icons');
const ink = readFileSync(resolve(desktop, '../../packages/ui/src/lib/ink.tsx'), 'utf8');
const shape = /INK_SHAPE\s*=\s*\n?\s*['"`]([^'"`]+)['"`]/.exec(ink)?.[1];
if (!shape) throw new Error('INK_SHAPE not found in packages/ui/src/lib/ink.tsx');

// The mark as Logo draws it (viewBox 9.5 13.5 101 99.5), light colours.
const mark = (fg = '#18181b') => `
  <rect x="17" y="25" width="74" height="74" rx="20" transform="rotate(-10 54 62)" fill="#e8361b"/>
  <rect x="24" y="34" width="74" height="74" rx="20" fill="#fffdf8" stroke="#b5b2aa" stroke-width="6"/>
  <path transform="translate(27.89 6.74) scale(3.5702)" d="${shape}" fill="${fg}"/>`;

const tile = 824;
const inset = 100;
const markBox = tile * 0.76;
const scale = markBox / 101;
const offset = inset + (tile - markBox) / 2;
const app = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <filter id="s" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${tile * 0.2237}" fill="#fffdf8" filter="url(#s)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale}) translate(-9.5 -13.5)">${mark()}</g>
</svg>`;

// Tray: the ink tick alone, black on clear. The boards draw it 16pt in the bar's 18pt slot, so the 24-unit tick sits
// in a 27-unit view: 1.5 units of air all round.
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="-1.5 -1.5 27 27">
  <path d="${shape}" fill="#000"/>
</svg>`;

// Tray with the Inbox dot: a 5pt dot at the tick's top right, inside the view, cut from the tick by a 1.33pt clear ring
// (the boards' 6px dot and 1.5px ring at the 16pt tick, eased in so nothing is cropped). Still black on clear.
const dot = { cx: 21, cy: 3, r: 3.75, ring: 2 };
const trayDot = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="-1.5 -1.5 27 27">
  <mask id="clear"><rect x="-1.5" y="-1.5" width="27" height="27" fill="#fff"/><circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r + dot.ring}" fill="#000"/></mask>
  <path d="${shape}" fill="#000" mask="url(#clear)"/>
  <circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="#000"/>
</svg>`;

const work = mkdtempSync(join(tmpdir(), 'tudu-icons-'));
try {
  writeFileSync(join(work, 'app.svg'), app);
  writeFileSync(join(work, 'tray.svg'), tray);
  writeFileSync(join(work, 'tray-dot.svg'), trayDot);
  const tauri = (args) =>
    execFileSync('pnpm', ['exec', 'tauri', 'icon', ...args], { cwd: desktop, stdio: 'inherit' });
  tauri([join(work, 'app.svg'), '-o', icons]);
  tauri([join(work, 'tray.svg'), '-o', join(work, 'tray'), '-p', '36']);
  copyFileSync(join(work, 'tray/36x36.png'), join(icons, 'tray.png'));
  tauri([join(work, 'tray-dot.svg'), '-o', join(work, 'tray-dot'), '-p', '36']);
  copyFileSync(join(work, 'tray-dot/36x36.png'), join(icons, 'tray-dot.png'));
  writeFileSync(join(icons, 'app.svg'), app);
  writeFileSync(join(icons, 'tray.svg'), tray);
  writeFileSync(join(icons, 'tray-dot.svg'), trayDot);
  // macOS only: the Windows, Android and iOS sizes tauri icon also writes are dropped.
  for (const f of readdirSync(icons))
    if (/^(android|ios|Square|StoreLogo|icon\.ico|64x64)/.test(f))
      rmSync(join(icons, f), { recursive: true });
} finally {
  rmSync(work, { recursive: true, force: true });
}
