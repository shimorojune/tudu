# The # menu stays in the window, "Due today" stands out, and today's ring is even (#117, #121, #120)

Status: approved by Rohit on 25 Nov 2026 and built. Canvas approved by Rohit on 25 Nov 2026 (canvas v291), with option A (amber)
for #121. The boards are:

- "Draft · #117 · The # menu never runs off the window" (Q-HashEdge, Q-HashEdge-Dark) on the Quick Add page. It is a
  live demo with the kit's real # menu.
- "Draft · #121 + #120 · Due today, and today in the date picker" (T-DueToday, T-DueToday-Dark) on the Today page.

## The reports

- **#117** (Rohit, Mac 0.43.x): typing # at the end of a long title in the floating Quick Add puts the project menu
  past the window's right edge. It is cut off.
- **#121** (Rohit): "Due today" reads in the same grey as "Due Fri", though it is the task that needs doing now.
- **#120** (Rohit): in the date picker, the ring round today is thicker at one corner.

## What is actually wrong

- **#117.** `projectHash.tsx` places the menu at the caret with `marginLeft` and checks only the left edge. The app's
  `Linger` (`packages/ui/src/lib/linger.tsx`), which every pop opens in, has no edge rule at all. The kit's `Linger` does
  have one: "it never runs off the side of the screen: it slides back in, 12px from the edge". So the app drifted from
  the DS. On the desk the window is wide enough that nobody saw it. In the 640px Quick Add window the menu runs about
  137px past the edge.
- **#121.** The due words on a row carry `tp-od` (destructive red) when overdue, and nothing otherwise. So "Due today"
  is muted like any other date. The panel already marks today (`tp-td-now`, brand red), so the row and the panel
  disagree.
- **#120.** `.tp-cal` is 280px with 12px padding, so the grid is 256px inside, split into
  `repeat(7, minmax(0, 1fr))` with 2px gaps. That makes each cell 34.857px wide, and most cells start part-way through a
  pixel. Today's 1.5px inset ring (`.tp-cal-d.tp-today`) then smears across two pixels on one side.

## The change

### #117: every pop stays 12px inside the window

- **`packages/ui/src/lib/linger.tsx`**: take the kit's rule.
  - After it opens, a layout effect measures the pop. If its right edge is past `innerWidth - 12`, it shifts left by
    `marginLeft` until 12px remain. If its left edge is under 12px, it shifts right. It never goes past the left edge.
  - In the Mac Quick Add window, the note window and the menu bar sheet the viewport is the window, so this is exactly
    "inside the window".
  - The # menu's own `marginLeft` (the caret) is left as is; the two add up, as in the kit.
- This one change covers all five `Linger` pops (the # menu, Quick Add's pickers, the task panel's pop, the space switch,
  the Jira ⋯). That is what "never runs off the side" already says for all of them on the canvas.
- **Open in place, no chasing**: the shift is worked out when the menu opens and when the # token changes. The menu's own place at the # mark is also fixed when it opens: in a title that fills the field every letter scrolls the words, and the menu no longer follows them. While you keep
  typing after the same #, the menu stays put; it doesn't follow the caret. It opens with its usual pop-in (160ms,
  ease-arrive). Less motion: it just appears.
- Up or down is as built: under the line, or above it when there is more room above.

### #121: "Due today" in amber

- **`packages/core/src/due.ts`**: `DueLabel` gets `today: boolean`. It is true when the task is due today and not
  overdue, so a "Due today 5 PM" that has passed becomes "Overdue since 5 PM" in red, as now. `TaskDue` in `TaskRow`
  gets `today?: boolean`. `toItem` passes it on.
