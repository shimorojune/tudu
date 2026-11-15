# Times on Planned and Due, and Planned over several days

Status: approved by Rohit on 15 Nov 2026 ("approved"); built on `claude/project-thread-15i6da`. Canvas approved by Rohit on 15 Nov 2026 ("looks good"), canvas Version 271,
page "Task detail": boards `D-Times`(+Dark, the prototype), `D-TimeStates`(+Dark), `D-TimeMotion`, `D-TimeWeek`(+Dark)
and `D-TimeDays`(+Dark). No code yet.

## Why

Rohit (14 Nov): set a time, not just a date, on a task's Planned and Due. While drawing it he added: Planned can span
several days, and such a task shows on every day of the span, tinted back on the days after its first.

## Decisions taken (Rohit, on the canvas and in the thread)

1. Planned time is a block, a start and an end. Due time is one moment.
2. The time control is an inline macOS-style field (hour : minutes AM/PM parts; click a part and type, or step with
   the small arrows; minutes step by 5). No popup, no list, no grid. "Add a time" fills the next full hour (one hour
   long for Planned).
3. The Mac app notifies at the planned start and at the due time, at any hour (not only in working hours).
4. Planned can span several days: a **Several days** switch under the month. The task is listed on every day of the
   span and crossed off once.
5. Due pickers get **Today | Tomorrow | No date** presets above the month; the red **Remove due date** foot goes. This
   changes the shipped Due picker (panel, row pop, Quick Add).
6. Popups never make the panel scroll, and every change of a popup's size eases (the red message line, the "Pick the
   last day" line, "Add a time" turning into the fields).
7. Icons beside words hang off the words' baseline (Rohit's Mac draws Geist about 1px lower in its line than other
   browsers; centring on the line box shows it).

Defaults I chose, not objected to: wall-clock times with no time zone (like days today); a time is always optional;
manual order is kept (a time does not sort the list); 12/24-hour follows the system; Quick Add uses the pickers (no
"tomorrow 3pm" parsing); Jira unchanged; MCP gains the new fields.

## What changes for the person

### Planned

- **Panel › Planned** opens the picker: month, then **Several days** (switch), then **Add a time**.
- **Add a time** becomes two fields, `3:00 PM to 4:00 PM`, with the start's hour lit, ready to type over. The end
  moves with the start (the length is kept). An end at or before the start is not saved: the end field's edge turns
  red and a line folds open under the fields, `It has to end after it starts`. A block that has already ended today
  reads `That’s already over today` (saved anyway). An `×` at the row's end removes the time.
- **Several days** on: the month asks for the last day (`Pick the last day`); hovering previews
  `Sun 18 Oct to Wed 21 Oct · 4 days`. The days between take a wash, the ends ink in. The switch row then reads
  `Several days   until Wed 21 Oct`. With a span set, a click on any day starts again from that day and the next
  click picks the other end, either side, so the span can move either way; closing in between changes nothing.
  Off: back to one day (the first).
- With several days, the time fields read **Starts at** (first day) and **Ends on the last day at**.
- The panel fact reads `Today · Sun 18 Oct` + `4 to 6 PM`, or for a span `Sun 18, 4 PM to Wed 21 Oct, 6 PM`.

### Due

- Presets **Today | Tomorrow | No date** above the month (No date clears it). The red foot is gone.
- **Add a time** gives one field, `Due at 5:00 PM`. A time already gone today reads `That time has passed today`.
- Due with a time is overdue once that minute passes, not at midnight: `Overdue since 5 PM` (red), and the pill eases
  from grey to red on screen. Without a time, as today.

### Rows, days and weeks

- Row byline pill: `3 to 4 PM` (planned block), `Due today 5 PM`. In the week tiles (brief rows) only the start,
  `3 PM`.
- A span on each of its days: `Day 1 of 4 · from 10 AM`, `Day 3 of 4`, `Day 4 of 4 · until 5 PM`; brief rows `2/4`.
- Days 2 onward of a span are tinted back (58% opacity, full on hover or focus), in day lists and week tiles, so the
  day's own work stands out. The first day is normal.
- The day's ring counts a span once on each day it shows. Crossing it off on any day crosses it off on all of them.
- Order: the list keeps your order. A span is placed first on the days after its first, until you move it there.
- Carry-over: a span carries only after its last day; a carried task drops its planned time and its span (it is on
  today, one day) and keeps its due time.
