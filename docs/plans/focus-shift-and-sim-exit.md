# The writing line's 1px jump, and "Looks like a task you have" leaving without a fold

Status: proposal, waiting for Rohit's approval. Asked for on 24 Oct 2026 (items 5 and 7 of the bug list).

## What's wrong

### 1. "Write the next thing…" drops a pixel when clicked

`AddTask` swaps a `<button>` (idle) for an `<input>` (writing). Both are 52px tall (`--row-min-height`) and set in the
same serif at the same size, so their boxes are identical, but the text inside them is centred two different ways:

- the button centres an anonymous line box of `line-height: 1.5` (28.5px at 19px, 31.5px at 21px) inside 52px, which
  leaves a fractional gap (11.75px, 10.25px) that the browser rounds;
- the input centres its text with its own rule, which rounds the other way.

So, depending on where the row lands on the page (its y position is fractional most of the time), the placeholder
paints 1 CSS px lower than the label it replaces. Measured in Chromium on the kit page, compact row, at 1x and 2x:

| Row's sub-pixel offset | 0  | .25 | .5 | .75 |
| ---------------------- | -- | --- | -- | --- |
| Shifts on focus today  | 1px | 1px | 1px | none |

The boxes do not move (both report the same rect), only the ink does.

### 2. "Looks like a task you have" snaps away instead of folding

`QuickAdd` wraps the block in `.tp-qa-simwrap`, a `grid-template-rows: 0fr ↔ 1fr` fold with a fade. The fold is
written correctly, but its content is `simShown.length ? <div class="tp-qa-sim">… : null`. Every way the block goes
away empties `simShown` in the same render that drops `tp-on`:

- × (None of these / Not the same task) marks them gone;
- the title is edited until nothing matches (new search returns no hits);
- the title is cut under four letters (`simAsked` turns false).

The content unmounts, the grid row has nothing to fold, and the block disappears in one frame. Measured on the kit
page after ×: 66px → 0px between two frames, with no frames in between. Only Add/saving (`added`, `saving`) keep the
list and fold out properly today.

## The change

### 1. One centring rule for both states

`packages/ui/src/styles/components.css`, the AddTask block: `line-height: normal` on `.tp-addtask-btn` and
`.tp-addtask-input` (and their compact variants, which inherit it). Both then centre the same font box the same way.

- Swept in Chromium at offsets 0, .25, .5, .75 and 1x/2x: no shift at any of them. Fixed line-heights (28, 30px) still
  shift at some offsets; `line-height: 52px` also fixes it, but Safari/WebKit draws the caret as tall as the line
  height in an input, which would put a 52px red caret in the Mac app. `normal` is what the input already uses, so the
  caret stays the height of the text.
- Nothing else moves: the row is still 52px, the label is still vertically centred, the typed (Geist 16px) text is
  untouched.
- The Mac app is WebKit and these sweeps ran in Chromium. The new shift tests also run in a Playwright WebKit project
  (below), which is close to, but not the same as, the Mac app's WKWebView. The Mac suite drives WKWebView with
  scripts only and cannot screenshot, so the final WebKit check is a look in the Mac app on your machine.

### 2. Keep the last list on screen while it folds

`packages/ui/src/components/QuickAdd.tsx`:

- Keep the last non-empty list (`simLast`, state updated whenever `simShown` is non-empty).
- Render `simShown.length ? simShown : simLast` inside `.tp-qa-simwrap`. When `simOn` goes false the wrap loses
  `tp-on`, keeps `inert`, and folds its still-present content over 220ms with the 180ms fade, exactly as the Add path
  does today.
- Once the fold ends (`transitionend` on `grid-template-rows`, or straight away under less/reduced motion), drop
  `simLast` so stale titles do not sit in the DOM or reappear on a later open.
- "N more" open/closed state folds with it (the inner `.tp-qa-sim-rest` is left as it was during the exit).
- A new match while folding: the list switches to the new hits and the wrap reopens from wherever the fold is (the CSS
  transition reverses on its own).

No visual design changes: both fixes make the app match what the canvas already draws (a still writing line, a fold
for the suggestion block). No new tokens, components or states.

## Why the tests missed them

- **Unit tests (vitest + jsdom)** do no layout. Every rect is 0×0 and transitions never run, so "does the text move"
  and "does it fold" cannot be asked there. C07-U07 checks that × hides the block (it's gone from the accessible
  tree), which is true whether it folds or snaps.
- **E2E (Playwright, Chromium)** runs with `reducedMotion: 'reduce'` everywhere so assertions never land
  mid-animation. That also means no test ever watches an exit. No E2E test compares where text is drawn before and
  after an interaction, and comparing element rects would not have caught #1 anyway (the rects are identical).
- There's no shared helper for either check, so nobody wrote one per feature.

## Tests

New helpers in `packages/e2e/fixtures/motion.ts`, reusable for any component:

- `inkBounds(locator)`: screenshots the element and returns the first/last rows with ink (pixels decoded in the
  page via `createImageBitmap` + canvas, no new dependency).
- `expectNoInkShift(page, row, act)`: for sub-pixel offsets 0, .25, .5, .75 (a fractional `margin-top` on the row),
  takes `inkBounds` before and after `act`, and fails on any difference.
- `sampleHeights(locator, act, ms)`: records the element's height every animation frame during `act` and returns the
  series. `expectFolds(series)` fails unless there are at least 3 frames strictly between the start and end heights
  (a snap has 0).

These run in a context with `reducedMotion: 'no-preference'` (only these tests; the rest keep `reduce`).

### E2E (`packages/e2e/tests`, ids `FX-…`, run with `-g FX-`)

| ID     | Case |
| ------ | ---- |
| FX-E01 | Today: clicking "Write the next thing…" draws the placeholder exactly where the label was, at all four offsets, light and dark, desktop and phone (compact) |
| FX-E02 | Backlog: same for "Add to the Backlog…" |
| FX-E03 | Esc back to the label: no shift the other way either |
| FX-E04 | Quick Add, one match: × folds the block (≥3 in-between frames, ends at 0, then `.tp-qa-sim` is removed) |
| FX-E05 | Quick Add, three matches with "2 more" open: × folds the whole block, the open rest included |
| FX-E06 | Quick Add: editing the title until nothing matches folds the block |
| FX-E07 | Quick Add: cutting the title under four letters folds the block |
| FX-E08 | Quick Add: a new match arriving mid-fold reopens with the new titles, never the old ones |
| FX-E09 | Reduced motion: × hides the block straight away (no fold) and nothing is left in the DOM |

### WebKit (`packages/e2e/playwright.config.ts`, new `webkit` project limited to `FX-E01`–`FX-E03`)

| ID     | Case |
| ------ | ---- |
| FX-W01 | FX-E01 to FX-E03 in Playwright's WebKit (Safari's rounding). CI installs WebKit for this one project |

### Unit (`packages/ui`, vitest)

| ID     | Case |
| ------ | ---- |
| FX-U01 | QuickAdd: after ×, `.tp-qa-simwrap` loses `tp-on`, stays `inert`, and still holds the last titles until `transitionend` |
| FX-U02 | QuickAdd: after `transitionend` the titles are gone; reopening with new hits never shows the old ones |
| FX-U03 | QuickAdd under less motion: the list is dropped immediately |
| FX-U04 | C07-U07 still passes unchanged |

## Out of scope

Items 1–4 and 6 from the same list are handled in their own threads.