- **New class `.tp-dt { color: var(--warning); }`**. It is put on the due words wherever `tp-od` is decided today:
  - `TaskRow` (day rows, 2 days, the week's tiles, the Backlog, All spaces)
  - `MenuBarSheet`'s byline
  - `InboxItem`
- **The task panel's "today"** (`.tp-td-note.tp-td-now`) and the date picker's "· due today" hint (`.tp-cal-hint.tp-now`)
  change from `--brand-text` to `--warning`, so the panel and the rows agree.
- **Red stays for late only.** Light: `#8a5a00`, about 6:1 on the card. Dark: `#e8bf6a`, about 9:1. Both pass AA.
- **Crossed off**: a done task keeps its due words grey (`.tp-done .tp-dt` inherits the done colour, as `tp-od` does).
- **When the day turns**: "Due tomorrow" becomes "Due today" and takes the colour with the existing word turn
  (`tp-sg-turn`, dur-menu 160ms). Less motion: no fade.

### #120: whole-pixel cells

- **`components.css`**: `.tp-cal-g { grid-template-columns: repeat(7, 34px); justify-content: space-between; }`. Seven
  34px columns take 238px of the 256px. The rest is shared out evenly, so the gaps become 3px. Every cell and its ring
  start on a whole pixel. The cells stay square (34 × 34, the height they have now), and nothing moves more than a pixel.
- This is the one picker everywhere: the day title's calendar, Planned, Due, the row pills and Quick Add.

## States

- **#117**:
  - Every state of the # menu (loading, no match with "New project …", making, error) is the same box, so all of them
    follow the rule.
  - Phone layouts are full-width sheets, unchanged.
- **#121**: loading, empty and error don't apply to a word on a row. Skeleton rows have no due words.
- **#120**: no state change.

## Design system and canvas

- **DS**:
  - The kit `Linger` already has the rule, and its README line is unchanged.
  - The kit `TaskRow`, `MenuBarSheet` and `InboxItem` get `tp-dt` with the `today` flag.
  - The kit panel's today tone and the kit calendar's grid change the same way.
  - The tokens are unchanged (`--warning` exists).
- **Canvas**:
  - Q-HashEdge and T-DueToday are titled Built, and their stickies turn grey.
  - Boards that show a row due today pick up the amber from the shared kit, with no per-board edits.

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac). The # menu IDs continue `PH-` in
`docs/tests/project-hash.md`. The others continue their chunks: C00 (foundations and calendar), C02 (rows), C03 (panel)
and C20 (menu bar).

### New

| ID      | Where                                    | Scenario                                                                                                                                                                                                               |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C00-U38 | ui `linger.test.tsx` (new)               | With `innerWidth` 640, a 248px pop measured at left 529: it gets `marginLeft: -149px` (right edge at 628). At left 200: no shift. At left 4: `+8px`. Closing and reopening measures again.                             |
| C00-U39 | ui `linger.test.tsx`                     | The pop's own box changes size while it is open (the # menu placed again once the title has scrolled): it is measured again and its right edge is back at 628; a callback with the size unchanged reads nothing        |
| C00-U40 | ui `linger.test.tsx`                     | A Linger pop carries `tp-linger`, and `.tp-linger` (with the # menu's own box) has `transition-property: none`: under Less motion its margins never ease, so it is never measured halfway through its slide            |
| PH-U17  | ui `QuickAdd.test.tsx`                   | A title that fills the field, then `#`: the menu opens with its right edge 12px inside a 640px viewport. Typing `#t` after it keeps the same left.                                                                     |
| PH-E12  | e2e `quick-add/hash.spec.ts` (640 × 520) | The floating Quick Add page at the Mac window's size: a long title and `#` puts the menu fully inside, its right edge at 628 ± 1. A short title opens it at the caret, as before. Enter still picks the first project. |
| C02-U65 | ui `TaskRow.test.tsx`                    | Due today: the due words have `tp-dt`, not `tp-od`. Overdue: `tp-od` only. Tomorrow: neither. A crossed-off task due today: `tp-dt` in a `tp-done` row and grey (computed colour).                                     |
| C02-U66 | core `due.test.ts`                       | `dueLabel(today, today).today` is true; tomorrow and yesterday are false. `dueLabelAt` with today at 5 PM: true before 5 PM, and false with `overdue` after.                                                           |
| C02-E43 | e2e `today`                              | A task due today: its due words are computed `--warning` in light and dark. An overdue one is `--destructive`. The two colours differ.                                                                                 |
| C03-U32 | ui `TaskDetail.test.tsx`                 | The Due fact for today has `tp-td-now` and computes to `--warning`.                                                                                                                                                    |
| C20-U31 | ui `MenuBarSheet.test.tsx`               | A row due today: its byline's due span has `tp-dt`.                                                                                                                                                                    |
| C00-U39 | ui `MiniCalendar.test.tsx`               | `.tp-cal-g` columns compute to `34px` × 7, and every `.tp-cal-d`'s left offset within the grid is a whole number. Today keeps `tp-today` and its ring.                                                                 |

### Updated

| ID      | Change                                                               |
| ------- | -------------------------------------------------------------------- |
| C02-U39 | "The near words" (#58) also checks that "Due today" carries `tp-dt`. |
| C20-U23 | The menu bar's "Due today" row expects `tp-dt`.                      |

### Unchanged, must still pass

PH-U01..U16, PH-E01..E11, the calendar and date picker tests (C00 calendar cases, C02 pill pickers), and the Linger leave
tests (pops ease out over 130ms).

### Not automated

Rohit's eye on the ring at 1x and 2x. Manual checks for Rohit after release:

- **MC-PH03**: on the Mac, Quick Add with a long title and `#`: the menu is whole.
- **MC-DT01**: on a Retina and a non-Retina screen, today's ring in the picker is even all round.
