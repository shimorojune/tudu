# A span on today is not tinted (#116)

Status: proposal, awaiting Rohit's approval. Canvas approved by Rohit 16 Nov 2026: boards "Draft · #116 · A span is
never tinted on today" (D-SpanToday, D-SpanToday-Dark) on the Task detail page of the design canvas. Follows
[task-times.md](task-times.md), which shipped the tint (PR #110).

## The report

Issue #116 (Rohit, 15 Nov 2026): a task planned over several days is shown faded on Today when today is not its first
day. Today is the day you work on it, so it should read in full.

## What is actually wrong

`TaskRow` adds `tp-span-on` (58% opacity, full on hover or focus) whenever `span.n > 1` and the task is not done
(`packages/ui/src/components/TaskRow.tsx`, the row's class list). `span` comes from `spanOf(t.day, t.until, day)` in
`toItem` (`apps/web/src/routes/today/TodayPage.tsx`), which knows the day the row is shown on but not whether that day is
today. So Day 2 of 4 is tinted on Today exactly like on any later day. This is what task-times.md specified ("tinted
from its second day"); the rule was wrong for today, not the code.

## The rule

A span on **today's date** is never tinted: on Today, on a day sheet showing today (2 days, a day you stepped back to),
and in today's tile in the week. Every other later day keeps the 58% tint, so a glance at tomorrow or the week still
shows that it carries on from earlier. Day 1 is never tinted, as now. "Day n of N", the times, hover, crossing off and
the menu bar count are unchanged.

## The change

- `packages/core/src/times.ts`: `SpanPlace` gets `today: boolean`. `spanOf(from, until, day, today?)` takes the current
  date as an optional fourth argument and sets `today: day === today` (false when it is not passed, so every existing
  caller keeps today's behaviour until it passes it).
- `apps/web/src/routes/today/TodayPage.tsx` `toItem`: passes its `today` (it already has it) to `spanOf`. `toItem` is
  the one place rows are built (8 call sites: day sheets, 2 days, week tiles, Backlog beside, All spaces), so all of
  them follow.
- `packages/ui/src/components/TaskRow.tsx`: `p.span && p.span.n > 1 && !p.span.today && !done && 'tp-span-on'`.
- **When the day turns**: "today" is the app's working day (`apps/web/src/app/workingDay.tsx`: midnight, or later if you are still working in the small hours), and the page already re-renders when it turns. The row
  on the new today loses `tp-span-on` and comes up to full over 160ms (the existing `opacity var(--dur-menu)
var(--ease-change)` transition on `.tp-row.tp-span-on`), and yesterday's tile tints. Less motion: it just changes.
- No CSS change, no server change, no migration.

## States

Nothing new: loading (skeleton rows carry no span), empty, offline and error states are as built. A span task created
offline gets the same rule from the local copy.

## Design system and canvas (no drift)

- Design system: kit `spanOf(from, until, day, today)` gives `today` (the canvas draft calls it `live`; renamed to
  `today` to match the app), and the row skips `tp-span-on` for it. TaskRow README: the tint line reads "from the
  second day, except on today's date".
- Canvas: the built boards D-TimeWeek and D-TimeDays pass `TODAY` to `spanOf` so their today rows read in full and match
  the app; D-SpanToday boards are titled Built and the sticky turns grey. The board text on D-TimeWeek ("on the days
  after, it is tinted back") gets ", except today".

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac). Ids continue the `TT-` series in
`docs/tests/task-times.md`.

### New

| ID     | File                                             | Scenario                                                                                                                                                                                                         |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TT-U20 | `packages/core/src/times.test.ts`                | `spanOf('2026-10-17', '2026-10-20', '2026-10-18', '2026-10-18')` is `{ n: 2, of: 4, today: true }`; with day 19 it is `today: false`; without the fourth argument `today` is false.                              |
| TT-U21 | `packages/ui/src/components/TaskRow.test.tsx`    | Day 2 of 4 with `today: true` has no `tp-span-on`; the same with `today: false` has it; Day 1 never has it.                                                                                                      |
| TT-U22 | `apps/web/src/routes/today/toItem.test.ts` (new) | `toItem` for a span that started yesterday: on today's sheet `span.today` is true, on tomorrow's it is false.                                                                                                    |
| TT-E11 | `packages/e2e/tests/times/times.spec.ts`         | A task from yesterday to Tuesday: on Today it reads "Day 2 of 4" with no `tp-span-on` and opacity 1; Next day: "Day 3 of 4" with `tp-span-on`; in the week, today's tile shows it in full and tomorrow's tinted. |

### Updated

| ID     | File                                          | Change                                                                                         |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TT-U12 | `packages/ui/src/components/TaskRow.test.tsx` | The span fixtures pass `today: false`, so the existing tint checks keep meaning "a later day". |

### Unchanged, must still pass

TT-E01..E03, E06, E07 (the times flow; the existing tint check is on a day after today, which stays tinted).

### Not automated

The day turning itself (the working day has its own tests; the row only follows `today`). Mac: no Mac-only code; manual
check MC-ST01 for Rohit after release, a task started yesterday reads in full on Today in the Mac app.
