# Notebook: drawings readable in dark mode (#55)

Status: proposal, 5 Nov 2026. Canvas approved by Rohit on 5 Nov: Notebook page, boards `P-DrawDark` and
`P-DrawDark-Dark`, sticky `p21-darkdraw-draft` (v178). Issue: https://github.com/shimorojune/tudu/issues/55.

## 1. The bug

In dark mode, a drawing's picture in the note keeps its dark lines, so on the dark note it is close to invisible (the
issue's screenshot, Mac app 0.40.0). Full size, Excalidraw shows the drawing correctly in dark mode.

**Cause.** On Done, `DrawingSheet.pictures()` makes two PNGs with Excalidraw's `exportToBlob`, one with
`exportWithDarkMode: false` and one with `true`. Excalidraw 0.18.1 makes the dark one by setting
`ctx.filter = "invert(93%) hue-rotate(180deg)"` on the export canvas (`bootstrapCanvas` in its bundle). WebKit's
`CanvasRenderingContext2D` ignores `filter`, so in the Mac app (WKWebView) and in Safari the "dark" PNG comes out as a
second copy of the light one, and the server stores it as `preview_dark`. Full size is fine because there Excalidraw
uses a CSS rule (`.excalidraw.theme--dark canvas { filter: var(--theme-filter) }`), and CSS filters work in WebKit.
Chrome and Firefox support `ctx.filter`, so drawings saved from the web in those browsers are correct.

Two things are broken:

1. **New saves** from WebKit keep storing a light picture as the dark one.
2. **Saved drawings**: every drawing last saved from the Mac app or Safari has a bad `preview_dark` in the database
   already.

## 2. The fix

### 2.1 Tudu makes the dark picture itself

`pictures()` stops asking Excalidraw for dark mode and applies the flip itself, on every browser, so all platforms take
the same path:

1. **Light**: unchanged, `exportToBlob` with `exportWithDarkMode: false`.
2. **Dark**:
   - Pre-flip each image in the drawing: every file in `api.getFiles()` that is not SVG is drawn to a canvas,
     transformed with Excalidraw's image filter (`invert(100%) hue-rotate(180deg) saturate(1.25)`) and turned back into
     a data URL. Full size, Excalidraw does the same thing to images in dark mode, so that the whole-canvas flip
     brings them back near their real colours (its `A1` rule: dark theme, image loaded, not SVG).
   - `exportToCanvas` (light, `exportBackground: false`) with those pre-flipped files.
   - `getImageData`, apply `invert(93%) hue-rotate(180deg)` to each pixel, `putImageData`, `toBlob('image/png')`.
3. The per-pixel maths goes in a new pure module, `packages/ui/src/lib/drawing-dark.ts`, so it can be unit tested
   without a canvas:
   - `flipForDark(data: Uint8ClampedArray)`: the theme filter, in place. Each step is the Filter Effects matrix,
     clamped to 0–255 between steps the way a CSS filter list is applied. Alpha is untouched, so transparent pixels
     stay transparent.
   - `preflipImage(data)`: the image filter, in place.
   - Both work in sRGB, which is how Chrome draws `ctx.filter`. Tested against values sampled from Chrome's own
     `ctx.filter` output for a few colours, with ±3 per channel allowed.
