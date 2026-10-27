# Working hours and nudges · test cases

The plan is [docs/plans/working-hours-nudges.md](../plans/working-hours-nudges.md). These ids (`WH-…`) come from that
plan, not a chunk, so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`.

## Unit (vitest)

| ID     | Where                                                  | Case                                                                                                                                           |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| WH-U01 | `packages/core/src/hours.test.ts`                      | `parseWorkHours`: default; per-day; refuses end ≤ start, no days, `25:00`, `9:5`, a duplicate day, unknown keys                                |
| WH-U02 | `packages/core/src/hours.test.ts`                      | `hoursLine`: Mon to Fri one stretch; every day; a short Friday; a single day                                                                   |
| WH-U03 | `packages/core/src/nudges.test.ts`                     | `nudgeSlots`: hourly 09..17 + 18; 30 min; 3 hours; an end off the grid (17:30) still gets its slot; a day off → none                           |
| WH-U04 | `packages/core/src/nudges.test.ts`                     | `nextNudge`: before the start, mid-day, after the end, a day off, paused until the next working day (over a weekend)                           |
| WH-U05 | `packages/core/src/nudges.test.ts`                     | `dueNow`: on a slot once; woke 13:20 hourly → yes; 13:40 → waits for 14:00; asleep through two slots → one, never two                          |
| WH-U06 | `packages/core/src/nudges.test.ts`                     | `nudgeWords`: each row of the table; the team space suffix; someone else's task never counts                                                   |
| WH-U07 | `packages/core/src/nudges.test.ts`                     | Once a day: all done said once; a task added after → nudges again; nothing on today likewise                                                   |
| WH-U08 | `packages/core/src/nudges.test.ts`                     | Times are local: the same hours give the same slots under `TZ=Asia/Kolkata` and `TZ=UTC`                                                       |
| WH-U09 | `packages/ui/src/components/WorkHoursSection.test.tsx` | DayPick: seven toggles named by full day; a click flips `aria-pressed`; arrow keys move focus                                                  |
| WH-U10 | `packages/ui/src/components/WorkHoursSection.test.tsx` | HoursField: 24-hour typing (`9`, `930`, `9.30`); an end before the start shows the error line and is not sent                                  |
| WH-U11 | `packages/ui/src/components/WorkHoursSection.test.tsx` | The row after Appearance; its line from `hoursLine`; loading keeps the height; the save error line; per-day and back                           |
| WH-U12 | `packages/ui/src/components/WorkHoursSection.test.tsx` | Nudges: off is the switch alone; on unfolds the rows; asking; off in macOS shows the guide; paused + Resume; Send now                          |
| WH-U13 | `packages/ui/src/components/WorkHoursSection.test.tsx` | Without `nudges` the section says nudges come from the Mac app; the phone has no per-day link                                                  |
| WH-U14 | `apps/web/src/app/nudges.test.ts`                      | Fake bridge and clock: nothing while off or before 09:00; 09:00 the start words once; 10:00 the after words; a failed space skips the nudge    |
| WH-U15 | `apps/web/src/app/nudges.test.ts`                      | A reload mid-slot does not resend; a pause stops them; Send now ignores hours and the pause and writes nothing; macOS refusing reads as failed |
| WH-U16 | `apps/web/src/app/workHours.test.tsx`                  | One post per change and the `me` cache has it at once; a failed save keeps the change, says so, and goes again once online                     |

## API (vitest, test database: `apps/server/src/hours.test.ts`)

| ID     | Case                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------- |
| WH-A01 | `GET /api/me` returns the default hours for a new account                                                 |
| WH-A02 | `POST /api/me/hours` saves, `GET` returns it, a second post replaces it; each publishes `me.changed`      |
| WH-A03 | Bad bodies are 400 with the reason (no days, end before start, bad time, unknown keys); signed out is 401 |

## Unit (`apps/desktop/src-tauri`, Rust, on a Mac: `cargo test --features control`)

| ID     | Case                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| WH-R01 | macOS's authorization status reads as unknown, denied or allowed; `unavailable` serialises as the page expects |
| WH-R02 | Every nudge shares the identifier and category `tudu.nudge`; a click opens Today, the action pauses            |

The plan's WH-R01 (prefs in `NSUserDefaults`) went with the prefs moving to the page; WH-R03 (no bundle id →
`unavailable`) is a guard that only runs outside a bundle, so it is covered by reading, not a test.

## Web E2E (`packages/e2e/tests/settings/hours.spec.ts`)

| ID                         | Case                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| WH-E01                     | Dialog: Saturday and 17:30, the nav line "Mon to Sat, 09:00 to 17:30", kept after a reload; an end before the start is refused and not saved |
| WH-E02                     | Phone: Working hours pushes in; the time fields are 24-hour text fields (`inputmode="numeric"`); no per-day link                             |
| C12 settings nav (updated) | `settings.spec.ts`: the nav reads Account, Appearance, Working hours, Apps, Space                                                            |

## Mac E2E (`packages/e2e/mac/tests/nudges.spec.ts`, on Rohit's Mac)

The page's clock is moved with `window.__tuduNudgeClock` and a focus event; what Tudu posted is read back with the
`notify-status` control. D03, D04 and D05 skip unless Tudu Test is allowed in System Settings › Notifications.

| ID     | Case                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| WH-D01 | Settings › Working hours in the app has Nudges; switching on shows the rows, or the guide when macOS has it off  |
| WH-D02 | Window hidden, 6 today: 09:00 → "6 on today"; 3 ticked, 10:00 → "3 done, 3 left today", "3 since 09:00. Next: …" |
| WH-D03 | Three slots, one nudge in Notification Center                                                                    |
| WH-D04 | Pause for today: nothing at the next slot; the next working day 09:00 nudges again                               |
| WH-D05 | Send now at 21:30 says today as it is, and the sent line shows                                                   |
| WH-D06 | Woke at 13:20 sends one; at 13:40 it waits for 14:00                                                             |

## Manual on Rohit's Mac (results in the PR)

| ID     | Case                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| WH-M01 | Production build, first switch-on: the prompt if macOS shows one, otherwise the guide; Don't Allow → the guide  |
| WH-M02 | A real hourly nudge in light and dark; the click opens Today; Pause for today works                             |
| WH-M03 | With Focus on, nudges stay silent and wait in Notification Center                                               |
| WH-M04 | Lid closed over a slot, opened after → the half-interval rule; no pile-up                                       |
| WH-M05 | Fresh install, Nudges on → the guide; Open Notification settings; allow Tudu, come back → on and one test nudge |
