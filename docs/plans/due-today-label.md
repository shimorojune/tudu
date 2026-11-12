# "Due today" instead of the weekday (#58)

Status: canvas approved by Rohit 12 Nov 2026 (boards T-DueToday and T-DueToday-Dark on the Today page, canvas
Version 208). This proposal is waiting for his approval.

## The report

Production 0.40.0, Mac app, Today in a personal space (issue #58): "Due today should show as due today instead of due
day name". The screenshot shows a row reading "Due Wed" on a Wednesday.

## What is actually wrong

It is still there on master (b532c83).

- `dueLabel()` in `packages/core/src/due.ts` returns the short weekday for any date less than 7 days away, today
  included. `diffDays(today, due) === 0` falls into that branch, so a task due today reads "Due Wed".
- `dueLabel()` is the only source of these words. It feeds:
  - `toItem()` in `apps/web/src/routes/today/TodayPage.tsx`, which builds the rows on Today, Week, Backlog and All
    spaces, and the menu bar sheet through `menuBarRow()` (`MenuBarPage.tsx`). `TaskRow` prints `Due ${label}`, and
    `MenuBarSheet` does the same.
  - `InboxPage.tsx` (Inbox items print `Due ${label}`).
  - `PeoplePage.tsx` (a person's tasks, which builds `Due ${label}` itself).
- `jiraDueWords()` in `packages/core/src/jira.ts` already special-cases today ("Due today"), so the Jira pane is
  right.
- The design kit's `dueFromIso` already gives the label `today` for today. The app drifted from the design, not the
  other way round.

## The change

1. **`packages/core/src/due.ts`**: in `dueLabel()`, when `days === 0`, return `label: 'today'` and
   `tip: 'Due today'`. The tip equals what the row says, so `TaskRow` shows no tooltip for it (`hasTip` is
   `label !== long`), as drawn. Overdue and every other date keep their words. Tomorrow keeps its weekday, as drawn.
   Every consumer prints `Due ${label}`, so all six surfaces say "Due today" with no change of their own.
2. **`packages/core/src/jira.ts`**: `jiraDueWords()` drops its own today branch and uses `dueLabel()`. Same words,
   one rule.
3. **The words change in front of you** (the motion card on the canvas). In `TaskRow`, the due signal remembers the
   words it last drew. When they change while the row is on screen (midnight turns the day, or you pick a new date
   from the row or the panel), the words' `<span>` gets a new key and the class `tp-sg-turn`, so it rises 3px and
   fades in over `--dur-menu` with `--ease-arrive`. The clock icon and the rest of the line stay still. First paint
   never animates. The colour change into or out of red already eases (the existing `.tp-sg` transition).
   - CSS in `packages/ui/src/styles/components.css`: `.tp-sg-turn > span { animation: tp-label-in var(--dur-menu)
     var(--ease-arrive) both; }`, reusing the existing `tp-label-in` keyframes (opacity 0 and 3px down to rest).
   - Reduced motion and Less motion: `@media (prefers-reduced-motion: reduce) { .tp-sg-turn > span { animation:
     none; } }`, then `node scripts/less-motion.mjs` so `less-motion.css` carries it too. The words swap at once.
4. **Design system and canvas, after the merge** (no drift):
   - The DS kit already says "Due today". Port the `tp-sg-turn` motion into the DS `bundle.js` TaskRow and
     `bundle.css` by hand, and the same into the canvas's own copy of the bundle.
   - Make the kit's tooltip match: today's `tip` becomes "Due today" (it says "Due Sun 18 Oct · today" now).
   - Fold T-DueToday into the Today page's sheets: a "Due today" row on T-States (light and dark), the motion line on
     T-Motion; drop the draft boards.

No copy change beyond "Due today", no migration, no native change.

## Test scenarios

Run on PR CI (unit, web e2e, Mac desktop group), not on Rohit's Mac.

### New

- **C03-U30** core `due.test.ts`, "today is today": `dueLabel(SUNDAY, SUNDAY)` is
  `{ label: 'today', tip: 'Due today', overdue: false, iso: SUNDAY }`. The day before (`'2026-10-17'`) stays
  `Sat` and overdue. Tomorrow (`'2026-10-19'`) stays `Mon`, `Due Monday`. A date 7 days out stays `25 Oct`.
- **C02-U39** ui `TaskRow.test.tsx`, "the due words for today": a row with `due={{ label: 'today', tip: 'Due today' }}`
  has a byline reading `Due today·…`, the due button has no `data-tip`/tooltip, and its aria-label is
  "Due today. Change the date".
- **C02-U40** ui `TaskRow.test.tsx`, "the words turn only when they change": first render has no `tp-sg-turn`.
  Re-render with a new label (`Sun` to `today`): the button has `tp-sg-turn` and the words' span is a new node.
  Re-render with the same label: the span is the same node. The CSS rule reads `animation-name: tp-label-in` with
  `--dur-menu` (read from the stylesheet, as C03-U27 does), and the reduced-motion block sets it to `none`.
- **C20-U23** web `MenuBarPage.test.tsx`, `menuBarRow()` for a task due today: `due.label` is `today`, and the sheet
  row reads "Due today".
- **C03-E21** web e2e `detail.spec.ts`, "Due today on the row": the fixture day is Sunday 18 October. Set the due date
  to 18 October from the panel: the row's `.tp-sg-due` reads "Due today" and has no tooltip. Set it to 21 October:
  "Due Wed". Set it to 17 October: "Overdue since Sat", in the destructive colour. Reload: still the last value.
- **C03-E22** web e2e, "the day turns at midnight": install the page clock at Sunday 18 October, 23:59:30, with a task
  due Monday reading "Due Mon". Run the clock past midnight (`page.clock.runFor`, past the 30s clock check): the page
  asks "It’s 00:00 on Monday". Press Start Monday: the task's row reads "Due today". (The fade itself is checked in
  C02-U40; CI Macs run with Reduce motion on.)

### Updated

- **C03-U23** (`due.test.ts`): the line `expect(dueLabel(SUNDAY, SUNDAY).overdue).toBe(false)` stays, and gains the
  label check above (kept under C03-U30 so the old ID's meaning does not shift).
- **Jira** `jira.test.ts` (`jiraDueWords`): unchanged expectations ("Due today", "Due Thu", "Due 4 Nov",
  "Overdue since Mon"); they now prove the shared rule.
- **docs/tests/chunk-02.md, chunk-03.md, chunk-20.md**: list C02-U39, C02-U40, C03-U30, C03-E21, C03-E22, C20-U23.

### Manual (Rohit, on the Mac build)

- **MC-D01** A task due today on Today, Week, the menu bar sheet and the Inbox reads "Due today", light and dark.
- **MC-D02** Leave Tudu open past midnight with a task due the next day: its row changes to "Due today" with the
  short fade, and with Less motion on it swaps at once.

## Risks

- `dueLabel().label` is also shown inside "Overdue since …", which can never be today, so "Overdue since today" can't
  happen.
- The DatePop heading uses `due.tip`, so a task due today now heads its date picker "Due today" (it said
  "Due Sunday"). That reads better and matches the row.
- The turn key lives in the row. A row that remounts (a reload, moving to another list) draws its words without
  motion, which is what the canvas asks for.