4. **If the dark picture fails** (for example, the canvas is too large for the device's memory), the light picture still
   goes up and the dark one is sent as `null`. The note then falls back as in §2.2. `DrawingPictures.dark` becomes
   `Blob | null`, and the web's Done handler uploads only what it was given. If the light picture fails, the result is
   the same as today: no pictures, and the block says "Picture not ready".
5. `ExcalidrawModule` gains `exportToCanvas` (Excalidraw already exports it, so the chunk doesn't grow).

Cost: one extra pass over the pixels of a picture that is at most `PICTURE_MAX_PX` wide, plus one decode per image
(only for drawings that contain images). This runs on Done, while the close animation plays, which is where pictures
are made today.

### 2.2 Saved drawings show correctly straight away

- **Server, at read time.** `drawingsOf` and `drawingRead` join `attachments` twice and return `previewDark: null`
  when the dark attachment has the same `size` as the light one. The broken pictures are byte-for-byte renders of the
  same scene, so their sizes match. Two genuinely different PNGs matching in size by chance is very unlikely, and the
  only effect would be the fallback below. Doing this at read time, not in a migration, also covers Mac apps that
  haven't updated yet and keep saving copies. No migration, nothing deleted: the next save replaces the copy as usual
  (the existing "pictures it no longer shows go for good" path).
- **Client fallback.** `NoteDrawing`: when the theme is dark and there is a light picture but no dark one, it shows the
  light picture with a new class, `tp-nb-draw-flip`
  (`filter: invert(93%) hue-rotate(180deg)`, the same filter Excalidraw uses full size). Today that case shows the
  plain light picture, which is the bug again.
- **Trade-off (on the canvas):** in these older drawings, a pasted screenshot is flipped as well until the drawing is
  next edited and saved. Opening one and pressing Done without a change doesn't save (nothing is dirty), so it stays
  flipped until a real edit. I'm not adding a forced re-save: it would make a new revision for every drawing someone
  just looks at.

### 2.3 Switching theme

- `NoteDrawing` preloads the picture for the other theme (`new Image().src = …` once per URL), so the swap during the
  280 ms theme cross-fade never shows a blank frame. With the flip fallback both themes use the same URL, so there's
  nothing to preload.
- No new motion. With Less motion the swap is instant, as it is now.

### 2.4 Not changing

- The full-size sheet: it already follows the theme.
- Light mode: the light picture is made exactly as before.
- Wire format and schema: `previewDark` is already nullable everywhere (`core/notebook.ts`, `note_drawings.preview_dark`).

## 3. Design system and canvas

- Canvas: P-DrawDark (+Dark) approved. `P-Drawing`'s "Light and dark" line ("Excalidraw flips its colours itself")
  stays true. I'll add "and the note's picture matches it" to that line when this ships.
- DS: `NoteDrawing` in the Notebook tail gets the `tp-nb-draw-flip` state. I'll rebuild with
  `tools/ds-notebook-tail-build.mjs` after the PR merges and add a dark "saved before the fix" example next to
  "Picture not ready". No new tokens and no other shared component changes.

## 4. Files

| Area                                          | Change                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/drawing-dark.ts` (new)   | `flipForDark`, `preflipImage`, `darkPicture(mod, els, files, dims)`                      |
| `packages/ui/src/components/DrawingSheet.tsx` | `pictures()` uses `darkPicture`; `dark` may be `null`; `ExcalidrawModule.exportToCanvas` |
| `packages/ui/src/components/NoteDrawing.tsx`  | flip fallback class; preload the other theme's picture                                   |
| `packages/ui/src/styles/components.css`       | `.tp-nb-draw-pic img.tp-nb-draw-flip { filter: invert(93%) hue-rotate(180deg); }`        |
| `apps/web/src/app/notebook.ts` (Done handler) | upload the dark picture only when there is one; local preview the same                   |
| `apps/server/src/notebook.ts`                 | `drawingsOf`, `drawingRead`: `previewDark` is `null` when its size equals the light one  |

## 5. Test scenarios

All run on Rohit's Mac (unit + web e2e + Mac e2e), per the project rule.

### New

| ID       | Where                      | Scenario                                                                                                                                                                                |
| -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C22-U97  | ui `drawing-dark.test.ts`  | `flipForDark`: #1e1e1e becomes light (each channel > 200); white becomes near #121212; red #e03131 stays reddish but lighter; alpha 0 pixels untouched; matches Chrome samples ±3       |
| C22-U98  | ui `drawing-dark.test.ts`  | `preflipImage` then `flipForDark` returns a mid-grey photo pixel and a skin-tone pixel within ±30 of the original (an image keeps roughly its colours, like full-size Excalidraw)       |
| C22-U99  | ui `DrawingSheet.test.tsx` | Done: `exportToBlob` is called once with `exportWithDarkMode: false`, never `true`; the dark picture comes from `exportToCanvas` with SVG files left alone and other images pre-flipped |
| C22-U100 | ui `DrawingSheet.test.tsx` | If making the dark picture throws, `onDone` gets `{ light, dark: null }`; if the light one throws, `pictures: null` (as today)                                                          |
| C22-U101 | ui `NoteDrawing.test.tsx`  | Dark theme, light picture only: the img shows the light URL with `tp-nb-draw-flip`; light theme never has the class; with both pictures, dark shows the dark one without the class      |
| C22-U102 | ui `NoteDrawing.test.tsx`  | The other theme's picture is preloaded once (an `Image` with its URL), and not when both themes share one URL                                                                           |
| C22-U103 | server `drawings.test.ts`  | Pictures of equal size: notes and `GET /notebook/drawings/:id` return `previewDark: null`; different sizes return the dark id; a missing light picture leaves dark as it is             |
| C22-U104 | client `drawings.test.ts`  | A save with `dark: null` sends `previewDark: null` and keeps `previewLight`                                                                                                             |
| C22-E89  | e2e web `notebook.spec.ts` | Dark mode, draw a black rectangle, Done: the stored dark PNG's stroke pixels are light (decoded in the page) and differ from the light PNG                                              |
| C22-E90  | e2e web `notebook.spec.ts` | A drawing seeded with the same file as light and dark (the #55 state): in dark mode the block shows the light URL with the flip class; after one edit and Done it shows a real dark PNG |
| C22-D43  | mac `notebook.spec.ts`     | The #55 path itself: in the Mac app, dark mode, draw and Done; the dark PNG's strokes are light and its size differs from the light PNG                                                 |

### Updated

| ID      | Change                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| C22-U92 | "shows the light or the dark picture by theme": the light-only case in dark now expects the flip class      |
| C22-E85 | also checks the dark picture is really dark-themed (a stroke pixel is light), not just that the src swapped |

### Manual (Rohit)

- MC-55a: Mac app, dark mode, open a note with a drawing made before this release: readable straight away.
- MC-55b: Mac app, paste a screenshot into a drawing, draw on it, Done, dark mode: the lines are light, the screenshot
  keeps its colours.

## 6. Risks

- **Colour accuracy.** My flip is sRGB maths. Excalidraw's on-screen flip is the browser's CSS filter, which can
  differ slightly in colour space. C22-U97 pins it to Chrome's output within ±3 per channel. Any difference is a
  slight tint, never readability.
- **Size heuristic.** False positive (two real pictures, same size): that drawing shows the flipped light picture,
  which looks right except for images inside it. False negative (a copy, different size): impossible for identical
  renders. A later cleanup migration could drop these copies, but it isn't needed.
- **Memory.** `getImageData` on a 2× picture at `PICTURE_MAX_PX` is a few MB, the same order as the export itself.
  If it fails, we fall back (§2.1.4).
