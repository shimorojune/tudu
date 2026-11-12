# "Due today", "Due tomorrow", "Overdue since yesterday" (#58)

Status: canvas approved by Rohit 12 Nov 2026 for today (Version 208). He then asked for the same for yesterday and
tomorrow; the boards (T-DueToday and T-DueToday-Dark on the Today page) now draw all three, canvas Version 219. This
proposal is waiting for his approval.

## The report

Production 0.40.0, Mac app, Today in a personal space (issue #58): "Due today should show as due today instead of due
day name". The screenshot shows a row reading "Due Wed" on a Wednesday. On 12 Nov Rohit asked for the same treatment
for yesterday and tomorrow.

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
- The design kit's `dueFromIso` already gives the label `today` for today. The app drifted from the design there.
  Tomorrow and yesterday are new in both.

## The change

1. **`packages/core/src/due.ts`**: in `dueLabel()`, the three days closest to today get words instead of the weekday:

   | `diffDays(today, due)` | `label`     | `tip`                     | row reads                             |
   | ---------------------- | ----------- | ------------------------- | ------------------------------------- |
   | 0                      | `today`     | `Due today`               | Due today                             |
   | 1                      | `tomorrow`  | `Due tomorrow`            | Due tomorrow                          |
   | -1                     | `yesterday` | `Overdue since yesterday` | Overdue since yesterday               |
   | anything else          | unchanged   | unchanged                 | Due Thu, Overdue since Fri, Due 4 Nov |

   The tip equals what the row says, so `TaskRow` shows no tooltip for these (`hasTip` is `label !== long`), as drawn.
   Two days ago stays a weekday ("Overdue since Fri"): yesterday is the only past word.

2. **What each surface prints** (no code change in any of them, they all format `label`):
   - Rows on Today, Week, Backlog, All spaces (`TaskRow`): "Due today", "Due tomorrow", "Overdue since yesterday".
   - A person's tasks on People (`PeoplePage` builds the same two phrases): the same.
   - Inbox items print `Due ${label}` in red when late, so a late one reads "Due yesterday", as it reads "Due Fri" now.
   - The menu bar sheet: "Due today", "Due tomorrow"; anything late keeps its short red "Overdue".
   - The Jira pane: **`packages/core/src/jira.ts`** `jiraDueWords()` drops its own today branch and uses
     `dueLabel()`, so it gains "Due tomorrow" and "Overdue since yesterday" too. One rule.
3. **Long words in a narrow line.** "Overdue since yesterday" is about 170px. The week's tiles at 1280px have a 168px
   line, so it would run past the tile's edge. Those tiles (and phones) already use the wrapping byline
   (`tp-byline-wrap`); there the due item may now shrink and break onto a second line inside its own item, icon
   aligned to the first line (`components.css`, drawn on the canvas under States › In a week tile). Lines that don't
   wrap are unchanged: the due item is never cut and the other items shorten first.
4. **The words change in front of you** (the motion card on the canvas). In `TaskRow`, the due signal remembers the
   words it last drew. When they change while the row is on screen (midnight turns the day, or you pick a new date
   from the row or the panel), the words' `<span>` gets a new key and the class `tp-sg-turn`, so it rises 3px and
   fades in over `--dur-menu` with `--ease-arrive`. The clock icon and the rest of the line stay still. First paint
   never animates. The colour change into or out of red already eases (the existing `.tp-sg` transition).
   - CSS in `packages/ui/src/styles/components.css`: `.tp-sg-turn > span { animation: tp-label-in var(--dur-menu)
var(--ease-arrive) both; }`, reusing the existing `tp-label-in` keyframes (opacity 0 and 3px down to rest).
   - Reduced motion and Less motion: `@media (prefers-reduced-motion: reduce) { .tp-sg-turn > span { animation:
none; } }`, then `node scripts/less-motion.mjs` so `less-motion.css` carries it too. The words swap at once.
5. **Design system and canvas, after the merge** (no drift):
   - Kit `dueFromIso` (DS `bundle.js` and the canvas's own copy): add tomorrow and yesterday, and make the tips match
     the table (today's says "Due Sun 18 Oct · today" now). The kit's own Jira line gets the same words.
   - Port the `tp-sg-turn` motion and the wrapping due item into the DS `bundle.js` / `bundle.css` by hand, and the
     same into the canvas's copy.
   - Fold T-DueToday into the Today page's sheets: the three wordings on T-States (light and dark), the week tile on
     the Week States sheets, the motion line on T-Motion; drop the draft boards.

No migration, no native change.

## Test scenarios

Run on PR CI (unit, web e2e, Mac desktop group), not on Rohit's Mac.

### New

- **C03-U30** core `due.test.ts`, "today, tomorrow, yesterday", today Sunday 18 October:
  - `dueLabel(SUNDAY, SUNDAY)` is `{ label: 'today', tip: 'Due today', overdue: false, iso: SUNDAY }`.
  - `'2026-10-19'` is `{ label: 'tomorrow', tip: 'Due tomorrow', overdue: false }`.
  - `'2026-10-17'` is `{ label: 'yesterday', tip: 'Overdue since yesterday', overdue: true }`.
  - The edges keep their weekday: `'2026-10-20'` is `Tue` / `Due Tuesday`, `'2026-10-16'` is `Fri` / `Was due Friday`.
  - Across a month and a year: today 31 December, `'2027-01-01'` is `tomorrow`; today 1 March, `'2026-02-28'` is
    `yesterday`.
- **C02-U39** ui `TaskRow.test.tsx`, "the near words": rows with `dueLabel()` for today, tomorrow and yesterday read
  "Due today", "Due tomorrow" and "Overdue since yesterday" (the last with `tp-od`); none has a tooltip; aria-labels
  are "Due today. Change the date" and so on.
- **C02-U41** ui `TaskRow.test.tsx`, "long due words wrap in a narrow line": in a `compact` row, the due button's
  computed style in `.tp-byline-wrap` has `flex-shrink: 1`, `white-space: normal` (read from the stylesheet); in a
  normal row it keeps `flex-shrink: 0` and `nowrap`.
- **C02-U40** ui `TaskRow.test.tsx`, "the words turn only when they change": first render has no `tp-sg-turn`.
  Re-render with a new label (`Sun` to `today`): the button has `tp-sg-turn` and the words' span is a new node.
  Re-render with the same label: the span is the same node. The CSS rule reads `animation-name: tp-label-in` with
  `--dur-menu` (read from the stylesheet, as C03-U27 does), and the reduced-motion block sets it to `none`.
- **C20-U23** web `MenuBarPage.test.tsx`, `menuBarRow()`: a task due today reads "Due today", one due tomorrow
  "Due tomorrow", one due yesterday "Overdue" in red.
- **C10-U29** core `jira.test.ts`: `jiraDueWords` gives "Due tomorrow" and "Overdue since yesterday".
- **C03-E21** web e2e `detail.spec.ts`, "Due today on the row": the fixture day is Sunday 18 October. Set the due date
  to 18 October from the panel: the row's `.tp-sg-due` reads "Due today" and has no tooltip. 19 October: "Due tomorrow".
  17 October: "Overdue since yesterday", in the destructive colour. 21 October: "Due Wed". 16 October: "Overdue since
  Fri". Reload: still the last value.
- **C05-E18** web e2e `week.spec.ts`, at 1280×800: a task due yesterday in a week tile: its due item's
  right edge stays inside the tile.
- **C03-E22** web e2e, "the day turns at midnight": install the page clock at Sunday 18 October, 23:59:30, with a task
  due Monday reading "Due tomorrow". Run the clock past midnight (`page.clock.runFor`, past the 30s clock check): the
  page asks "It’s 00:00 on Monday". Press Start Monday: the task's row reads "Due today". (The fade itself is checked in
  C02-U40; CI Macs run with Reduce motion on.)

### Updated

- **C03-U23** (`due.test.ts`): unchanged ("Fri" for Friday 23 October, "4 Nov", "Was due Friday" for 16 October all
  stay; none is a near day).
- **Jira** `jira.test.ts` (`jiraDueWords`): existing expectations unchanged ("Due today", "Due Thu", "Due 4 Nov",
  "Overdue since Mon").
- Checked: no other unit or e2e test asserts a weekday for tomorrow or yesterday (`JiraPanel.test` "Overdue since
  Fri" is two days back; e2e asserts "Due Wed" and "Due Thu").
- **docs/tests/chunk-02, 03, 05, 10, 20**: list the new IDs.

### Manual (Rohit, on the Mac build)

- **MC-D01** Tasks due today, tomorrow and yesterday on Today, Week, the menu bar sheet, the Inbox and the Jira pane
  read as in the table, light and dark.
- **MC-D03** Week at the narrowest window: "Overdue since yesterday" breaks inside its item, nothing past the tile.
- **MC-D02** Leave Tudu open past midnight with a task due the next day: its row changes to "Due today" with the
  short fade, and with Less motion on it swaps at once.

## Risks

- Phrases built from `label`: "Overdue since today" and "Overdue since tomorrow" can't happen (both are not overdue);
  "Due yesterday" can only appear in the Inbox, which already says "Due Fri" for a late date. That is drawn and
  accepted, not changed here.
- The DatePop heading uses `due.tip`, so these tasks head their date picker "Due today", "Due tomorrow", "Overdue
  since yesterday" (they said "Due Sunday" and so on). That matches the row.
- The wrapping due item makes a week tile's row a line taller only where the words don't fit, which is the point.
- The turn key lives in the row. A row that remounts (a reload, moving to another list) draws its words without
  motion, which is what the canvas asks for.
