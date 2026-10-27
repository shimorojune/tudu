# Working hours, and nudges in the Mac app

Status: proposed 27 Oct 2026, awaiting Rohit's approval. Canvas approved by Rohit on 27 Oct 2026 ("looks good"), with
the recommended pick on all four decisions: boards `H-Hours`(+Dark) and `H-Nudge`(+Dark) on the page "Settings & theme",
canvas v157. Discussion:
[Working hours and nudges: discussion](https://claude.ai/artifact/NfGoYZPW9iEZ1sS9AtsRx5).

## Why

Rohit (27 Oct): add working hours, and an opt-in "nudge": a desktop notification every hour (or another interval)
during working hours that says what is done and what is still left today. Short and easy to read, not long-winded.

## Decisions taken

1. Hours are kept on your account. The nudge switch, interval and pause are kept on each Mac, so a second Mac does not
   double up unless you turn nudges on there too.
2. Hours: the days you work plus one start and end time, with an optional "Set hours per day". One stretch per day; no
   split days.
3. When nothing changed since the last nudge, it is still sent ("Still 3 left today").
4. Nudges go through macOS's UserNotifications framework (objc2), not `tauri-plugin-notification`. That gives a click
   that opens Today, a "Pause for today" action, and a new nudge that replaces the last one.

## What changes for the person

1. **Settings › Working hours** is a new section under You, after Appearance, on every device (`?settings=hours`,
   `/space/settings/hours` on phones). The nav row has a new clock icon and the sub-line `Mon to Fri, 09:00 to 18:00`.
   - **Days**: seven round toggles, Monday first. Pressed is ink.
   - **Hours**: two time fields, `09:00 to 18:00`, the same on every working day. **Set hours per day** swaps both rows for
     one line per day (a switch and two times; a day switched off reads `Off`). **Same hours every day** swaps back,
     taking Monday's hours.
   - New accounts start at Monday to Friday, 09:00 to 18:00. Changes save as you make them; there is no Save.
   - Errors: `The end needs to be after the start.` and `Pick at least one day.` (red line, the field edge red, nothing
     saved). `Couldn't save. Tudu will try again when you're back online.` when the server refuses or is unreachable; the
     change stays on screen and nudges follow it.
   - Loading, while `/api/me` has not answered yet: the section itself in its final shape (default hours), with every
     word and control shimmering in place. The boxes are the same before and after, so nothing moves or changes height when
     the hours arrive; the content then fades up (240 ms). Any later change of height (hours per day, nudges unfolding)
     eases over 200 ms instead of snapping. WH-U11 checks the section's height is equal loading and loaded.
2. **Nudges** (Mac app only, in the same section):
   - `Nudge me in my hours` switch, off by default. On unfolds **How often** (`30 min`, `Hourly`, `2 hours`, `3 hours`;
     Hourly is the default), **Next at 11:00** with **Pause for today**, and **Send a test nudge** with **Send now**.
   - The first time it is turned on, Tudu asks macOS (`Allow Tudu in the box macOS just showed.`). On Rohit's Mac
     (macOS 26, ad hoc signed) macOS shows **no prompt**: it refuses at once and lists Tudu in System Settings ›
     Notifications with notifications off. So the refused state is the usual first-run path, not an edge case: the
     switch stays on with `macOS has Tudu's notifications off.` and one line `Turn on Allow notifications for Tudu,
     then come back.` and an **Open Notification settings** button that opens that page. When Tudu comes to the front
     again it re-reads the status by itself; once allowed it reads `On` and sends one test nudge so you see it work.
     Also read again each time Settings opens, and if it is switched off later in System Settings.
   - Paused: the row reads `Paused until Wednesday 09:00` with **Resume**. A pause ends on its own at the start of your
     next working day.
   - Send now: `Sent. It shows at the top right of your screen.` Works outside your hours and while paused. Failure:
     `Couldn't read today, so nothing was sent. Try again in a moment.` While reading: the button spins (`Sending…`).
   - A note under the section: `Nudges come from Tudu while it runs on this Mac. Turn on Open at login in This Mac so
     they still come after a restart.`
   - On the web and on phones, the Nudges part is one line: `Nudges come from the Tudu app on a Mac. Your hours here are
     the ones it uses.`
3. **The nudge** is macOS's own banner with Tudu's words. Title: the numbers. Body: one line on what is next. The
   numbers are the menu bar tick's (your own tasks today, across all spaces, the rows the sheet lists).

   | When                         | Title                             | Body                                                       |
   | ---------------------------- | --------------------------------- | ---------------------------------------------------------- |
   | Start of your hours          | `6 on today`                      | `First up: Send invoice to Acme`                           |
   | Each nudge after             | `3 done, 5 left today`            | `Next: Send invoice to Acme`                               |
   | Some done since the last     | `5 done, 3 left today`            | `2 since 11:00. Next: Review the launch draft · Northwind` |
   | Nothing moved since the last | `Still 3 left today`              | `Next: Review the launch draft · Northwind`                |
   | One left                     | `1 left today`                    | `Call the bank`                                            |
   | All done                     | `All 8 done for today`            | `Tomorrow has 4.` (or nothing more if tomorrow is empty)   |
   | Nothing on today             | `Nothing on today`                | the sheet's empty lines (`menuBarEmptyLines`)              |
   | End of your hours            | `End of your day: 6 done, 2 left` | `The 2 left carry to tomorrow.`                            |

   - "Next" is the first open task in the sheet's order (Personal first). A task from a team space ends in
     ` · <space name>`.
   - All done and Nothing on today are sent once, then nothing for the rest of the day unless a task lands on today.
   - The end-of-day nudge always comes at your end time, whatever the interval, unless everything was already done.
   - A new nudge replaces the last: Notification Center holds one Tudu nudge, the newest.
   - Click: Tudu comes forward on Today (All spaces when you are in more than one space).
   - Pointer over it: one action, **Pause for today**.
   - Never marked time sensitive, so Focus always wins: the nudge waits silently in Notification Center.
4. **When nudges come.** On the clock from your start time (hourly from 09:00: 09:00, 10:00, 11:00, …), plus one at your
   end time. Window closed: they still come (Tudu stays in the menu bar). Tudu quit, signed out, a day off, outside your
   hours, or paused: nothing. Asleep through a slot: the missed one is not sent late. On wake, if the next slot is more
   than half an interval away, one is sent now; otherwise it waits for the next slot. If any space fails to answer when a
   nudge is due, that nudge is skipped rather than sent with wrong numbers.
5. Working hours change nothing else in this cut: no hiding, no colours, no effect on "today".

## How

### Data and API (`packages/db`, `apps/server`, `packages/client`)

- Migration (next free number when built; `0018` today): `user.work_hours` jsonb, null meaning the default.
  Shape `{ days: [{ day: 1..7, start: "HH:MM", end: "HH:MM" } ...], same: boolean }` (Monday = 1). `same` remembers
  whether the person picked one stretch or per-day hours, so Settings shows what they chose.
- `packages/core/src/hours.ts`: `WorkHours` type, `DEFAULT_HOURS`, `parseWorkHours(raw)` (refuses an end not after the
  start, no days, bad times, duplicate days) and `hoursLine(hours)` for the nav sub-line (`Mon to Fri, 09:00 to 18:00`,
  `Mon to Thu 09:00 to 18:00, Fri 09:00 to 14:00`).
- `GET /api/me` gains `workHours` (the default when null). New `POST /api/me/hours` with the whole value, validated by
  `parseWorkHours`, idempotent, last write wins. Your other open Tudus read `/api/me` again through the live
  stream's existing `me` change, the way a name change already reaches them.

### Web (`apps/web`, `packages/ui`)

- `packages/ui`: new `DayPick` (seven `aria-pressed` toggles in a labelled group) and `HoursField` (from and to, two
  time inputs, `tp-field` look; native time input so phones get their own picker). New `clock` icon in `Icon`.
- `packages/ui/src/components/Settings.tsx`: section name `hours`; the nav row; `WorkHoursSection` with the states
  above. New optional prop `nudges?: SettingsNudges` (only passed in the Mac app), shaped like `mac`:
  `{ on, every, permission: 'unknown' | 'asking' | 'allowed' | 'denied', pausedUntil, next, test: 'idle' | 'sending' | 'sent' | 'failed' }`
  plus callbacks. Unfold and fold: `grid-template-rows` 0fr↔1fr with opacity, 200 ms; per-day and same-hours swap is a
  200 ms cross-fade; day toggles 130 ms; status lines use the set's `tp-set-st`. Reduced motion: plain fades.
- `apps/web/src/app/settings.tsx`: `hours` in `SECTIONS` and `sectionFor`; saving through `POST /api/me/hours` with an
  optimistic update of the `me` cache.
- `packages/core/src/nudges.ts` (pure, all the rules, no clock of its own):
  - `nudgeSlots(hours, day)`: the day's slot times for an interval, start-aligned, plus the end.
  - `nextNudge({ hours, every, pausedUntil, now, last })`: the next slot, or null (day off, paused, past the end).
  - `dueNow({ ..., now, last, wokeAt })`: whether to send now, with the half-interval rule after sleep and no
    catch-up of missed slots.
  - `nudgeWords({ groups, last, now, tomorrow, backlog })`: title and body from `gatherToday`'s groups, as in the table
    above, and whether this one is "once a day" (all done, nothing on today).
- `apps/web/src/app/nudges.ts` + a `Nudges` component mounted in `DesktopHost` beside `TodayCount` (main window only, so
  it runs while the window is hidden). It reuses `TodayCount`'s day queries (same cache), checks the clock every 30 s
  (`CLOCK_CHECK_MS`) and on wake/focus, and when `dueNow` says so it refetches today's queries, waits for every space,
  and calls `d.notify(...)`. It remembers the last nudge (time, done count, once-a-day flags) in localStorage per
  account so a reload does not repeat one.

### Mac app (`apps/desktop/src-tauri`)

- New `nudges.rs`:
  - The prefs (`on`, `every`, `pausedUntil`) in `NSUserDefaults`, per track (Tudu, Tudu Staging, Tudu Test keep their
    own), like the Dock choice. Commands `nudges_get`, `nudges_set`.
  - `notify_permission` (ask; returns allowed or denied) and `notify_status` (read `getNotificationSettings`) through
    `UNUserNotificationCenter` via `objc2-user-notifications`.
  - `notify_nudge(title, body)`: posts with the fixed identifier `tudu.nudge`, so it replaces the delivered one; default
    interruption level (never time sensitive); one category with the action `Pause for today`.
  - A delegate: a click shows the main window and emits `go` with the Today path; the action sets `pausedUntil` and
    tells the page (`nudges:changed`). Banners also show while Tudu is in front (`willPresent` returns banner + list).
  - Guarded: an unbundled dev binary has no bundle proxy and `UNUserNotificationCenter` would crash, so the shell checks
    `NSBundle.mainBundle.bundleIdentifier` first and reports `permission: 'unavailable'` instead.
  - `open_notification_settings` opens System Settings › Notifications.
- `bridge.rs`/`desktop.ts`: the commands above on the bridge and its fake.
- `control.rs` (Tudu Test only): `nudges` (prefs, permission, the last posted title/body/id) and `nudge-clock` (a fake
  now, so Mac e2e can run a day in seconds).

### Design system and canvas

- DS: add `DayPick`, `HoursField`, the `clock` icon and the Working hours section to the kit, light and dark, before
  the build is called done.
- Canvas: the `H-*` boards become the record. Any departure found while building is drawn back onto them and logged in
  the deviations register. The Settings nav (Working hours row) is redrawn on every board that draws the You list:
  `G-B-Dialog`, `G-Desktop-Dark`, `G-Tablet`, `G-Phone`(+Dark/Theme), `G-States`(+Dark), `K-Login`(+Dark), `K-Updates`(+Dark),
  `K-Proto`.

## Tests

IDs are new (`WH-`) unless marked "updated". Test cases also go in `docs/tests/working-hours-nudges.md`. All tests are
run on Rohit's Mac, not in the cloud container.

### Unit (vitest)

| ID     | Where              | Scenario                                                                                                                                                                         |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WH-U01 | core hours         | `parseWorkHours`: default; per-day; refuses end ≤ start, no days, `25:00`, `9:5`, duplicate day; `same` kept                                                                     |
| WH-U02 | core hours         | `hoursLine`: Mon to Fri one stretch; every day; a short Friday; a single day                                                                                                     |
| WH-U03 | core nudges        | `nudgeSlots`: 09:00 to 18:00 hourly → 09..17 + 18; 30 min; 3 hours (09, 12, 15, 18); an end not on the grid (17:30) still gets its slot; a day off → none                       |
| WH-U04 | core nudges        | `nextNudge`: before start, mid-day, after end, a day off, paused until tomorrow, a pause ending at next working day's start (over a weekend)                                      |
| WH-U05 | core nudges        | `dueNow`: on a slot → yes once; same slot twice → no; woke 13:20 with hourly → yes; woke 13:40 → no (waits for 14:00); asleep through two slots → one, never two                 |
| WH-U06 | core nudges        | `nudgeWords`: each row of the table (start, after, since, still, one left, all done, nothing on, end); team space suffix; another person's task never counts                     |
| WH-U07 | core nudges        | Once-a-day: all done sent once, then nothing; a task added to today after → nudges again; nothing on today likewise                                                              |
| WH-U08 | core nudges        | Times are local: same `hours` give the same slots under `TZ=Asia/Kolkata` and `TZ=UTC` (the IST/UTC lesson from the e2e fixtures)                                                |
| WH-U09 | ui DayPick         | Seven toggles with full day names as labels; click toggles `aria-pressed`; `onChange` with the new set; arrow keys move focus                                                   |
| WH-U10 | ui HoursField      | Shows both times; an end before start marks the end field invalid with the error line; `onChange` only with a valid value                                                        |
| WH-U11 | ui Settings        | Working hours row after Appearance on every layout; sub-line from `hoursLine`; loading → skeleton; save error line; per-day swap and back keeps Monday's hours                    |
| WH-U12 | ui Settings        | Nudges block only with `nudges`; off shows the switch alone; on unfolds the rows; asking, denied (+ Open Notifications), paused (+ Resume), sent, failed, sending                 |
| WH-U13 | ui Settings        | Web/phone line shown without `nudges`; reduced motion has no height transition                                                                                                   |
| WH-U14 | web Nudges         | Fake bridge + fake clock: nothing while off; on at 08:59 → nothing; 09:00 → `notify` once with the start words; 10:00 → after words; no `notify` when a day query failed        |
| WH-U15 | web Nudges         | Reload mid-day does not resend the last slot; signed out stops it; pause from the bridge event stops it; Send now ignores hours and pause                                         |
| WH-U16 | web settings       | Saving hours posts `/api/me/hours` once per change, updates the `me` cache at once, and puts the value back with the error line when the post fails                              |

### API (vitest, test database)

| ID     | Scenario                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| WH-A01 | `GET /api/me` returns the default hours for a new account                                                             |
| WH-A02 | `POST /api/me/hours` saves and `GET` returns it; a second post replaces it; another session gets the `me` change        |
| WH-A03 | Refuses bad bodies (400 with the reason): no days, end before start, bad time, unknown keys; signed out → 401         |

### Rust unit (macOS runner)

| ID     | Scenario                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| WH-R01 | Prefs round-trip through `NSUserDefaults` per track; missing → off, hourly, not paused                      |
| WH-R02 | The nudge request: identifier `tudu.nudge`, the category with "Pause for today", not time sensitive         |
| WH-R03 | No bundle identifier → `unavailable`, and no call into `UNUserNotificationCenter`                           |

### Mac E2E (`packages/e2e/mac/tests`, run on Rohit's Mac, Tudu Test)

| ID     | Scenario                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WH-D01 | Settings › Working hours shows Nudges in the app; turning it on asks macOS (permission pre-granted for Tudu Test) and the rows unfold                            |
| WH-D02 | Fake clock at 09:00 with 6 seeded tasks, window hidden → control `nudges` shows title `6 on today`; tick 3 in the sheet, clock 10:00 → `3 done, 3 left today`  |
| WH-D03 | Same identifier each time: Notification Center's delivered list for Tudu Test holds one nudge after three slots                                                  |
| WH-D04 | Pause from Settings: no nudge at the next slot; clock to the next working day 09:00 → nudges again                                                              |
| WH-D05 | Send now outside hours posts the current summary; with the API down it posts nothing and shows the failure line                                                 |
| WH-D06 | Wake simulation (`wake` control at 13:20 and 13:40, hourly) → one nudge at 13:20, none at 13:40                                                                   |

### Web E2E (Playwright)

| ID     | Scenario                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| WH-E01 | Browser: Settings › Working hours, change days and hours, reload → kept; the Nudges block is the one line; an end before start is refused |
| WH-E02 | Phone viewport: More › Settings › Working hours pushes in; the time fields are native time inputs                                         |

### Manual on Rohit's Mac (before merge, results in the PR)

| ID     | Scenario                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| WH-M01 | The real permission prompt on first switch-on (production build); Don't Allow → the denied line and button  |
| WH-M02 | A real hourly nudge reads as drawn in light and dark; the click opens Today; Pause for today works          |
| WH-M03 | With Focus on, nudges stay silent and wait in Notification Center                                           |
| WH-M04 | Close the lid over a slot, open after → behaves per the half-interval rule; no pile-up                     |
| WH-M05 | Fresh install, switch Nudges on → macOS refuses silently → the off-in-macOS step shows; Open Notification settings opens the Notifications page; allow Tudu, come back → On + one test nudge, no restart |

## Out of scope

- Nudges on the web, phones, or a Mac where Tudu is quit (needs push).
- Split days, holidays, a calendar of days off, other time zones.
- Anything else using working hours (People, quiet hours for other notifications) for now.
- Sounds. A nudge is silent unless macOS settings for Tudu say otherwise.

## Risks

- **UserNotifications with an ad hoc signed app (spike done 27 Oct on macOS 26.5.2).** Works once the person allows
  Tudu in System Settings › Notifications: banner, replace by id, Pause for today all checked on Rohit's Mac. macOS
  shows no permission prompt for the ad hoc app, hence the guided off-in-macOS step above. The older
  NSUserNotificationCenter route (what `tauri-plugin-notification` uses) accepts posts and silently drops them, so it
  is not a fallback. Signing with a Developer ID would bring the normal prompt back; not needed for this feature.
- **CI can't grant notification permission** on the GitHub macOS runner. Mac e2e reads what Tudu posted through the
  control channel; delivery is checked by hand (WH-M01..M04) and on Rohit's Mac where Tudu Test is allowed once.
- **Webview timers while hidden.** The App Nap opt-out keeps the main webview running; the 30 s clock check plus the
  wake hook covers throttling. If WebKit still throttles, the scheduler moves into Rust and the page only builds words.
- **Updater key mismatch (separate, known):** installed apps reject updates today, so this build is installed by hand
  until that is fixed.
- The migration number may clash with parallel work (Notebook drawing, MCP server); take the next free number at build
  time.
