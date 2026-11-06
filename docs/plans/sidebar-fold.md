# Sidebar fold polish: quiet tips, one icon column (#78, #79, #80)

Status: proposal, awaiting Rohit's approval. Canvas approved 6 Nov 2026: boards "Sidebar fold" (T-SideFold,
T-SideFold-Dark) on the Today page of the design canvas.

## The reports

Production 0.41.1, Mac app, dark, Today in a personal space.

- #78: "When I collapse the side bar, these tooltips all appear for a second and disappear."
- #79: "Alignment issue in collapsed sidebar."
- #80: "In sidebar, icon for space and app navigation should line up."

I can't open the screenshots (the cloud session can't reach api.tudu.ezdev.net), so the alignment numbers below come
from measuring the real `Sidebar` + `SpaceSwitch` from `packages/ui` in Chromium.

## What is actually wrong

### Tips during the fold (#78)

`Sidebar.tsx` gives every item `tp-tip tp-right` and `data-tip` the moment `rail` flips to true, which is the same
render as the click. The width then eases from 248 to 64 over `--dur-panel-in` (260ms). The tip is a CSS `::after`
that only exists while `tp-tip` is on the item, so the click creates about ten new pseudo-elements while the rail is
still moving.

I can't reproduce the flash in Chromium. In Chromium a new `::after` starts at its resting `opacity: 0` and nothing
animates. The report is from the Mac app, which runs on WebKit, and the likely cause is that WebKit runs the `opacity`
and `transform` transition on a newly created pseudo-element. That means every tip animates once while the rail
settles. A second, smaller route exists in every engine: the rail moves under a still pointer, so an item can land
under it and show its tip mid-fold.

### The header off the icon column (#79, #80)

The nav icons are centred **32px** from the window's edge in both widths: 10px sidebar padding, 14px row inset, half
of 16.

| Element                                         | Wide (248) | Rail (64) |
| ----------------------------------------------- | ---------- | --------- |
| Nav icon centre                                 | 32         | 32        |
| Space tile (26px) centre                        | **29**     | **29**    |
| Panel button icon centre                        | 216        | 32        |
| Logo mark (22px, only when there's no switcher) | 32         | 32        |

The tile is 3px left in both widths. The cause is `.tp-side-custom { padding-left: 6px; }`. The logo's own header
uses 11px, which centres the 22px mark on 32, but the switcher's header got 6px. A 26px tile needs 9px:
10 + 9 − 4 (the button's `margin-left`) + 4 (its padding) + 13 = 32.

On the rail, the switcher button is 30px wide while the tile inside it is 26px plus 4px of padding on each side. The
tile overflows the button by 4px, so the button's hover pill sits off-centre as well. The panel button is already on
the column in the rail and doesn't change.

## The change

All in `packages/ui` (web and Mac app alike), plus the kit and the canvas.

1. **Tips stay quiet while the sidebar folds.** `Sidebar` puts `tp-side-folding` on the nav from the press that folds
   it until the nav's own `width` transition ends (`transitionend`, `target === nav`, `propertyName === 'width'`).
   A 400ms fallback timer covers a missed end event. In CSS:
   `.tp-side-folding .tp-tip::after { opacity: 0 !important; transition: none !important; }`.
   Each tip's pseudo-element is therefore created at rest with no transition. When the class goes, its opacity is
   already 0, so nothing animates. After that, tips behave as they do everywhere else (380ms rest, then a 140ms fade
   and 4px rise). The canvas describes this as "tips are switched on when the fold has settled". To the eye it's the
   same thing, and keeping the tip markup in place means screen readers and the existing tests don't change.
   - Expanding: `rail` goes false on the press, and the tip class goes with it, as today. Nothing new.
   - First paint already collapsed (the saved preference), a controlled `collapsed` change from outside, and the
     tablet rail: no fold is running, so the class is never set. Only a change of `rail` after mount starts it.
   - Less motion / reduce motion: the fold still runs, at 120ms, so `transitionend` arrives sooner. The fallback
     timer covers an engine that skips it.
   - The class is cleared on unmount and when the sidebar expands mid-fold.
2. **The space tile sits on the icon column.** `.tp-side-custom { padding-left: 9px; }`, and on the rail
   `.tp-ssw-rail .tp-ssw-b` hugs its tile (`width: 34px`, the tile `flex: none`), so the hover pill is centred on 32
   too. In the wide sidebar the space name moves 3px right with its tile. It still ends well before the panel button,
   because the name is capped at 150px. The panel button doesn't move.
3. **Kit and canvas, same PR's work.** The design system's Sidebar gets both rules. Its SpaceSwitch also gets the
   `rail` prop and the `.tp-ssw-rail` rules the app already has; the kit's switcher has no rail form today, which is
   drift found while drawing this. Then I copy the kit into the canvas's `ds/tudupaper`, so every board that mounts
   the Sidebar picks this up (Today, Week, Backlog, Inbox, All spaces, Jira, Notebook; desktop and tablet). I'll mark
   the T-SideFold boards "Built" when it merges.

No server, schema, token or copy change. No new state: the sidebar has no loading, empty or error form of its own.

## Tests

Unit (`packages/ui/src/components/Sidebar.test.tsx`, `SpaceSwitch.test.tsx`):

- **C01-U05 (update)** The panel button test also checks that folding adds `tp-side-folding` to the nav, and that a
  `transitionend` for `width` on the nav removes it. A `transitionend` from a child (a label's `opacity`) does not.
- **C01-U32** Fold settle fallback: with fake timers, after folding with no `transitionend` the class is gone at
  400ms and not before. Expanding mid-fold removes it at once. Unmounting mid-fold leaves no timer running.
- **C01-U33** No fold, no hold: first render with `collapsed`, a controlled `collapsed` flip from the parent, and the
  fixed `rail` never set `tp-side-folding`. Their items carry `tp-tip` straight away.
- **C01-U34** Stylesheet: `.tp-side-folding .tp-tip::after` sets `opacity: 0` and `transition: none` (both
  `!important`). `.tp-side-custom` has `padding-left: 9px`. `.tp-ssw-rail .tp-ssw-b` is 34px wide.

End-to-end (`packages/e2e/tests/shell/shell.spec.ts`, desktop project, light and dark via C01-E11):

- **C01-E12** Tips wait for the fold. Collapse the sidebar, then read the Today item's `::after` computed opacity on
  every animation frame until the nav loses `tp-side-folding`. It stays 0 throughout. After that, hovering Today
  shows its tip (opacity reaches 1) and moving away hides it. Expand, then collapse again: same.
- **C01-E13** One icon column. In both widths, the centre of the space tile (`.tp-ssw-b .tp-stile`), each nav icon
  and, on the rail, the panel button's icon are within 0.5px of each other on the x axis. On the rail, the switcher
  button's centre is also within 0.5px.

`docs/tests/chunk-01.md` gets the four new rows. As agreed, all of it runs on your Mac: `pnpm test -- --project ui`
and `pnpm e2e shell`.

The WebKit flash itself can't be asserted in CI, because the e2e runs Chromium. C01-E12 checks the rule that prevents
it. The real check is manual, on the Mac app: **MC-S01** Collapse and expand the sidebar five times with the pointer
resting on the panel button. No tip appears during the fold. Rest on an icon afterwards, and its tip appears after the
usual wait.

## Risks

- If the pointer is resting on an item when the fold ends, `:hover` is already true. When the class goes, the normal
  transition runs from 0 to 1, so that one tip shows after the 380ms wait. That's intended: it's a real hover.
- If a future change removes the `width` transition, the 400ms fallback still clears the class.
