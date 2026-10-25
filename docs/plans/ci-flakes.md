# CI flakes: why master keeps going red, and the fix

Status: Rohit gave the go-ahead on 25 Oct 2026 ("you can do what you need now"); implemented on
`claude/project-thread-c951b0`. Canvas: not applicable (test and CI only, no visible change).

## What failed, and how often

Every failed `CI` run from run 30 (23 Oct) to run 66 (25 Oct), from the job logs:

| Run | Where           | Failed test                    | Kind                            |
| --- | --------------- | ------------------------------ | ------------------------------- |
| 66  | master (PR #16) | C20-D06 (Mac)                  | flake: sheet stays open         |
| 64  | PR #16          | C11-E15 (web, desktop)         | flake: ⋯ menu gone              |
| 64  | PR #16          | C03-E10 (phone), 30 s timeout  | the PR's own new steps; fixed   |
| 63  | master (PR #15) | C11-E15 (web, desktop)         | flake: ⋯ menu gone              |
| 61  | master (PR #14) | C20-D04 (Mac)                  | flake: sheet stays open         |
| 58  | PR #14          | C20-D04 (Mac), FX-E02 (phone)  | flake + the PR's own test       |
| 49  | master (PR #11) | C20-D04 (Mac)                  | flake: sheet stays open         |
| 37  | PR #7           | C09-E01 (tablet)               | PR in progress                  |
| 35  | PR #7           | C18-E10 (desktop)              | the PR's own new test           |
| 34  | master (PR #6)  | C20-D04 (Mac)                  | flake: sheet stays open         |
| 30  | PR #5           | C17-E02 (desktop), strict mode | two "Northwind" spaces; one-off |

All five red master runs come from two tests that both involve the menu bar sheet:

1. **Mac: the sheet doesn't hide when another app comes forward.** C20-D04 failed 4 times before PR #15, then C20-D06
   failed on the first master run after it. Caused 4 of the 5 red master runs.
2. **Web: the sheet's ⋯ menu closes before the test clicks it** (C11-E15). It failed 2 of the last 4 runs, both times
   in shard 1.

Everything else either failed on the PR that introduced the test (and got fixed there) or happened once and never
again (C04-E05 on 24 Oct, C17-E02 on 23 Oct).

Why it keeps landing on master: `retries: 0`, and a PR proves a fix with one or two green runs. A test that fails one
run in four passes twice in a row about half the time, so PR #15 ("green twice") proved nothing. Its own plan asked for
3 runs in a row, and only 2 were done.

## 1. The Mac sheet (C20-D04, C20-D06)

The failure dumps from all five runs (D04 ×4, D06 ×1) look the same: `menubar.visible: true`, `menubar.focused: true`,
`main.focused: false`, 13 s after the test "activated Finder". The panel is still the key window, so nothing ever took
focus from it.

PR #15 explained this as "Tudu wasn't the active app, so the panel never resigns key" and added an
`NSWorkspaceDidActivateApplicationNotification` observer. That fix covers the case PR #15 described. It does not help if
**Finder never comes forward**, and that is the one explanation that fits every dump, before and after the fix:

- `clickAnotherApp()` runs `osascript -e 'tell application "Finder" to activate'` and only checks the exit status.
  macOS 14 and later use cooperative activation, so an activation request from a background process (osascript) can be
  turned down while osascript still exits 0. When that happens, no app changes: no `resignKey`, no workspace
  notification, and the sheet correctly stays open.
- C20-D07 posts its outside click through the control channel instead of real app activation, and it has never failed.
- C20-D06 also never checks that Calculator really came forward before it opens the sheet. `!main.focused` can be true
  while Tudu is still the active app.

This is inferred, not proven. The harness doesn't record which app is frontmost, and the artifact (screenshot and
app.log) can't be downloaded from this environment. The change below makes the next failure say which side broke.

A smaller app-side weakness: `ours = NSRunningApplication::currentApplication().isActive()` reads global state when the
notification arrives, instead of reading which app the notification names. Reading the notification's
`NSWorkspaceApplicationKey` and comparing it with our own `NSRunningApplication` is exact and costs nothing.

### Change

1. `packages/e2e/mac/tests/desktop.spec.ts`: replace `clickAnotherApp()` with `bringForward(name)`. It runs
   `open -b <bundle id>`, then polls `lsappinfo info -only bundleid $(lsappinfo front)` (no Accessibility permission
   needed) for up to 3 s until that app is in front. If it isn't, it tries `osascript … activate` and waits 3 s more,
   then throws `"<name> never came forward (in front: <x>)"`.
2. C20-D06: `bringForward('Calculator')`, which waits until Calculator is actually in front, before opening the sheet.
   C20-D04: the same helper for Finder.
3. App (`windows.rs`; shown by the `control` feature's state): the control state gains
   `outside: { last: "blur" | "click" | "activate" | null, app: string | null, hid: boolean, at: string | null }`,
   set inside `outside()`. A failure dump then shows whether the app heard the event and what it decided.
4. App (`windows.rs`): `ours` comes from the notification's `NSWorkspaceApplicationKey` (equal to
   `NSRunningApplication::currentApplication()`), not `isActive()`.

## 2. The web ⋯ menu (C11-E15)

Shard 1, desktop project. After the test sets "ready" through the fake and clicks More, the menu either never shows
(run 63: `menuitem` not found for 5 s) or shows, passes both `toContainText` checks, and is gone when the click comes
(run 64: `click` waits 30 s for an element that no longer exists). Something closes or remounts the Radix menu a moment
after it opens.

Root cause, confirmed from the run 63 and 64 traces (downloaded on Rohit's Mac) and then reproduced on purpose:

- Choosing "Check for updates…" closes the menu, and Radix keeps its content mounted for the 120 ms exit animation
  (`.tp-menu-pop[data-state='closed']`; 120 ms under reduced motion, 130 ms otherwise).
- The test sets the update to ready and clicks More again about 110 ms later (run 63: the select at 270058, the
  second click at 270166). The trace's snapshots show the old menu still there in `data-state="closed"`, already
  showing "Restart to update".
- A click on the trigger while that exit is running doesn't open the menu. The leaving content goes away and the trigger
  stays `aria-expanded="false"`. In run 64 the `toContainText` checks matched the leaving menu, and then the click found
  nothing.
- Forced: "select, then click More straight away" fails 10 of 10 locally, and "select, wait for the menu to be gone,
  then click More" passes 10 of 10. On a fast machine the steps in between take longer than 120 ms, which is why it
  only showed up on a loaded runner.

It's a timing problem in the test, not a broken menu. A person reopening ⋯ within 120 ms of it closing would see the
same thing, but that is an edge case, and fixing it means changing how every Radix menu animates out (a design
change). It's not in this change.

### Change

1. C11-E15 waits for the closed menu to be gone (`expect(m.getByRole('menu')).toHaveCount(0)`) before it clicks More
   again. After the fix: 60 of 60 runs (C11-E15 and E16, 30 each, 4 workers).
2. No retry wrapper (`toPass`).

## 3. CI hygiene

1. `ci.yml`: the Postgres health check is `pg_isready -U tudu`, which connects to a database named `tudu` that doesn't
   exist. That produces the hundreds of `FATAL: database "tudu" does not exist` lines that bury every failed E2E log.
   Change it to `pg_isready -U tudu -d postgres`.
2. Proving a flake fix: a new `workflow_dispatch` workflow, `flake-check.yml`, takes a `grep` and a `repeat` input and
   runs that test N times on the same runner type (Mac or Ubuntu). Every flake fix PR attaches a green run of at least
   20 repeats. That replaces "re-run the job twice".
3. Retries (Rohit's call, see the question below). Today, one flake anywhere fails the run. Playwright's `retries: 1`
   on CI, with flaky tests still listed in the job summary, would keep master green while the list says what to fix.
   The downside is that a genuine one-in-two bug can slip through. I recommend leaving `retries: 0` until 1 and 2 above
   are done, then deciding.

## Test scenarios

Updated or new (rows go in `docs/tests/chunk-20.md` and `chunk-11.md`):

| ID      | Kind    | Case                                                                                                             |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| C20-D04 | Mac E2E | (updated) Tudu in front, sheet open, `bringForward('Finder')` confirms Finder is front → sheet hidden; Esc too   |
| C20-D06 | Mac E2E | (updated) `bringForward('Calculator')` confirmed front before the sheet opens; `bringForward('Finder')` → hidden |
| H-01    | Harness | `bringForward` throws a "never came forward" error naming the app in front when the target can't be activated    |
| C11-E15 | Web E2E | (updated) the ⋯ is reopened only once the last one has left (`menu` count 0)                                     |

Dropped from the first draft: a Rust unit test for the notification check (it needs real AppKit objects; CI's Mac run
covers it), and a D case asserting `outside` (the order of the blur and the activation isn't fixed). `outside` is in
every failure dump instead.

Regression: C20-D01..D07, C16-D01..D07, MB-D01..D04, C11-E14..E16 unchanged.

Done means:

- `flake-check` runs the C20 group 20 times on macOS and C11-E15 30 times on Ubuntu, all green. Done on PR #17
  (25 Oct): C20-D04/D06/D07 60 of 60, C11-E15 30 of 30.
- Then 5 master pushes in a row with a green `Desktop (macOS)` and `End-to-end (1/4)`.
