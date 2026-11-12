# Launch mark jumps left as it leaves (#48)

Status: approved by Rohit 12 Nov 2026; implemented. Canvas: skipped with Rohit's OK (no design change; K-Launch already shows the
intended leave, a swell and fade with no sideways move).

## The report

Staging 0.39.1-staging.42, Mac app, 1200×800, dark (issue #48, 27 Oct): "During the initial splash animation, at the
very end, there is a translate left on the x-axis that makes the transition feel a bit janky."

The issue was filed 14 minutes after PR #46 (the launch mark) merged, so it is a bug in #46 rather than something #46
fixed. It is still there in 0.41.1: `apps/web/index.html`, `apps/web/src/app/boot.ts` and
`apps/desktop/shell/launch.css` have not changed since #46.

## What is actually wrong

The app's arrival makes the page scrollable for a moment, and the scrollbar that appears pushes everything left.

- When the first page has drawn, `dismissBoot` (`apps/web/src/app/boot.ts`) puts `tl-leaving` on `#boot` and
  `tl-arrive` on `#root`.
- `tl-arrive` starts `#root` at `translateY(4px)` and eases it to rest over 220ms. `#root` is `min-height: 100dvh`,
  so for those frames it reaches 4px below the window. A transform counts towards scrollable overflow, so the document
  is 804px tall in an 800px window and gets a vertical scrollbar.
- Tudu styles its scrollbars (`::-webkit-scrollbar { width: 12px }` in `paper-theme.css`). A styled scrollbar is
  never an overlay: it takes 12px out of the layout, in the Mac app's webview and in Chrome alike.
- So on the first leaving frame the window's content box narrows. The mark is centred in a `position: fixed; inset: 0`
  box, so it jumps left by half the scrollbar, and the app under it is laid out narrower. About 90ms later the
  overflow is back under 1px, the scrollbar goes, and everything snaps back.

Measured on master (f8cba7c) with the real web bundle in headless Chromium at 1200×800, scrollbars shown, frame by
frame:

| Frame                   | Window content width | Mark's left edge | Document height |
| ----------------------- | -------------------- | ---------------- | --------------- |
| last frame before leave | 1200                 | 571.5            | 800             |
| first leaving frame     | 1190                 | 566.5            | 804             |
| ~90ms into the leave    | 1200                 | back in place    | 800             |

Chromium's styled scrollbar took 10px there (a 5px jump); WebKit takes the full 12px (6px). With the fix below
injected, the width stays 1200 on every frame.

This was measured in Chromium, not in the Mac app's WebKit. The mechanism is the same in both and it matches the
report exactly (a leftward move, only at the very end), but the Mac app itself has not been watched frame by frame.
MC-1 below is the check for that.

## The fix

While the app arrives, the page must not scroll.

1. `boot.ts`, `dismissBoot`: when the mark is shown and about to leave, and the document is not already scrollable
   (`scrollHeight <= clientHeight`), add the class `tl-settle` to `<html>`. Take it off in `done()`, where
   `tl-arrive` comes off. A page that really scrolls keeps its scrollbar, so nothing shifts there either.
2. Launch styles, in both copies (`apps/web/index.html` inline and `apps/desktop/shell/launch.css`, kept identical;
   C11-U19 checks that): `:root.tl-settle { overflow: hidden; }`.
3. `done()` currently takes `tl-arrive` off when the mark's 180ms fade ends, 40ms before the app's own 220ms arrival
   finishes. With `tl-settle` tied to the same moment the last fraction of a pixel of travel could bring the scrollbar
   back for one frame. So `done()` waits for whichever ends last: the mark's fade or the app's arrival. The 400ms
   backstop stays.

No change to the motion itself: same swell, same fade, same 4px rise, same timings. Less motion already has no rise
(`tl-fade`), so it never overflowed; the class is harmless there.

Not doing: dropping the 4px rise, or reserving a scrollbar gutter on the page (that would cost 12px for good).

## Design and canvas

No visible design change. K-Launch and K-Launch-Dark already show the leave without any sideways move, and the design
system's Launch section describes the same. Nothing to port after merge. If Rohit wants a before/after board anyway,
it goes on K-Launch.

## Tests

Mac app tests run in PR CI, not on Rohit's Mac.

New, unit (`apps/web/src/app/boot.test.ts`):

- C11-U47 the mark was shown and the page doesn't scroll: leaving puts `tl-settle` on `<html>`; it comes off when the
  leave is done, together with `tl-arrive`.
- C11-U48 the page already scrolls (`scrollHeight > clientHeight`): no `tl-settle`.
- C11-U49 the mark never showed (under 300ms): no `tl-settle`, as with `tl-leaving` and `tl-arrive`.
- C11-U50 `done()` waits for the later of the mark's fade and the app's arrival; the backstop still clears
  everything (`tl-arrive` and `tl-settle` off, mark removed) if neither `animationend` comes.

Updated, unit:

- C11-U19 (the two launch style copies are identical) now also expects the `:root.tl-settle` rule in both.
- The existing leave test (mark shown, 900ms) now ends the leave on the app's `animationend` as well as the mark's.

New, e2e web (`packages/e2e/tests/launch/launch.spec.ts`):

- C11-E23 with motion on (this one test turns reduced motion off) and the app held 2s: watched every frame from the
  page's start until the mark is gone and the arrival has ended, the window's content width never changes, and on
  every frame where the document is taller than the window the page's `overflow-y` is `hidden`. Fails on master.

New, e2e Mac app (the launch tests beside D17 to D20):

- C11-D23 the same every-frame watch in the real app's webview through the loader to web swap: the content width of
  the window is the same on every frame from the mark showing to the app at rest.

Manual, Rohit's (after the staging build):

- MC-1 quit and open Tudu Staging a few times in dark and light: the mark swells and fades in place, no sideways
  move, and the app doesn't twitch under it.
