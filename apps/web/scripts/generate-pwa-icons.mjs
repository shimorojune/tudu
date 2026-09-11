import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markSvg = path.join(root, "..", "..", "packages", "ui", "assets", "tudu-mark.svg");
const publicDir = path.join(root, "public");
const plate = "#201e1d";

mkdirSync(publicDir, { recursive: true });

async function squareMark(size) {
  return sharp(markSvg)
    .resize(size, size, { fit: "contain", background: plate })
    .flatten({ background: plate })
    .png()
    .toBuffer();
}

async function maskableMark(size) {
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  const mark = await sharp(markSvg)
    .resize(inner, inner, { fit: "contain", background: plate })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: plate,
    },
  })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
}

const outputs = [
  ["tudu-mark-32.png", () => squareMark(32)],
  ["apple-touch-icon.png", () => squareMark(180)],
  ["pwa-192.png", () => squareMark(192)],
  ["pwa-512.png", () => squareMark(512)],
  ["pwa-maskable-192.png", () => maskableMark(192)],
  ["pwa-maskable-512.png", () => maskableMark(512)],
];

for (const [name, build] of outputs) {
  writeFileSync(path.join(publicDir, name), await build());
}

console.log(`Wrote ${outputs.length} PWA icons to ${path.relative(root, publicDir)}`);
