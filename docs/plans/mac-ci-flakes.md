# Mac app CI job fails one different test per run

Status: proposal, 6 Nov 2026, awaiting Rohit's approval. Canvas: not applicable, I think (no new screens; one fix
keeps the note on screen where it now shows "This note didn't open"). I'm asking Rohit before skipping it.

## The report

Since 5 Nov the "Mac app (macOS)" job in "Tests: PR + master" goes red with exactly one failed test out of 64, and a
different one each time:

| Run                                           | Failed                        | What the log says                                                                      |
| --------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| master `d8e52ce` (#81 merge), run 42088937374 | C11-D09 the Dock badge        | `badge` stuck at `"2"`, waiting for `"3"` after the request in the second space (Acme) |
| PR #82, run 42093559068 attempt 1             | C17-D01 the summon says where | floating bar's line read `In Personal for Me`, not Northwind                           |
| PR #82, run 42093559068 attempt 2             | C22-D41 offline drawing       | `.tp-nb-sheet-done` never there: the drawing sheet was gone                            |
| master, run 41349001302 (1 Nov)               | WH-D06 waking at 13:20        | no nudge posted within 10 s at 13:20                                                   |
| Rohit's Mac (5 Nov)                           | WH-D01                        | `permission` read `unknown` while Settings showed the guide (denied)                   |

Runner image, macOS version and the #81 change are not it: failing and passing runs use both images
(`macos-26-arm64` 20261026 and 20261102), and #81 only touched Jira code that does nothing without a Jira connection.

## Is there one shared cause?

**No, and I want to be straight about that.** I went looking for one thing (App Nap, WebKit throttling hidden windows,
the control channel, the harness's waits) and didn't find it: App Nap is already off, every webview runs with
scheduling policy "none" (the state dump shows `webviews: 2` for all four), and the harness waits are fine.

What the failures share is a **pattern, not a line of code**: each test does something a few milliseconds after the
app changed, and the app has a real race in that window. On a fast run the app wins; on a slow run (the CI Mac is a
3-core VM running a debug build of the app, the API, vite preview and Postgres) the test lands inside the window. Each
run has ~64 chances, so with four or five races of a few percent each, about one run in three goes red, on whichever
race lost that time. That matches what we see.

Four of the five are **app bugs a real person can hit**, not test bugs. Fixing them in the app is the fix; padding the
tests' timeouts would hide them.

### 1. C22-D41: a failed background read of a note replaces the editor (confirmed in code)

`useNoteEditor` (`apps/web/src/app/noteEditing.tsx`) reads the note with `retry: false` and returns
`{ error: true }` whenever `q.isError`. In React Query 5, a _background_ refetch that fails sets `isError` even though
the note is still in the cache. So any read of the open note that fails (offline, a server blip) swaps the whole
editor for "This note didn't open", and an open drawing sheet goes with it (it's portalled from `NoteEditor`).

In the test, the net goes down right after the sheet opens; if a read of that note is in flight or starts in that
moment (the seed note's NOTEBOOK_CHANGED, a save's answer), it fails and the sheet disappears. A person drawing on a
train hits the same thing.

**Fix:** show the error only when there is nothing to show: `q.isError && !q.data`. A failed refetch with a cached
note keeps the note (and the sheet) on screen; the save state already says "Offline" / "Waiting to save".

### 2. C17-D01: the floating bar reads a stale list of spaces, and erases the remembered one (confirmed in code)

On `floating:shown`, `QuickAddPage` calls `lastHere()` straight away with the floating window's own `me`. That `me`
was read when the window loaded and is refreshed only by its live stream (or the `refreshMe()` that
`FloatingQuickAdd` starts in the same event, which hasn't answered yet). A space you made a moment ago isn't in it,
so `lastSpace()` treats the remembered slug as a space you left, calls `forgetSpace()` (which deletes it from the
localStorage the desk shares) and the bar opens on Personal.

So: make a space, press ⌘⇧N within a second or so, and the bar is on Personal, and the desk has forgotten where you
were too.

**Fix:**

- On `floating:shown`, wait for `refreshMe()` and pick the space from the fresh list. Until it answers (normally tens
  of ms), keep the space the bar already had rather than flashing Personal.
- `lastSpace()` takes an option not to forget: the floating window never erases the remembered space; only the desk
  (whose `me` is the one that decides you left a space) does.

### 3. C11-D09: events that happen while a page is loading are lost (likely; needs the artifact to confirm)

The live stream is opened after the page has read `me`. The server starts a fresh stream "now" (`after = Infinity` in
`apps/server/src/routes/events.ts`), so anything published between the page's `me` read and the stream subscribing is
never delivered. The test navigates to Acme and then, within a few hundred ms, joins the second person and sends the
request; `MEMBERS_CHANGED` and `INBOX_CHANGED` both landed in that gap, so nothing refetched `me` and the badge stayed
at 2 for the whole 10 s.

For a person: the Inbox count (and the Dock badge) can be one behind after a reload until the next event.

**Fix:** on the stream's first `hello`, read `me` again if it was read before the stream opened (one extra `/api/me`
per page load at most; cached days are already covered by the same logic on reconnect). No server change.

**Caveat:** this one I've shown is possible, not that it happened. The run's `app.log` and screenshot would settle it,
and the cloud session can't download Actions artifacts. I'll pull them on Rohit's Mac (`gh run download
42088937374 -n desktop-report`) before implementing, and the same for C22-D41 (the screenshot should show "This note
didn't open").

### 4. WH-D01 on Rohit's Mac: asking and checking disagree (confirmed in code, not a flake)

With the ad hoc signature, `requestAuthorization` answers "not granted" (so the page shows the guide), but
`getNotificationSettings` still reports `notDetermined`, which `permission_from_status` maps to `unknown`. The page
also re-checks on every focus (`NudgeClock`), so on Rohit's Mac the guide disappears the moment the window is
focused again. CI never sees it because there nobody answers the box.

**Fix (Rust, `nudges.rs`):** remember the last answer to `ask()`. `status()` reports `denied` when macOS says
`notDetermined` but we already asked and were refused in this run.

### 5. WH-D06 (1 Nov, once): not explained yet

No nudge at 13:20 within 10 s. I have no artifact for it and can't see a race in `NudgeClock` from the code alone. I
won't touch it in this change; if it comes back I'll pull that run's artifact.

## What I won't do

- No retries (`retries: 0` stays), no longer timeouts, no `toPass` wrappers. They'd make CI green and leave the
  bugs.
- No sharding (declined 25 Oct).

## Test scenarios

New (each one fails on today's code and passes with the fix):

- **C22-U105** (`noteEditing` unit, web): a note is loaded, a refetch fails → the editor props are the note, not
  `{ error: true }`; with no cached note, a failed read is still the error state.
- **C22-D44** (Mac): with the drawing sheet open, take the net down and force a read of the note
  (`queryClient.invalidateQueries` through the page hook); the sheet and Done stay, Done works, back up the save goes
  through. Deterministic version of what C22-D41 hits by chance.
- **C17-U05** (unit, web): `lastSpace(spaces, { keep: true })` with a slug missing from `spaces` answers null and
  leaves localStorage alone; without `keep` it still forgets (today's behaviour on the desk).
- **C17-D02** (Mac): make a space through the API from the desk and summon at once (no wait): the line says the new
  space, and after closing the bar the desk's remembered space is still the new one.
- **C11-U44** (unit, web): `useLiveEvents` with `me` read before the stream opens → on first `hello`, `me` is
  invalidated once; a later `hello` after a reconnect doesn't double it.
- **C11-D21** (Mac): reload the desk and, before the stream is up, send a request to you from another person: the
  Dock badge reaches the new count without any other event.
- **WH-R03** (Rust unit): `status` after an `ask` that answered not granted reads `denied` when macOS says not
  determined; before any ask it reads `unknown`.
- **WH-D07** (Mac, Rohit's Mac only in practice): switch Nudges on, refocus the window: the guide stays.

Updated:

- **WH-D01**: after the switch, wait for `notify-status` to settle instead of reading it once, and on the guide path
  expect `denied` (holds now with the fix).
- **C17-D01, C11-D09, C22-D41**: unchanged. They should simply stop failing.

## How I'll verify (on Rohit's Mac, per the project rule)

1. Pull the artifacts of runs 42088937374 and 42093559068 and check the screenshots and `app.log` against causes 1
   and 3. If either doesn't match, I come back with what it shows before writing code.
2. Run the new cases red on master, then green with the fix.
3. Run C11-D09, C17-D01, C22-D41, WH-D01 25 times each on the Mac (`pnpm e2e:mac -g … --repeat-each 25`), then the
   whole Mac group three times.
4. On CI: the Flake check workflow (Actions › Flake check, suite mac) with repeat 20 for the same four, then five
   master runs in a row green before I call it fixed.

## Files

- `apps/web/src/app/noteEditing.tsx` (cause 1)
- `apps/web/src/routes/quick-add/QuickAddPage.tsx`, `apps/web/src/app/space.tsx` (cause 2)
- `apps/web/src/app/live.ts` (cause 3)
- `apps/desktop/src-tauri/src/nudges.rs` (cause 4)
- tests: `apps/web/src/app/*.test.ts(x)`, `packages/e2e/mac/tests/{desktop,notebook,nudges}.spec.ts`
