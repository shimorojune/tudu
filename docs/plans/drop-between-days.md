# A task dropped on another day glides into place (#77)

Status: proposal, 10 Nov 2026. Canvas approved by Rohit on 10 Nov (Week page, boards `W-DropDays` and
`W-DropDays-Dark`, sticky `p05-drop-draft`; the "Try it" section on those boards is the approved feel).

Issue #77 (0.41.1): dropping a task on another day in Today's two days or in the Week has no micro-animation.

## 1. Why it snaps

`packages/ui/src/lib/reorder.ts`, in `up()`:

- A drop **inside one list** records where the row was let go (`flip.current`) and, after the reorder renders,
  `settleFrom()` glides the row into its slot and washes it.
- A drop **on another list** (`s.target` is set) does none of that. It calls `cleanup(s)`, which removes the lifted
  card in the same frame, then `tgt.insert(...)`. The app moves the task; both lists re-render:
  - the day it left loses the row, so the rows under it jump up one slot;
  - the day it lands on runs `openRow()` for a "fresh" row: the gap opens, but the row fades in from nothing with no
    link to the card that was under the pointer;
  - the ink line and the day's tint are removed in that same frame.

So the eye loses the task between the two days. Reorders inside one day are fine and stay as they are.

## 2. What changes

Everything starts on release, together. All values are existing Tudu Paper tokens.

| Part                                                                               | Motion                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The lifted card glides to its slot, straightens (−0.6° to 0), its shadow eases off | `--dur-fold` 300ms, `--ease-settle`                         |
| The gap opens in the day it lands on                                               | `--dur-row-open` 360ms, `--ease-arrive` (today's `openRow`) |
| The gap folds shut in the day it left                                              | 240ms, `--ease-arrive` (same as `closeRow`)                 |
| The ink line and the day's tint fade                                               | 120ms, `--ease-leave`                                       |
| The row's wash, once the card lands                                                | 1.2s, `--ease-change` (today's wash)                        |
| Counts in both day headers                                                         | change on release, as today                                 |

### 2.1 The hand-over ("flight")

`reorder.ts` gets one module-level record for a drop on another list:

```ts
interface Flight {
  key: string;
  ghost: HTMLElement; // the lifted card, kept alive instead of removed
  from: { c: HTMLElement; h: number; afterKey: string | null }; // where the gap is
  stop: () => void; // finish everything at once
}
```

- `up()` with a target no longer removes the card. It takes the card out of the drag state, starts a `Flight`, then
  calls `tgt.insert` as today. Click swallowing, `tp-is-dragging` and the listeners are cleaned up as today.
