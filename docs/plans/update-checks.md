# Mac updates: check when Tudu comes back, and when you ask

Status: proposal, waiting for Rohit's approval. No code until then.
Design: canvas page "13 · Menu bar & This Mac" (v61), boards K-Updates and K-Updates-Dark (approved 24 Oct 2026).

## Why

On 24 Oct Tudu Staging showed no "new version" item 10 minutes after 0.37.1-staging.10 was published. Nothing was
broken: the feed served it, but no Mac had fetched it yet (the release bundle had 0 downloads). The app only checks
on launch and every four hours (`CHECK_EVERY_MS`, `apps/web/src/app/updates.ts`), and with background mode
(chunk 16) Tudu keeps running in the menu bar for days. So a new version can sit unseen for up to four hours. Also,
the four-hour `setInterval` runs in the desk's webview, and WebKit throttles timers in hidden windows, so with the
desk closed the real gap can be longer. Nothing lets you ask for a check.

## What changes for the person

1. **Automatic checks**, on top of launch and every four hours:
   - when Tudu comes to the front (the desk, the menu bar sheet or Quick Add gets focus);
   - when the Mac wakes from sleep.

   Either one checks only if the last check finished more than 30 minutes ago. Automatic checks never show an
   error. The next one tries again, as today.
2. **Settings › This Mac › Updates**, a new last section with one row:
   - **Title:** the app's name and version ("Tudu 0.37.0", "Tudu Staging 0.37.1-staging.10").
   - **Status line:** what the last check found.
   - **Button:** depends on the state.

   | State       | Status line                                                        | Button                                        |
   | ----------- | ------------------------------------------------------------------ | --------------------------------------------- |
   | Loading     | skeleton (Settings opened before the app answered)                 | Check now, disabled                           |
   | Never       | Not checked yet.                                                   | Check now                                     |
   | Up to date  | Up to date. Checked 12 minutes ago.                                | Check now                                     |
   | Checking    | Looking for a new version…                                         | loading, "Checking…"                          |
   | Downloading | Downloading Tudu 0.37.1…                                           | progress fill, "Downloading"                  |
   | Ready       | **Tudu 0.37.1 is ready.** Restart to use it.                       | primary "Restart to update"                   |
   | Error       | Couldn’t check for updates. Check your connection and try again.   | Try again                                     |
   | Bad bundle  | Couldn’t download Tudu 0.37.1.                                     | Try again                                     |

   - The error lines use `tp-set-bad`. They show only after Check now, never after an automatic check.
   - A Check now that finds nothing ends on the Button's success tick ("Up to date") for 1.6s, then settles back.
   - A restart that fails shows the existing line under the row: "Couldn’t restart. Quit and open Tudu again to
     finish."
   - An automatic check that starts while Settings is open shows here too: Checking, then Downloading.
3. **Menu bar sheet ⋯**: a new first item, **Check for updates…**. It shows the desk on Settings › This Mac and
   starts a check there. The sheet puts itself away, as Open Tudu does.
   - Once a version is downloaded, the item reads **Restart to update**, with the version as its hint, and
     restarts straight away.
   - When signed out, the item stays; Settings needs a session, so it opens Sign in with the check run anyway. The
     Inbox item appears after sign-in.
4. **The Inbox item is unchanged.** It still appears once the bundle is downloaded and verified, counts once, and
   shows only with no space filter.
5. **Older Mac apps** (0.37.0 and earlier) don't have the new commands. Against them the web hides the Updates
   section and the ⋯ item. Everything else behaves as today.

## Desktop (apps/desktop/src-tauri)

- **`updates.rs`**:
  - `Status` gains:
    - `checking: bool`;
    - `downloading: Option<{ version, received, total }>`;
    - `last_check` as the finish time, which it already is.
  - Every change emits `update:status` (the whole `Status`) to all three windows.
  - `download` reports chunks through its `on_chunk` callback, throttled to one emit every 100ms.
  - `update_check` takes an optional `{ manual: bool }`, which defaults to false so today's callers are
    unchanged, and still answers `Option<Ready>`.
  - New command `update_status` answers the current `Status`.
  - New `auto_check(app)`: does nothing if a check is running or `last_check` is under 30 minutes old;
    otherwise it spawns `update_check`.
- **`lib.rs`**: `WindowEvent::Focused(true)` on any of the three windows calls `auto_check`.
- **`background.rs`**: observes `NSWorkspaceDidWakeNotification` (objc2, next to the existing occlusion
  observer), which calls `auto_check`.
- **Capabilities**: `allow-update-status` is added to the `web` capability in `tauri.conf.json`,
  `tauri.staging.conf.json` and `tauri.test.conf.json`, and to `build.rs`'s command list.
- **Control channel**: `check-update` gains `auto` (runs `auto_check`). New `wake` runs the wake handler, and new
  `age-check <minutes>` moves `last_check` back, so the Mac suite can drive both without waiting.

## Web (apps/web) and kit (packages/ui)

- **`desktop.ts`**:
  - The bridge gains `updateStatus(): Promise<UpdateStatus | null>`, which answers `null` when the app doesn't
    have the command, and `checkUpdate(opts?)`.
  - New event `update:status`.
  - The test fake (`__tuduDesktopFake`) mirrors all of it.
