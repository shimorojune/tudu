# Tudu assets

## Logo
| File | Use |
| --- | --- |
| `tudu-mark.svg` | Primary mark, light grounds |
| `tudu-mark-reverse.svg` | On Dusk / dark grounds |
| `tudu-mark-mono.svg` | One color, no red offset square (favicon, stamps, print) |
| `tudu-lockup.svg` | Mark + Tudu wordmark, flush left |
| `tudu-mark-{1024,512,256,64,32}.png` | Raster, transparent ground |
| `tudu-icon-macos-1024.png` | App icon, padded on the ground color |
| `tudu-icon-macos-dark-1024.png` | Generated macOS app icon (dark ground + safe padding) |
| `icon-manifest.json` | Legacy Tauri icon manifest (prefer `npm run icons`) |

The mark is geometry, not set type: the T is two rectangles, so the SVGs render identically without Archivo installed. The wordmark in `tudu-lockup.svg` is live text in Archivo 800 — install the font or convert it to outlines before handing it to print.

Clear space equals the width of the red offset square (26% of the plate) on all four sides. Never round the plate, never recolor the T, never put the red square anywhere but bottom-right.

## Theme
- `theme.css` — shadcn/ui variables + Tailwind v4 `@theme inline`. Import after `@import "tailwindcss"`. Includes the Dusk dark variant under `.dark`.
- `tailwind.config.js` — Tailwind v3 fallback for the same tokens.
- `tokens.json` — raw design tokens, framework-agnostic.

Font: Archivo (400 body / 800 headings), `next/font` or `@fontsource/archivo`.

Two things to know before you plug it in:
1. **Radius is 0.** Modernist rounds nothing, so every shadcn default radius is zeroed. If you want soft corners you are off-system.
2. **The palette is mono.** There is one accent, so `--destructive` is the accent one step darker rather than a separate hue. Destructive actions need a word or an icon to read as destructive; color alone won't do it.