- **The day it left.** `useReorder` already has a layout effect that runs after each render. When a flight's
  `from.c` is this list and the row with `key` is gone, it calls a new `foldGap(c, afterKey, h)` in `motion.ts`: the
  row that moved up (or the list's bottom edge, when the last row left) starts `h` lower and eases to 0 over 240ms.
  It is driven by layout (the same `margin-top` approach as the canvas demo), so the writing line, the sheet's
  height and a week tile's scroll all follow instead of jumping. Rows above the gap never move.
- **The day it lands on.** `TaskList`'s drop handler already marks the row fresh and `openRow()` opens its gap. Right
  after that, a new `landFlight(el)` in `reorder.ts` glides the card to the row's box. The real row is hidden
  (`visibility`) under the card until it lands, then the card is removed and the row shows with the wash
  (`dropFlash`). The glide is frame-driven and re-reads the row's position each frame, so it stays right when the
  target list scrolls to bring the row into view (week tiles, `openRow(el, 'out')`).
- **The line and tint.** `clearTarget()` on a drop adds `tp-drop-off` (opacity to 0, 120ms) and removes the line
  after that, instead of at once. Leaving a list mid-drag still clears at once, as today.
- **Safety.** A flight always ends: when the card lands, after 600ms if the row never shows up (the move was
  refused or the list unmounted), on unmount, and at the start of the next drag (`stop()` first, then lift). Nothing
  is left half way and no card is ever orphaned.

The two lists can render in different commits (the app's store drives them), so each side reacts on its own render
rather than assuming one frame.

### 2.2 Empty days

- **Onto an empty week tile or the empty Backlog.** `WeekDay` keeps its "Nothing planned" / "Nothing waiting" line
  mounted for the fold: it fades (120ms) and folds its height (240ms) as the gap opens, then unmounts. Today's two
  days have no empty line in that mode (the empty list is the drop target), so nothing extra there.
- **The day it left is now empty.** The gap folds first; the empty line then fades in (160ms). Never both at once.
- **Header.** `DayHeader` shows its progress ring only when the day has a task. On the canvas, in a narrow column,
  the ring appearing pushed the list down. E2E checks the list's top doesn't move when a day gets its first task at
  desktop and tablet widths; if it does, the header reserves the ring's slot.

### 2.3 Less motion

With `prefers-reduced-motion` or Settings › Less motion: no glide and no fold. The card is removed on release, the
row is in its slot with one 120ms fade, the old day closes at once, the line and tint go at once. The wash stays
(it is colour, not movement). `less-motion.css` gets the rule; `foldGap` and `landFlight` return early.

### 2.4 Not changing

- Reordering inside one day, the lift, the tilt, the gap while dragging, the ink line's placement.
- Esc and letting go where nothing takes the row (the card glides home).
- Moving with the date pill, Move to… or the task panel.
- Phones (no drag between days) and folded tablet days (no drops).
- What the server gets: the same `place` / `moveInAll` calls. Offline is the same; nothing waits on the server.
- A locked list (a past day) still refuses the drop.

## 3. Design system and canvas

The drag code is part of the design system bundle the canvas prototypes run, so after the PR merges:

- Rebuild and publish the Tudu Paper bundle; the Motion page's "Drag a row" card gets the line "onto another list:
  the card glides in, the old gap folds" and a second list to try it on.
- Re-copy the bundle to the canvas. The Today (two days), Task detail "Over two days", Week and All spaces
  prototypes then glide like the app.
- `W-DropDays` / `W-DropDays-Dark`: remove the board-local demo patch from "Try it" (it then runs the real code) and
  retitle from draft to built. `W-Motion` "Move a task" and `F-Motion` "Drag a row" already carry the approved spec
  line (synced 10 Nov).

No new tokens and no new components.

## 4. Files

| Area                                       | Change                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/reorder.ts`           | `Flight` record; `up()` hands the card over; source-side fold; `landFlight`; line fade |
| `packages/ui/src/lib/motion.ts`            | `foldGap()`; `easeSettle`; a frame-driven glide helper                                 |
| `packages/ui/src/components/TaskList.tsx`  | Drop handler calls `landFlight` after `openRow`                                        |
| `packages/ui/src/components/WeekDay.tsx`   | Empty line folds out and fades in around a hand-over                                   |
| `packages/ui/src/components/DayHeader.tsx` | Only if E2E shows the shift: reserve the ring's slot                                   |
| `packages/ui/src/styles/components.css`    | `.tp-drop-off`, `.tp-flying` (card straightening, shadow off), empty-line fold         |
| `packages/ui/src/styles/less-motion.css`   | Reduced-motion rules for the above                                                     |
| `packages/ui/src/index.ts`                 | Export the new helpers the design system bundle needs                                  |
| `docs/tests/chunk-02.md`, `chunk-05.md`    | The rows below                                                                         |

No server, database or API change. No migration.

## 5. Test scenarios

### New

| ID      | Where                     | Scenario                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C02-U29 | ui `TaskList.test.tsx`    | Drop on another list: right after `pointerup` the card is still in the page (`.tp-drag-ghost.tp-flying`), `onReceive` was called once with the key and index, and the new row is hidden under it                                                                                                           |
| C02-U30 | ui `TaskList.test.tsx`    | After the glide (fake timers / frames) the card is gone, the row is visible with `tp-dropped`, and no inline `transform`, `margin` or `visibility` is left on any row of either list                                                                                                                       |
| C02-U31 | ui `TaskList.test.tsx`    | The day it left: the row that moved up starts one row lower (inline start value equals the dragged row's height) and ends with no inline style; rows above the gap never get one                                                                                                                           |
| C02-U32 | ui `TaskList.test.tsx`    | The last row leaves: the fold is applied to the list's bottom edge, not to a row                                                                                                                                                                                                                           |
| C02-U33 | ui `TaskList.test.tsx`    | On drop the ink line and `tp-drop-on` get `tp-drop-off` and are gone 120ms later; leaving the list mid-drag still clears them at once                                                                                                                                                                      |
| C02-U34 | ui `TaskList.test.tsx`    | Less motion (`data-motion='less'`): no card after `pointerup`, no inline fold styles, the row is visible at once and still gets the wash                                                                                                                                                                   |
| C02-U35 | ui `TaskList.test.tsx`    | A second drag started during the glide: the first card is removed and its row shown before the new card lifts; only one `.tp-drag-ghost` exists                                                                                                                                                            |
| C02-U36 | ui `TaskList.test.tsx`    | The receiving list never renders the row (move refused) or unmounts mid-flight: the card is removed within 600ms and nothing throws                                                                                                                                                                        |
| C02-U37 | ui `motion.test.ts` (new) | `foldGap`: start and end values, cleans up its inline styles, returns at once under less motion                                                                                                                                                                                                            |
| C05-U16 | ui `WeekDay.test.tsx`     | A task lands on an empty tile: the empty line stays mounted with its leaving class during the fold, then unmounts; a tile that becomes empty shows its line only after the fold                                                                                                                            |
| C02-E15 | e2e web `today.spec.ts`   | Two days: drag a task from today onto tomorrow with the mouse. Sampled each frame after release: the row under the gap in today moves up over more than 100ms (several distinct positions, never one jump); the card reaches the new row's box; then the row is in tomorrow, washed, and the server agrees |
| C02-E16 | e2e web `today.spec.ts`   | Same drag with reduced motion emulated: no intermediate positions, the task is in tomorrow at once                                                                                                                                                                                                         |
| C05-E16 | e2e web `week.spec.ts`    | Week: drag from one tile to another and onto the empty Backlog: the source rows glide (sampled as in C02-E15), the empty line folds away, both counts follow                                                                                                                                               |
| C05-E17 | e2e web `week.spec.ts`    | A very full tile: drop on its end while it is scrolled to the top; the tile scrolls the row into view and the card lands on it (card box equals row box at the end)                                                                                                                                        |
| C02-E17 | e2e web `today.spec.ts`   | A day gets its first task by drop: the top of its list is at the same y before and after, at 1440 and 834 wide                                                                                                                                                                                             |
| C14-E   | e2e web `all-spaces` spec | All spaces, two days: the same drop glides and each task keeps its space pill (next free C14 E number at build time)                                                                                                                                                                                       |
| C-D     | mac `desktop.spec.ts`     | In the real WKWebView: the two-day drop from C02-E15, sampled the same way (next free D number at build time)                                                                                                                                                                                              |

Other open threads are numbering tests too; if a number is taken at build time, the next free one is used and
`docs/tests` says which.

### Updated

| ID                                      | Change                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| C02-U12                                 | The card is no longer gone on `pointerup`: assert it is flying, then gone after the glide; `tp-drop-on` goes after the fade |
| C05-U08                                 | Same for its three drops; the refused drop into the locked list still removes the card (glides home) as today               |
| C05-E02, C05-E03, C05-E14, C05-E15      | Wait for the card to land before reading the tile (helper `landed(page)` in `fixtures/week.ts`)                             |
| C02 two-day drag E2E (today.spec)       | Same wait, via `fixtures/today.ts`                                                                                          |
| `docs/tests/chunk-02.md`, `chunk-05.md` | Add the new rows; reword the updated ones                                                                                   |

### Manual (can't be scripted)

- MC-1: on the Mac app, drag between the two days and between week tiles, light and dark: it should feel like the
  canvas "Try it" demo. No flash of the row before the card lands.
- MC-2: with a trackpad, drop and immediately start another drag: nothing sticks.

All of it runs on the PR's CI, not on Rohit's Mac: since 10 Nov the app tests are not run locally, because their
windows pop up over his work.

As built: the All spaces test is C21-E29 and the Mac test is C02-D01. C02-E15 also runs on Safari's engine (the
`webkit` project). The existing drag tests (C02-E07, C05-E02, E03, E14, E15) run with reduced motion, where the task
lands at once, so they needed no `landed` wait. CI's Macs have Reduce motion on, so on CI C02-D01 checks the instant
path in the real WKWebView; the glide in Safari's engine is C02-E15 on the `webkit` project, and in the real app it
is MC-1. C02-E17 found no shift in the app's header, so `DayHeader` is
unchanged.

## 6. Risks

- **A stuck card.** The one new failure mode is a card that never leaves. Covered by the 600ms cap, unmount and
  next-drag cleanup, and by C02-U35/U36.
- **Two renders.** If the store renders the two days in separate commits, the fold and the landing start a frame
  apart. Each side keys off its own render, so neither waits on the other.
- **E2E timing.** Existing drag tests read the page right after `mouse.up()`. They get a "landed" wait rather than
  a sleep.

## 7. Release

UI only. No migration, no settings, no flag. Ships with the next normal release; the design system and canvas sync
in section 3 happens in the same PR's follow-up, before the thread closes.
