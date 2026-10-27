# The number beside the tick: today's tasks left, a dot for the Inbox

Status: proposal, awaiting Rohit's approval. Design picked by Rohit on 27 Oct 2026 (option A). Canvas: board "The
number beside the tick" (`K-TickCount`, `K-TickCount-Dark`) on the page "Menu bar & This Mac", canvas v144. The same
publish redrew every other board that draws the tick or the sheet: `K-MenuBar`(+Dark), `K-Login`(+Dark),
`K-Updates`(+Dark), `K-TrayIcon` and `K-Proto`.

## Why

Item 12 of Rohit's staging list (26 Oct): the number in the menu bar should say how many of today's tasks are left.
Today it is the Inbox count, and it only shows while the window is closed (with the window open it moves to the Dock
badge). The Inbox then needs another signal.

## What changes for the person

1. **The number beside the tick** is how many of today's tasks are still open: yours, across every space. These are
   the same rows the menu bar sheet lists and its ring counts, carried-over ones included. It shows whether or not the
   Dock icon is there. It stops at `99+`. When everything is done, or nothing is planned, there is no number: just the
   tick, never a `0`.
2. **A dot on the tick** means something is new in the Inbox (an invite, a request, a new version: the same total as
   the top bar's Inbox button). The dot is part of the tick's template image, so macOS inks it like the tick in light,
   dark and tinted menu bars. It is not red, because a template image is single-colour.
3. **The Dock badge is unchanged**: the Inbox count, while the Dock icon shows.
4. **The tooltip** spells it out: `Tudu · 3 left today · 2 new in your Inbox`. Each part shows only when it is true:
   `Tudu · All done for today`, `Tudu · Nothing planned today`, `Tudu` (signed out). The track name stays first
   (`Tudu Staging · …`). The Notes shortcut tooltip (item 2, its own thread) joins this same line when it lands.
5. **The sheet** gets a line under its heading while something is new: `2 new in your Inbox ›`. Clicking it opens the
   desk on `/inbox` and hides the sheet. The line opens and closes with a 200 ms `grid-template-rows` 0fr↔1fr plus
   opacity, so the rows below slide instead of jumping. Reduced motion: no height animation, the line just appears.
6. **States**: starting up (bare until the first count arrives), offline (the last count stays; offline ticks still
   count down, since they go through the same outbox), signed out (bare, no dot), midnight (the count moves with the
   working day's 04:00 turn).

## How

### Web (`apps/web`, `packages/core`, `packages/ui`)

- `packages/core/src/menubar.ts`: new `todayLeft(groups)`, the number of open tasks in `gatherToday`'s groups. The
  sheet's ring and the tick then share one definition.
- `apps/web/src/app/DesktopHost.tsx` (main window only, which keeps its live stream while hidden):
  - wrap the reporter in its own small `TodayCount` component under a `WorkingDayProvider`, so it has the working day;
  - read each space's today with `taskStore.dayQuery(space, today, today)` (the same cache entries the sheet and All
    spaces use, so nothing is fetched twice), run `gatherToday`, then `todayLeft`;
  - report `d.setTick({ left, inbox })` after the first fetch. `left` is `null` until every day query has data (or
    has failed), and `null` when signed out. `inbox` is `inboxTotal(me, update.unread)`, the number the badge already
    uses.
  - `setBadge` stays as it is for the Dock.
- `apps/web/src/app/desktop.ts`: `setTick` on the bridge, calling the new `set_tick` command (and the fake bridge used
  in tests).
- `packages/ui/src/components/MenuBarSheet.tsx`: new optional `inbox?: { count: number; onOpen(): void }`. The line is
  always rendered and toggled by a class, so the transition can run. It is a real `<button>` whose label is
  `2 new in your Inbox, open the Inbox`. CSS lives in `components.css` beside the sheet's.
- `apps/web/src/routes/menubar/MenuBarPage.tsx`: passes `inbox` from `inboxTotal(me, …)`. `onOpen` calls
  `app.showMain('/inbox')`, or `go('/inbox')` outside the app.

### Mac app (`apps/desktop/src-tauri`)

- `bridge.rs`: new `set_tick(left: Option<i64>, inbox: i64)` command, stored on `Seen` (`today_left`, `inbox`), then
  `background::apply`. `set_badge` keeps writing `badge` for the Dock.
- `background.rs`:
  - `count_places` becomes `tick_places(policy, inbox, left) -> Places { badge, title, dot }`: `badge` = inbox while
    Regular (as now); `title` = `tray_title(left)` in **both** policies; `dot` = inbox > 0 in both.
  - `tray_title` is unchanged (`None`/0 → none, `>99` → `99+`).
  - new pure `tick_tooltip(name, left, inbox) -> String`.
  - `apply` sets the title, icon and tooltip only when each changes (the chunk 16 lesson: setting them again for
    nothing disturbs the focused window). For the icon: `set_icon(tray or tray-dot)` followed by
    `set_icon_as_template(true)`.
- `scripts/icons.mjs`: also writes `tray-dot.svg/png`. This is the tick plus a 6pt dot top right, cut from the tick by a
  1.5pt clear ring, still black on clear and 36×36. Re-run `pnpm --filter @tudu/desktop icons` and commit both PNGs.
- `control.rs` (test builds): state gains `background.trayDot` and `background.trayTooltip`. `trayTitle` now reports
  today's count.

### Design system and canvas

- The canvas is already redrawn (v144, listed above). The `K-TickCount` boards are marked "Picked · 27 Oct".
- The DS has no `MenuBarSheet` component: the canvas boards draw the sheet in markup and use DS `Icon`, `Checkbox`,
  `DayProgress` and `Button`, so the DS has nothing to change. If you want the sheet in the DS as a component, that's a
  separate piece of work.

## Tests

IDs are new (`MC-`) unless marked "updated".

### Unit (vitest, Linux)

| ID     | Where              | Scenario                                                                                                                                                         |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MC-U01 | core               | `todayLeft`: two spaces, 5 rows with 2 done → 3; all done → 0; no groups → 0; another person's task never counts (it never reaches the groups)                   |
| MC-U02 | MenuBarSheet       | `inbox` absent or count 0 → the line is collapsed and hidden from the accessibility tree; count 2 → "2 new in your Inbox" button shown; click calls `onOpen` once |
| MC-U03 | MenuBarSheet       | Reduced motion: the line has no height transition                                                                                                                |
| MC-U04 | web (DesktopHost)  | Fake bridge: no `setTick` before `me` and the day queries land; then `{ left: 3, inbox: 2 }`; ticking one off → `{ left: 2 }`; signed out → `{ left: null }`     |
| MC-U05 | web (DesktopHost)  | A day query that fails still lets the count report (from the spaces that answered); the web build (no bridge) never calls it                                     |
| MC-U06 | web (MenuBarPage)  | With 2 new in the Inbox the sheet shows the line; clicking it calls `showMain('/inbox')` and nothing else                                                        |
| C20-U02 | MenuBarSheet (updated) | Also asserts the line is absent by default, so today's sheet tests keep their layout                                                                     |

### Rust unit (macOS runner)

| ID              | Scenario                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MC-R01          | `tick_places(Regular, 2, Some(3))` → badge 2, title "3", dot; `(Accessory, 2, Some(3))` → no badge, title "3", dot; `(Accessory, 0, Some(0))` → nothing; `(Regular, 0, None)` → nothing |
| MC-R02          | `tick_places(Accessory, 150, Some(120))` → title "99+", dot; `(Regular, 150, Some(120))` → badge 150, title "99+"                                                      |
| MC-R03          | `tick_tooltip`: ("Tudu", Some(3), 2) → "Tudu · 3 left today · 2 new in your Inbox"; (…, Some(0), 0) → "Tudu · All done for today"; (…, None, 0) → "Tudu"; ("Tudu Staging", Some(1), 1) → "Tudu Staging · 1 left today · 1 new in your Inbox" |
| MB-U01 (updated) | `tray_title` cases are unchanged and stay                                                                                                                            |
| MB-U02 (updated) | Replaced by MC-R01 and MC-R02 (`count_places` goes)                                                                                                                  |

### Script (vitest, Linux)

| ID     | Scenario                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| MC-S01 | `tray-dot.svg` is the tick path plus one circle, with the clear ring, black on clear, 36×36; `tray-dot.png` is 36×36 RGBA and matches its SVG |
| MB-S01/S02 | Unchanged for `tray.svg`/`tray.png`                                                                                                 |

### Mac E2E (`packages/e2e/mac/tests/desktop.spec.ts`, run on Rohit's Mac)

| ID                | Scenario                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MC-D01            | Window hidden, 3 open tasks today (Personal 2, a team space 1) → `trayTitle` "3"; tick one in the sheet → "2"; tick the rest → null, tooltip "… All done for today" |
| MC-D02            | Window open (regular) with the same seed → `trayTitle` still "3" and the badge is the Inbox count, not 3                                               |
| MC-D03            | A request sent to you while hidden → `trayDot` true, tooltip contains "1 new in your Inbox", the sheet shows the line; clicking it shows the desk on `/inbox`; reading it → dot false |
| MC-D04            | A task ticked on another device (API) while hidden → `trayTitle` drops within the live-stream window, with no sheet opened                              |
| MC-D05            | Signed out → no title, no dot, tooltip "Tudu Test"                                                                                                       |
| MB-D03 (updated)  | 120 open tasks today (seeded through `set_tick`, as the old test seeded `set_badge`) → "99+" in both policies; the Dock badge keeps the Inbox count     |
| C16-D02 (updated) | Hidden 15 s, a request sent to you shows as the dot (not "1" beside the tick); the write made before closing still reached the API                      |
| C16-D07 (updated) | Always: the badge stays after close and the tick keeps today's count                                                                                    |
| MB-D04 (updated)  | The tick hidden by a full bar: the Dock icon and badge stay; title and dot still set (harmless while hidden)                                           |

### Web E2E (Playwright)

| ID     | Scenario                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| MC-E01 | `/menubar` in the browser with an unread invite → the Inbox line shows; clicking it lands on `/inbox`; with none, no line |

### Manual on Rohit's Mac (before merge, results in the PR)

| ID     | Scenario                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| MC-M01 | The dot reads clearly on a light, a dark and a tinted-wallpaper menu bar, idle and pressed, with a number  |
| MC-M02 | Hover the tick: the tooltip reads as drawn, for 3 left + new, all done, and signed out                     |
| MC-M03 | Tick a task on the phone: the Mac's number drops within a few seconds with the window closed               |
| MC-M04 | The sheet's Inbox line slides in and out without the rows jumping                                          |

## Out of scope

- A coloured (red) dot: it would mean dropping template mode and drawing our own light, dark and tinted versions.
- Animating the tick itself: the title and image are macOS's own drawing and change in place.
- Notifications (chunk 14) and the Notes shortcut tooltip (item 2, its own thread).

## Risks

- `set_icon` on a template tray icon can drop the template flag in some tray-icon versions. Calling
  `set_icon_as_template(true)` right after covers that; MC-M01 checks it by eye.
- The hidden main webview's live stream must keep running for MC-D04. Chunk 16 already opts out of App Nap while
  hidden. If WebKit throttles the stream anyway, the fallback is a refresh when the sheet shows (it already does
  one), and MC-D04 becomes "drops by the next sheet open".
