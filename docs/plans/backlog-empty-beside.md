# The empty Backlog beside the day

Status: approved by Rohit on 15 Nov 2026; built. Asked by Rohit on 15 Nov 2026 ("Backlog in side by side view empty state
seems broken"). Design approved by Rohit on 15 Nov 2026: canvas page Today, the "Draft · fix the empty Backlog beside
the day" row, boards `T-BacklogEmpty` and `T-BacklogEmpty-Dark` (canvas v272). Test cases use the `C02-` prefix of the
Today chunk (`docs/tests/chunk-02.md`), from `C02-U57` and `C02-E37`.

## Why

The Backlog beside Today (#102, PR #106) shipped an empty state that matches its canvas board. The board itself was
weak, and there is a real bug under it:

1. **You can barely drop into an empty Backlog.** With no tasks, the sheet's `TaskList` is 0px tall. `useDropGroup`
   hits a list when the pointer is within its rect, 24px above to 64px below, which here is only a band around the
   "Add to the Backlog…" writing line. A task dropped on the words "Drag a task here" goes back. The drop wash
   (`.tp-list.tp-drop-on`) colours a 0px box, so there is no sign a drop will land. (C02-E22 passes only because it
   drops 8px under the list's top.)
2. **Two loose pieces.** `EmptyState` (64px top, 72px bottom padding, centred) and then the writing line on the left
   edge with its dim box.
3. **Dead paper.** The sheet is held at 560px, so the bottom third is blank and the words aren't centred in it.
4. **Said twice.** "Nothing waiting" in the title line and "Nothing waiting." right under it.
5. **The writing line is going away.** The "Remove inline task entry" work takes every writing line out of task lists, so
   the empty state needs its own next step.

## What changes for the person

Only the Backlog sheet beside the day (desk, `BacklogBeside`). The Backlog page, its week tile and phones are unchanged.

1. **Empty**: "Nothing waiting." and "Drag a task here to take its day away, or write a new one." sit in the middle
   of the sheet's body (below the title line), with one **New task** button (primary, plus icon). No writing line.
2. **New task** opens Quick Add with the destination set to the Backlog (no day), in this space. Saved, the task washes
   in on the Backlog sheet as Quick Add does today (C04-E23).
3. **No count while empty**: the title line reads "No day / Backlog" with nothing beside it. One task: "1 task", turning
   in with the existing label turn (`dateTurn`).
4. **The whole empty body takes a drop.** Drag a task from the day anywhere over the empty body: the body shows the
   normal drop wash (`--selection`, `--radius-md`, inset 12px from the sides). No drop line (there is nothing to go
   between). Let go: it lands as the first task. Moving off the body takes the wash away.
5. **The first task lands**: the words fold away (`FoldAway`, as today) while the row glides in; the count turns to
   "1 task".
6. **The last task leaves**: its gap shuts, then the words fade back in, centred (as `FoldAway` does today).
7. **Error**: "The Backlog didn’t load." with Try again, centred in the body the same way (words unchanged).
8. **Loading**: unchanged (title line at once, four shimmering rows; no drops until loaded).
9. **By project** (PR #108): an empty Backlog shows no switch (fewer than 2 groups), so the empty state is the same.
10. **Dark**: same layout; the wash is the dark `--selection` token.

### Motion (all Tudu Paper tokens)

| What                  | Timing                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| Wash in (drag over)   | `--dur-menu` 160ms, `--ease-change` (the existing `.tp-drop-on` transition) |
| Wash out              | 120ms `--ease-leave` (existing `.tp-drop-off`)                              |
| First task lands      | `FoldAway` 240ms out, row glide `--dur-fold` 300ms `--ease-settle`          |
| Last task leaves      | gap shuts, then words fade 160ms, 240ms late (`FoldAway`)                   |
| Reduced / less motion | wash and words swap at once (existing rules)                                |

## How

All in `apps/web/src/routes/backlog/BacklogBeside.tsx` plus small, shared, opt-in pieces in `packages/ui`:

- **`TaskList` `fillEmpty` prop** (packages/ui): when set and `tasks` is empty, the list root gets `tp-list-fill`:
  `position: absolute; inset: 0 12px` inside its `SheetBody` (which becomes `position: relative` via
  `.tp-sheet-body:has(> .tp-list-fill)`), so its rect, which `useDropGroup` hit-tests, is the whole body and the
  existing `tp-drop-on` wash paints the whole body. No change to `reorder.ts`. The drop line is hidden on an empty
  list (`.tp-list-fill > .tp-drop-line { display: none }`); `placeLine` already puts the drop at index 0.
- **`EmptyState` `fill` prop** (packages/ui): `.tp-empty-fill` = `min-height: 100%`, `justify-content: center`,
  padding 40px 32px, `position: relative; z-index: 1` so the button stays clickable over the list behind it (drop
  hit-testing reads the list's rect, not pointer events, so the words on top don't block a drop).
- **BacklogBeside**: `date={open.length ? count : ''}`; the empty block becomes
  `<EmptyState fill title="Nothing waiting." mark={false} action="New task" onAction={() => openQuickAdd({ day: null })}>`
  inside `FoldAway`; the error `EmptyState` gets `fill`; `TaskList` gets `fillEmpty`; `addLabel` and `onAdd` go (if
  the "Remove inline task entry" PR has not already removed them).
- **Quick Add seed `day`**: `QuickAddSeed` gains `day?: IsoDate | null` (`null` = Backlog) and Quick Add opens with that
  destination. The "Remove inline task entry" work adds the same seed field for its "New task" buttons; whichever
  merges first adds it and the other rebases onto it.
- **Design system** (artifact EByMwK8AQmbh6TAmWwSzeD): `EmptyState` `fill` and `TaskList` `fillEmpty` documented,
  with the empty Backlog sheet as the example (light and dark).
- **Canvas**: `T-BacklogStates` (+Dark) Empty and Error sections redrawn to match; the draft boards `T-BacklogEmpty`
  (+Dark) retitled "Built"; the sticky marked BUILT.
- No server, database or MCP change.

## Test scenarios

Tests run on PR CI (web e2e in the Playwright container, Mac app job on macOS), not on Rohit's Mac.

### New unit tests (`packages/ui`, `apps/web`)

| ID      | What it checks                  | Scenario                                                                                                                                                                         |
| ------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C02-U57 | `TaskList fillEmpty`            | Empty with `fillEmpty`: the root has `tp-list-fill`; with tasks, it doesn't; without the prop, an empty list is unchanged                                                        |
| C02-U58 | `EmptyState fill`               | Adds `tp-empty-fill`; the action button is still a real button that fires `onAction`; without `fill`, unchanged                                                                  |
| C02-U59 | BacklogBeside empty             | Empty Backlog: title line has no count, "Nothing waiting." and the new words show once, a "New task" button, no writing line (no textbox in the sheet)                           |
| C02-U60 | New task from the empty Backlog | Clicking "New task" calls `openQuickAdd` with `{ day: null }`                                                                                                                    |
| C02-U61 | Quick Add seed `day`            | `openQuickAdd({ day: null })` opens with the Backlog destination; `{ day: '2026-10-19' }` opens on that day; no seed keeps today's behaviour (shared with the inline-entry work) |

### New end-to-end tests (`packages/e2e/tests/today/backlog-beside.spec.ts`)

| ID      | What it checks                     | Scenario                                                                                                                                                                         |
| ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C02-E37 | Drop anywhere on the empty Backlog | Drag a day task onto the centre of the words, then (after Undo/moving it back) onto the bottom 40px of the body: both land as the only Backlog task; the server agrees           |
| C02-E38 | The wash shows                     | While dragging over the empty body, the list has `tp-drop-on` and its box covers the body (height ≥ 80% of the body); moving back over the day removes it                        |
| C02-E39 | Centred and counted                | Empty: the words' centre is within 24px of the body's vertical centre, the title line shows no count; after a drop "1 task"; after moving it back, no count and the words return |
| C02-E40 | New task to the Backlog            | "New task" opens Quick Add set to the Backlog; saving lands the task in the Backlog sheet (not the day), read back from the server                                               |
| C02-E41 | Dark                               | Same empty sheet in the dark theme: words visible, wash colour is the dark `--selection`                                                                                         |

### Updated tests

| ID      | Change                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C02-E22 | The empty check expects no count in the title line (was "Nothing waiting"); the drop target moves from "8px under the list's top" to the body's centre; error part unchanged |
| C02-D02 | Mac app: start with an empty Backlog beside and drag the first task onto the centre of the empty sheet (proves the hit area in WKWebView)                                    |

### Rohit's manual check (Mac)

| ID      | Check                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MC-BE01 | On staging, empty the Backlog, pick Backlog beside, drag a task onto the middle of the words: the wash shows and it lands; New task opens Quick Add on the Backlog |

## Not in this change

- The Backlog page's own empty state and the week's Backlog tile (they already have a button, and a page-sized list).
- Removing writing lines elsewhere (the "Remove inline task entry" work).