- Moving a span (drag to another day, or the row menu's Move) moves the whole span, keeping its length.

### Quick Add

- The Planned chip opens the same picker (month, Several days, Add a time); the Due chip the Due picker. The chips
  read `Today 3 to 4 PM`, `Due today 5 PM`, `Sun 18 to Wed 21`.

### Mac notifications

- At the planned start: title `Starts now: Meera’s Quick Add demo`, body `3 to 3:30 PM · Northwind`, buttons
  **Cross off** and **Open**. At the due time: `Due now: Send the signed contract to Northwind`,
  `Due today at 5 PM · Northwind`. A span notifies once, at its start.
- macOS's own banner; clicking opens the task. Cross off works without opening Tudu's window.
- **Settings › Working hours** gains one switch, **Notify me at planned and due times** (on by default on a Mac). It
  shares the existing "macOS has Tudu's notifications off" state and guide.
- Notifications are scheduled with macOS, so they come even while Tudu's window is closed, as long as Tudu has run
  since the time was set (the next 48 hours are scheduled ahead; see How).
- Web and phones: the switch row reads `Notifications come from the Tudu app on a Mac.`

### Everywhere

- Offline: times and spans save to the outbox like any change; the offline banner shows as today.
- Loading: the pill and the panel fact keep their size while loading (skeleton in place).
- Reduced motion: the fields appear with a 120ms fade, words swap without rising, red arrives at once.

## How

### Data (`packages/db`, migration `0022_task-times.sql`)

```sql
ALTER TABLE tasks ADD COLUMN end_day date;      -- last day of a span; null = one day; always > day
ALTER TABLE tasks ADD COLUMN start_time time;   -- planned start, wall clock; null = no time
ALTER TABLE tasks ADD COLUMN end_time time;     -- planned end (on end_day for a span); null with start_time
ALTER TABLE tasks ADD COLUMN due_time time;     -- null = due at day's end, as now
ALTER TABLE requests ADD COLUMN due_time time;       -- requests carry due like tasks
CREATE TABLE task_day_places (task_id text REFERENCES tasks(id) ON DELETE CASCADE, day date, position double precision,
  PRIMARY KEY (task_id, day));                  -- a span's own place on a day after its first, once moved there
CREATE INDEX tasks_span ON tasks (space_id, day, end_day) WHERE end_day IS NOT NULL AND deleted_at IS NULL;
```

Checks: `end_day > day`; `start_time` and `end_time` both set or both null; for one day `end_time > start_time`.
Back up the production database before releasing 0022 (as with 0018 to 0021).

### Server (`apps/server`)

- New mutations, each with its own field clock: `task.time` `{ id, start, end }` (null clears), `task.span`
  `{ id, day, until }` (until null = one day; moving a span is `task.place` with the new first day, and the server
  shifts `end_day` by the same number of days), `task.dueTime` `{ id, at }`. `task.due` with `null` also clears
  `due_time`.
- Day query: a task is on day D when `day = D`, or `day < D AND end_day >= D` (with its `task_day_places` position on
  D if any, else first). The week query the same over the week.
- Roll-over (`rollDays`, apps/server/src/tasks.ts): carry when `coalesce(end_day, day) < today`; the carry sets
  `end_day`, `start_time`, `end_time` to null and keeps `due_time`.
- Overdue for a timed due is decided on the client (it has the wall clock); the server stores wall-clock times only.
- History: `time set 3 to 4 PM`, `planned Sun 18 to Wed 21`, `due time 5 PM` events.

### Client (`packages/client`)

- `TaskRow` gains `until`, `time { start, end }`, `dueAt`. Optimistic overlays for the three mutations; a span is
  written into every day query it covers (the day keys from `day` to `until`), and removed from them when it shrinks or
  moves. `inSpan` for `all.place` learns about spans.
- Outbox: the new mutations queue like the others.

### Core (`packages/core`)

- `times.ts`: parse/format wall-clock times (`fmtTime`, `fmtBlock` → `3 to 4 PM`, `9 to 10:30 AM`, 24-hour when the
  system says so), `nextFullHour(now)`, `blockEnd`, `isPast`.
- `spans.ts`: `spanOf(from, until, day)` → `{ n, of }`, `spanDays`, `spanWords` (`Sun 18 to Wed 21 Oct`),
  `spanTimeWords` (`from 10 AM` / `until 5 PM`), `moveSpan`.
- `due.ts`: `dueLabel(due, today, at?, now?)` adds the time (`Due today 5 PM`, `Overdue since 5 PM`).
- `week.ts` and `menubar.ts`: count a span once per day shown.

### UI (`packages/ui`)

- New `TimeField` (segmented spinbuttons, `role=spinbutton`, Up/Down step, typing replaces, Left/Right move between
  parts, `aria-valuetext` `3:00 PM`) and `TimeChoice` (Add a time ↔ fields, the folding message line, height eased).
- New `SpanChoice` (DS `Switch`) and `PlanPicker` (MiniCalendar + SpanChoice + TimeChoice) used by the panel, the row
  pop and Quick Add.
- `MiniCalendar`: `until` (range classes), range picking as above, presets with a null value call `onClear`, the hint
  line always in a folding wrapper, the month title trimmed to its capitals (`text-box: trim-both cap alphabetic`).
- `DatePop`: Due presets, no clear foot; `TDProp` pop shifts up to stay inside the panel's scroll box.
- `TaskRow`: the `time` pill (`I.cal` glyph), span words, `tp-span-on` tint; the overdue turn at the due minute.
- Baseline rule (decision 7): row pills with an icon, the panel's property labels, Quick Add chips and the Banner put
  their icon inline in the words (`.tp-bl-ic`, `vertical-align: calc(1em * .355 - icon/2)`). This touches shipped
  pieces (pills, panel labels, chips, banner).
- `useHeightEase` (pair of the existing `useWidthEase`).
- `WorkHoursSection`: the **Notify me at planned and due times** switch.
- Then sync the design system artifact and the canvas kit (the canvas draft patch is
  `/mnt/project-files/task-times/patch_kit.py`).

### Mac app (`apps/desktop/src-tauri`)

- `times.rs`: `schedule_times(items)` replaces Tudu's pending time notifications with `UNCalendarNotificationTrigger`
  requests (identifier `tudu.time.<taskId>.<start|due>`), and `cancel_times(ids)`. A category with **Cross off** and
  **Open**; Cross off posts a `task.cross` through the web view's bridge (the desk window keeps running hidden), Open
  shows the main window on the task.
- The web side (`apps/web/src/app/TimeClock.tsx`, beside `NudgeClock`) recomputes the next 48 hours of starts and due
  times from the cached tasks on every change, window focus and every 30 minutes, and sends the whole set; macOS keeps
  at most 64 pending, so the nearest 60 go.
- Respects the switch and macOS permission; nothing is scheduled for done or deleted tasks.

### MCP (`apps/mcp/src/tools.ts`)

- Add a task / Change a task gain optional `start`, `end` (`HH:MM`), `until` (`YYYY-MM-DD`) and `dueAt` (`HH:MM`);
  `none` clears. Listings show `· 15:00–16:00`, `· until 2026-10-21`, `· due 2026-10-21 17:00`.

### Jira

Unchanged (Jira's due date is a date).

## Test scenarios

Unit, API, web end-to-end and desktop tests run on PR CI (and Actions › Flake check for repeats), never on Rohit's Mac.

### Unit (vitest)

| ID     | Where                                  | Case                                                                                                                                           |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| TT-U01 | `core/times.test.ts`                   | `fmtBlock`: `3 to 4 PM`, `11 AM to 1 PM`, `9:30 to 10 AM`, 24-hour `15:00–16:00`; `nextFullHour` at 14:10 is 15:00, at 23:20 is 23:00          |
| TT-U02 | `core/spans.test.ts`                   | `spanOf` for first, middle, last and outside days; `spanDays` across a month; `moveSpan` keeps the length                                      |
| TT-U03 | `core/spans.test.ts`                   | `spanTimeWords`: start only on day 1, end only on the last day, nothing between, nothing without a time                                        |
| TT-U04 | `core/due.test.ts`                     | `dueLabel` with a time: before the minute `Due today 5 PM`; at and after `Overdue since 5 PM`; tomorrow `Due tomorrow 9 AM`; no time unchanged |
| TT-U05 | `core/week.test.ts`, `menubar.test.ts` | A span counts once per day it shows; crossed off counts done on every day                                                                      |
| TT-U06 | `ui/TimeField.test.tsx`                | Type `3`, `0`, `5` → 3:05; Up/Down step hours, minutes by 5, wrap AM/PM; Left/Right move parts; `aria-valuetext`                               |
| TT-U07 | `ui/TimeChoice.test.tsx`               | Add a time fills the next full hour (+1 hr block); end before start keeps the old value, red edge, message line has `tp-in`; × clears          |
| TT-U08 | `ui/TimeChoice.test.tsx`               | `That’s already over today` / `That time has passed today` only on today; the message line is folded (not removed) when quiet                  |
| TT-U09 | `ui/MiniCalendar.test.tsx`             | Range: set, then a click starts again (local), second click either side commits once; closing between commits nothing; hint words              |
| TT-U10 | `ui/MiniCalendar.test.tsx`             | Due presets Today / Tomorrow / No date; No date calls `onClear`; no `Remove due date` foot                                                     |
| TT-U11 | `ui/PlanPicker.test.tsx`               | Several days switch: on asks for the last day, off returns to one day; the time fields relabel for a span                                      |
| TT-U12 | `ui/TaskRow.test.tsx`                  | Pills: block, due with time, span words (full and brief); `tp-span-on` on days 2+ and not when done                                            |
| TT-U13 | `ui/TaskRow.test.tsx`                  | The due pill turns red at the due minute with fake timers; the turn class is set once                                                          |
| TT-U14 | `ui/TaskDetail.test.tsx`               | Planned and Due facts with times and spans; the pop never makes `.tp-td-scroll` scroll (pop shifted up when near the bottom)                   |
| TT-U15 | `ui/QuickAdd.test.tsx`                 | Chips open the pickers; chip words; the task is created with time, span and due time                                                           |
| TT-U16 | `ui/*` (pills, TDProp, QAChip, Banner) | Icons sit inside the words as `.tp-bl-ic` (structure test)                                                                                     |
| TT-U17 | `client/tasks.test.ts`                 | Optimistic `task.span` writes into each day key, shrinking removes, moving shifts; `task.time` / `task.dueTime` overlays                       |
| TT-U18 | `web/app/TimeClock.test.ts`            | The next 48 hours scheduled, nearest 60 only, done/deleted skipped, switch off cancels all, a span once at its start                           |
| TT-U19 | `ui/WorkHoursSection.test.tsx`         | The Notify switch on a Mac, the one-line note elsewhere, the permission state shared with nudges                                               |

### API (vitest, `apps/server`)

| ID     | Case                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| TT-A01 | `task.time`, `task.span`, `task.dueTime` save with field clocks; an older write loses to a newer one                      |
| TT-A02 | Invalid: end ≤ start on one day, `until` ≤ `day`, half a block, bad `HH:MM` are refused (400)                             |
| TT-A03 | Day query lists a span on each of its days with its place, first by default; the week query likewise                      |
| TT-A04 | Moving a span by `task.place` shifts `end_day`; `task_day_places` rows follow                                             |
| TT-A05 | Roll-over: a span ending today does not carry; ending yesterday carries, dropping span and planned time, keeping due time |
| TT-A06 | `task.due` null clears `due_time`; requests carry `due_time`                                                              |
| TT-A07 | Migration 0022 up on a copy of a seeded database: old rows unchanged, checks hold                                         |

### End-to-end, web (Playwright, `packages/e2e/tests/times/`)

| ID     | Case                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| TT-E01 | Panel › Planned › Add a time, type 2:30 PM; the row reads `2:30 to 3:30 PM`; survives a reload                                             |
| TT-E02 | End before start: red line, nothing saved; fixing it saves                                                                                 |
| TT-E03 | Several days Sun 18 to Wed 21: the task shows on each day with Day n of 4, tinted from day 2; the week tiles show 1/4..4/4                 |
| TT-E04 | Move the span's start forward (click 21, then 25): Wed 21 to Sun 25; closing after one click changes nothing                               |
| TT-E05 | Cross off on day 3: crossed off on all four days and counted once per day                                                                  |
| TT-E06 | Due presets; Due at 5 PM with a fixed clock at 4:59 then 5:00: the pill turns `Overdue since 5 PM`                                         |
| TT-E07 | Quick Add with Planned time and Due time creates the task with both                                                                        |
| TT-E08 | Offline: set a time and a span, come back online, both saved                                                                               |
| TT-E09 | Popup size: opening, Several days on/off and Add a time ↔ fields never change the height by more than 6px in one frame (sampled per frame) |
| TT-E10 | Phone viewport: the picker fits without scrolling the sheet                                                                                |

### Desktop (Rust and the web view, macOS CI runner)

| ID     | Case                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| TT-D01 | `schedule_times` replaces the pending set; identifiers are stable; `cancel_times` removes                   |
| TT-D02 | Cross off from the notification's action posts `task.cross` for that task; Open shows the main window on it |
| TT-D03 | Permission refused: nothing scheduled, the shared refused state shows                                       |

### Manual on Rohit's Mac (Rohit's checks, after merge on staging)

| ID     | Case                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| MC-T01 | A planned start two minutes ahead: the banner comes with Tudu's window closed; Cross off works |
| MC-T02 | Icons beside words line up on the Mac (pills, panel labels, Quick Add chips, banner)           |

## Risks

- Spans touch the day query, the client cache and roll-over, the three places most of Tudu's sync logic lives. This is
  the bulk of the work and the most likely source of bugs; TT-A03..A05 and TT-U17 cover it.
- Wall-clock times with no time zone: a laptop flown across zones notifies at the local wall clock. Same as days today.
- macOS pending notifications are capped at 64; the 48-hour window keeps us under it.
- The baseline rule and the Due picker change touch shipped components; their existing tests need updating.
- Migration 0022 on production: back up first.
