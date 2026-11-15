# A dropped row settles, never snaps back (#113)

Status: proposal, awaiting Rohit's approval. Canvas approved by Rohit 16 Nov 2026 ("A dropped row settles looks good"):
boards "Draft · #113 · Drop a row: it settles, it never snaps back" (T-DropSettle, T-DropSettle-Dark) on the Today page
of the design canvas.

## The report

Issue #113 (Rohit, 15 Nov 2026): "There is a wierd glitch that occurs when we drag and re-order items. Like, the moment
I drop it and item, it looks like it snaps to its initial position, and then snaps into new position."

## What is actually wrong

The drag itself is fine: the slip follows the pointer and the other rows glide apart (`packages/ui/src/lib/reorder.ts`,
`useReorder`). The problem is the moment of the drop, in `up()`:

1. `resetRows()` clears every row's `transform` and `tp-shift` at once. From that point the DOM shows the **old order**:
   the dragged row is back in its starting slot and the rows that made room are back where they were.
2. `flip.current = { key, top }` is set and `move.current(from, to, key)` asks the page to reorder. On the web that goes
   `TaskList.reorder` → `onReorder` → `taskStore.place` → `qc.setQueryData`. React Query v5 hands the change to its
   `notifyManager`, which batches with `setTimeout(0)`, so the new order renders one task later, after the browser has
   painted. That painted frame is the "snaps to its initial position".
3. The glide is a FLIP in the `useLayoutEffect` that runs on the next render of the list. It takes `flip.current` on
   **any** render, and measures the row wherever it is. If anything re-renders the list before the new order arrives
   (the drag's own cleanup can), the settle is spent on the row in its old slot, and the new order then lands with no
   glide: "and then snaps into new position".

The canvas board reproduces this exactly by delaying the reorder by one paint (the kit's draft-only `dropLag`).

## The change

All in `packages/ui/src/lib/reorder.ts`, so every list that reorders gets it: a day, 2 days, the week's tiles, the
Backlog, By project groups, All spaces (all `TaskList`), and subtasks (`SubtaskList`). Drops on another list (#77) are
not touched: they already keep the copy on screen until the other list renders.

- **Hold the drop.** When `from !== to`, `up()` no longer calls `resetRows()`. The rows keep their drag transforms (the
  others where they made room, the dropped row where it was let go, its tilt easing out as now) and it records
  `flip.current = { key, top, to, rows }`, then calls `move`. Nothing visible changes until the new order is in the DOM.
- **Settle only on the real reorder.** The layout effect acts only when the row with `key` is at index `to` among the
  list's `[data-reorder]` items. Then, in the same layout pass (before paint): clear the held transforms with transitions
  off (what `resetRows` does today), and `settleFrom(el, top)` glides the row from where it was let go into its slot
  (dur-fold 300ms, ease-settle, with the drop flash, as now). Renders that don't have the new order leave the hold alone.
- **If the page never reorders** (a parent that refuses the move, or an error): after 400ms the hold lets go: rows reset
  and the row glides back from where it was let go into its old slot. Today the same case snaps back.
- **A drag that starts during a hold** (a fast second drag): the hold is finished at once (rows reset, no glide) before
  the new drag measures the page, like C02-U35 does for a gliding row.
- **Less motion** (`prefers-reduced-motion` or Tudu's Less motion): unchanged rule, the row is simply in its new place.
  The hold still applies, so there is no old-order frame there either.
- `from === to` (dropped where it started) and a touch hold-release (the row menu) are unchanged.

No change to `TaskList`, `SubtaskList`, the stores, React Query or the server. No CSS change.

## States

There is no loading, empty or error state of its own: the reorder is local and applies at once (C02-U19), and a save
that fails to sync is retried like every other change. The only new path is the 400ms fallback above.

## Design system and canvas (no drift)

- Design system: the hand-written kit's `useReorder` gets the same hold (its reorder is synchronous today, so nothing
  changes visibly there; this keeps the code the same as the app's). TaskList README: one line under Motion,
  "a drop never shows the old order; the row settles from where it was let go".
- Canvas: remove the draft-only `dropLag` prop from the canvas kit's `TaskList`/`useReorder` once this ships; T-DropSettle
  boards are titled Built and the sticky turns grey.

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac).

### New

| ID      | File                                              | Scenario                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C02-U62 | `packages/ui/src/components/TaskList.test.tsx`    | A parent that applies `onReorder` a task later (`setTimeout(0)`): right after release the dropped row still has its drag transform and the others still have `tp-shift`; a re-render with the old order changes nothing; once the new order renders, the transforms are cleared and the row settles (`tp-settling`, translate from the drop point). |
| C02-U63 | `packages/ui/src/components/TaskList.test.tsx`    | A parent that never applies the move: after 400ms (fake timers) the rows are reset and the row settles back into its old slot.                                                                                                                                                                                                                      |
| C02-U64 | `packages/ui/src/components/TaskList.test.tsx`    | A second drag started during a hold: the hold ends at once, one copy on the page, no transforms left, and the second drag measures the settled rows.                                                                                                                                                                                                |
| C03-U31 | `packages/ui/src/components/SubtaskList.test.tsx` | Subtasks: the same hold with a parent that applies the move a task later.                                                                                                                                                                                                                                                                           |
| C02-E42 | `packages/e2e/tests/today/today.spec.ts`          | Real app (React Query in the path): drag the 1st task below the 3rd; from release until the glide ends, sample the row's top every animation frame. No frame has it back at its starting slot, every frame moves toward the new slot, and the order survives a reload.                                                                              |
| C05-E19 | `packages/e2e/tests/week/week.spec.ts`            | The same frame check inside a week tile.                                                                                                                                                                                                                                                                                                            |

### Unchanged, must still pass

C02-U08, C02-U12, C02-U33, C02-U35 (drag, cross-list, wash, drag during the glide), C02-E04 (reorder survives a
reload), C02-E29 (reorder in a group), C05-E02/E03 (drops on another day, #77).

### Mac

No Mac-only code changes; the Mac app runs the same web bundle, so CI's Mac job covers it. A manual check for Rohit after
release: MC-DS01, drag a task three rows down on Today in the Mac app and let go; it glides into place with no jump.
