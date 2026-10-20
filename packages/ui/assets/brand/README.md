# Brand — the stacked ink tick

The stacked ink tick: today's paper box with the app's own tapered ink tick breaking out past its top-right corner, and an ember sheet tilted behind it, the next day waiting. It is the Tudu checkbox, so the logo and the product say the same thing.

## Files

- `tudu-mark.svg`: the mark on light grounds (`background`, `card`). Default.
- `tudu-mark-dark.svg`: the mark on dark grounds.
- `tudu-mark-mono.svg`: one ink, for single-colour printing, stamps and embossing. Drawn in `foreground` light (#18181b); on a dark ground recolour every fill and stroke to `foreground` dark (#f2efe8). The back sheet is cut back around the box so it still reads as two sheets.
- `tudu-lockup.svg`, `tudu-lockup-dark.svg`: the mark with "Tudu" in Geist Semibold, outlined (no font needed), tracking -0.035em, the word centred on the box. Use the file as drawn; don't re-set the word.
- `tudu-app-icon.svg`, `tudu-app-icon-dark.svg` (+ `-1024.png`): a paper tile with 22.5% corners and the paper grain, the mark at 62% of the tile. Platforms that mask their own shape (iOS, Android adaptive) take the 1024 PNG.
- `tudu-favicon-32.png`, `tudu-mark@2x.png`, `tudu-lockup@2x.png`: raster copies for places that can't take SVG. This folder also has 16/32/48 favicons (light and dark), `favicon.ico` (16+32+48), app icons at 32–1024 and dark rasters.

## macOS

- `tudu-app-icon-macos.svg` / `-dark.svg` + `-1024.png`: the Dock icon on Apple's icon grid (1024 canvas, 824 tile inset 100, corner 22.37%, the standard drop shadow baked in). The mark fills 76% of the tile so it holds its own at Dock size. Feed the 1024 PNG to `tauri icon` / `iconutil` like any app icon; the standard `.icns` sizes (16–1024) come from it.
- `tudu-tray-template.svg` + `tudu-tray-template.png` (36×36): the menu-bar icon. Black on transparent only, so macOS can tint it (`icon_as_template(true)` in Tauri). Tauri's tray draws every tray image 18pt tall, so 36px is exactly 18pt @2x: no resampling. It is the box and the tick only, with a heavier edge; the back sheet doesn't survive at 18pt.

## Colours

| Part           | Token          | Light   | Dark    |
| -------------- | -------------- | ------- | ------- |
| Today's box    | `card`         | #fffdf8 | #1d1c1a |
| Box edge       | `check-border` | #b5b2aa | #6f6b64 |
| Ink tick, word | `foreground`   | #18181b | #f2efe8 |
| Back sheet     | `brand`        | #e8361b | #ff6a4a |

## Clear space and size

- Clear space on every side: a quarter of the mark's width. Nothing else (text, edges, other logos) enters it.
- Minimum size: the mark 16px tall (favicon); the lockup 20px tall. Below 24px the back sheet becomes a sliver; that's expected.
- In the app's top bar the mark sits at 24–26px beside the word, or use the lockup at 24px tall.

## Don't

- Don't straighten or recolour the back sheet, or move it in front of the box.
- Don't put the tick inside the box; it always breaks out of the corner.
- Don't add shadows, gradients, outlines or a container around the mark (the app icon tile is the only container).
- Don't use the old square-plate mark.

## Replaces

The files one level up (`tudu-mark*.svg`, `tudu-lockup.svg`, `tudu-mark-*.png`, `tudu-icon-macos-*.png`) are the old square-plate mark. They are left in place until the app switches to this folder.
