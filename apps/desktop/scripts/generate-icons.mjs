import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "..", "..", "packages", "ui", "assets");
const iconsDir = path.join(root, "src-tauri", "icons");
const publicDir = path.join(root, "public");
const size = 1024;
const markScale = 0.76;
const markSize = Math.round(size * markScale);
const offset = Math.round((size - markSize) / 2);
const cornerFraction = 0.2237;

mkdirSync(assetsDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

async function squircleMask(targetSize) {
  const radius = targetSize * cornerFraction;
  const svg = `<svg width="${targetSize}" height="${targetSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${targetSize}" height="${targetSize}" rx="${radius}" ry="${radius}" fill="white"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function applySquircle(input, targetSize) {
  const mask = await squircleMask(targetSize);
  return sharp(input)
    .resize(targetSize, targetSize)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

const background = await sharp({
  create: {
    width: size,
    height: size,
    channels: 4,
    background: "#201e1d",
  },
})
  .png()
  .toBuffer();

const mark = await sharp(path.join(assetsDir, "tudu-mark-1024.png"))
  .resize(markSize, markSize)
  .toBuffer();

const macIcon = await sharp(background)
  .composite([{ input: mark, left: offset, top: offset }])
  .png()
  .toBuffer();

const roundedSource = await applySquircle(macIcon, size);
const macIconPath = path.join(assetsDir, "tudu-icon-macos-dark-1024.png");
writeFileSync(macIconPath, roundedSource);

execSync(`npx tauri icon "${macIconPath}" -o "${iconsDir}"`, {
  cwd: root,
  stdio: "inherit",
});

// tauri icon can flatten corners. Re-apply the mask to every PNG the dock uses.
const pngTargets = [
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
];

for (const [name, px] of pngTargets) {
  writeFileSync(path.join(iconsDir, name), await applySquircle(roundedSource, px));
}

const iconset = path.join(os.tmpdir(), `tudu-iconset-${Date.now()}.iconset`);
mkdirSync(iconset, { recursive: true });
const icnsEntries = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];
for (const [name, px] of icnsEntries) {
  writeFileSync(path.join(iconset, name), await applySquircle(roundedSource, px));
}
execSync(`iconutil -c icns "${iconset}" -o "${path.join(iconsDir, "icon.icns")}"`);
rmSync(iconset, { recursive: true, force: true });

const dockDevIcon = await applySquircle(roundedSource, 512);
writeFileSync(path.join(iconsDir, "dock-dev.png"), dockDevIcon);

copyFileSync(
  path.join(assetsDir, "tudu-mark-32.png"),
  path.join(publicDir, "tudu-mark-32.png"),
);

console.log(`Generated rounded macOS icons from ${path.relative(root, macIconPath)}`);