- **`updates.ts`**:
  - `UpdateStore` keeps the latest `UpdateStatus` next to `ready`.
  - The `update:status` event updates it, and so does `update:ready`, as today.
  - `checkNow()` runs a manual check and remembers that the error line may show.
- **`Settings.tsx` (kit)**:
  - `SettingsMac` gains `updates?`, with these fields: `name`, `version`, `state`, `checkedAt`, `progress`,
    `readyVersion`, `error`, `onCheck`, `onRestart`, `restartError`.
  - The **Updates** section draws the row above with `Button`'s `loading`, `progress` and `success` props.
  - Without `updates`, the section isn't drawn.
  - The status line is keyed by state, so each new line fades up 4px in 160ms (`--ease-arrive`). With reduced
    motion it only fades.
- **`settings.tsx` (web)** wires it from `useUpdate()` and the bridge. `?settings=mac&check=1` starts a check when
  the section opens.
- **`MenuBarSheet.tsx` (kit)**: new `update?: { ready?: string; onCheck; onRestart }`. Present, it adds the first
  ⋯ item: "Check for updates…", or "Restart to update" with the hint. `MenuBarPage` passes it only when
  `updateStatus()` answered.
- **Design system**: the `Settings` Updates section and the `MenuBarSheet` `update` prop are mirrored in the DS
  artifact in the same PR. On the canvas, these boards gain the Updates section or the new ⋯ item: K-Login(-Dark),
  K-MenuBar(-Dark), K-Proto and G-States(-Dark), which lists every Settings section. K-Updates is marked built.

No server or database change. The feed already answers in a few milliseconds (five-minute cache), so 30-minute
checks from every Mac are cheap.

## Test scenarios

IDs continue chunk 11's series in `docs/tests/chunk-11.md`: U10, E10, D13. There are no API cases, since the
server doesn't change. Each ID goes in its test's name so `pnpm test:status` finds it.

### Unit (vitest, cargo)

| ID      | Where                         | Case                                                                                                                                                         |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-U10 | desktop `updates.rs` (cargo)  | `auto_check` gate: skips while a check runs; skips when the last check finished under 30 min ago; runs at 30 min and with no check yet                        |
| C11-U11 | ui `Settings.test.tsx`        | Updates row, each state in the table: title, status line, button variant/label; loading skeleton with Check now disabled; no `updates` prop draws no section |
| C11-U12 | ui `Settings.test.tsx`        | Check now calls `onCheck`; nothing found shows the tick and "Up to date", then Check now again; Restart calls `onRestart`; `restartError` shows its line      |
| C11-U13 | ui `MenuBarSheet.test.tsx`    | With `update`, ⋯ lists Check for updates… first, then Send feedback…, Quit; with `ready` it reads Restart to update with the version hint; without it, no item |
| C11-U14 | web `updates.test.ts`         | `update:status` drives the store; an automatic check's error never sets the error line; a manual one does; a later success clears it                        |
| C11-U15 | web `desktop.test.tsx`        | Old app: `updateStatus()` rejects (no command), so Settings has no Updates section and the sheet has no item; the Inbox update item still works               |

### End to end, web against the app fake (`packages/e2e/tests/desktop`)

| ID      | Case                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-E10 | Settings › This Mac shows "Tudu 0.37.0 · Up to date. Checked …"; Check now → Checking… → nothing new → the tick → Check now; the fake saw one manual check    |
| C11-E11 | Check now finds 0.38.0: Downloading with the fill growing as the fake sends progress, then Ready with Restart to update; the top-bar Inbox count rises by one |
| C11-E12 | Check now with the fake failing: the error line and Try again; Try again succeeds and the line clears. An automatic failure while open shows nothing         |
| C11-E13 | Menu bar sheet: ⋯ › Check for updates… asks the app to show the desk on Settings › This Mac and a check starts; with a version ready, ⋯ › Restart to update installs |
| C11-E14 | Dark: the Updates section in Up to date, Ready and Error, and the ⋯ menu, in dark                                                                             |

### Real app (`pnpm e2e:mac`, Tudu Test)

| ID      | Case                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-D13 | Regression for 24 Oct: launch with no release (check: none), publish the next version, focus the desk with the last check over 30 min old (`age-check 31`), and the version downloads and the Inbox item shows with no relaunch |
| C11-D14 | The floor: focus again within 30 min, and no check (the count stays); a `wake` past 30 min checks once                                                         |
| C11-D15 | Settings › This Mac › Check now on the real app finds the next version, shows Downloading then Ready; Restart to update relaunches on it (as C11-D07)          |

The existing C11-U04, C11-E02/E03 and C11-D06 to D08 keep their IDs, unchanged.

## Out of scope

- No change to the four-hour interval itself.
- No Sparkle-style "Install automatically". Restarting stays your call.
- Phones and the web never show any of this.

## Rollout

One PR: desktop, kit, web, tests, the DS mirror and the canvas boards. Staging gets it on merge. Tudu Staging
builds before this one still need a relaunch to pick up the first build that has it.
