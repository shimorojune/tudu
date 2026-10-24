# Chunk 01 · Sign in and the app shell · test cases

Run with `pnpm test -- --project ui --project client --project server` and `pnpm e2e auth shell`. API tests use
one throwaway database per run; end-to-end tests read sign-in codes from the test outbox.

## Unit (`packages/ui`, `packages/client`)

| ID      | What it checks              | Scenario                                                                                                                                                                                       |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01-U01 | CodeField typing            | A digit fills the next box and moves the ink ring; non-digits are ignored; backspace steps back; paste fills all six                                                                           |
| C01-U02 | CodeField completes         | Six digits fire onComplete once; a wrong code nudges the row, edges it red and empties it; disabled while checking                                                                             |
| C01-U03 | Sign in validates on submit | "rohit@northwind" is refused with "That doesn’t look like an email address." only when you press Continue; a real address sends the code and shows "Check your email" with the address in bold |
| C01-U04 | Sign in states              | Sending a code…, Checking…, You’re in (then onDone), expired (Send a new code at once), too many tries (boxes rest), wrong (boxes cleared), the resend countdown                               |
| C01-U05 | Sidebar                     | The active view is the paper chip, never a heavier weight; it folds to the rail and back; picks come back as values                                                                            |
| C01-U06 | Bottom tabs                 | The active tab, the round New task button, badge counts                                                                                                                                        |
| C01-U07 | Account menu                | Name and email, the theme switch changes the theme, Settings and Sign out call their handlers                                                                                                  |
| C01-U08 | Live stream client          | Reconnects with backoff (1, 2, 4, 8s, capped) and resumes from the last event id; a good connection resets the wait                                                                            |
| C01-U09 | Readiness wait              | All probes pass from the start: ready after exactly 3 rounds (`scripts/wait-ready.mjs`)                                                                                                        |
| C01-U10 | Readiness wait              | Web /health 404s for 2 rounds: ready only after 3 passes counted from round 3                                                                                                                  |
| C01-U11 | Readiness wait              | A failure mid-streak resets the count                                                                                                                                                          |
| C01-U12 | Readiness wait              | /sign-in answering 200 without the app root counts as a failure                                                                                                                                |
| C01-U13 | Readiness wait              | The API answering { ok: false } counts as a failure                                                                                                                                            |
| C01-U14 | Readiness wait              | The API never comes up: gives up at the timeout and names the probe and its last status                                                                                                        |
| C01-U15 | Readiness wait              | Connection refused on the web is a failure, not a crash, and is reported                                                                                                                       |

## API (`apps/server`)

| ID      | What it checks   | Scenario                                                                                 |
| ------- | ---------------- | ---------------------------------------------------------------------------------------- |
| C01-A01 | Send a code      | A valid address gets one mail with a six-digit code                                      |
| C01-A02 | Bad address      | "That doesn’t look like an email address.", nothing sent                                 |
| C01-A03 | Right code       | A session, the user, and a Personal space for a new person                               |
| C01-A04 | Wrong code       | Refused and counted; the right code still works after one miss                           |
| C01-A05 | Five wrong codes | The code is locked; a fresh code works                                                   |
| C01-A06 | Expired code     | A code past ten minutes is refused                                                       |
| C01-A07 | One use          | A code works once                                                                        |
| C01-A08 | Send limit       | The sixth code to one address in ten minutes is refused with a plain message             |
| C01-A09 | Who am I         | GET /api/me needs a session and returns the person and their spaces                      |
| C01-A10 | Sign out         | The session ends; the cookie no longer works                                             |
| C01-A11 | Live stream      | Says hello, keeps a heartbeat, delivers a published event, ends by itself after sign out |

## End-to-end (`packages/e2e/tests/auth`, `tests/shell`; groups `auth`, `shell`, `smoke`)

| ID      | What it checks                 | Scenario                                                                                                                         |
| ------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| C01-E01 | New person, desktop            | Email, the code from the outbox, lands on the empty Today                                                                        |
| C01-E02 | Returning person               | Signs in again with a new code and lands on Today                                                                                |
| C01-E03 | Wrong code                     | The row nudges and lets you retry; the right code then works                                                                     |
| C01-E04 | Expired code                   | The message shows and Send a new code works                                                                                      |
| C01-E05 | Too many tries                 | The code locks and a new one is offered                                                                                          |
| C01-E06 | Phone sign in                  | The form alone                                                                                                                   |
| C01-E07 | The shell                      | Desktop: sidebar, top bar, the sheet; tablet: the rail; phone: the tabs and the round button                                     |
| C01-E08 | Theme                          | Dark survives a reload; System follows the emulated OS theme (desktop and tablet; the phone's theme lives in Settings, chunk 09) |
| C01-E09 | Sign out                       | Back to sign in; the back button does not reveal the app (desktop and tablet; phones sign out from Settings in chunk 09)         |
| C01-E10 | Return to where you were going | Visiting /week signed out, then signing in, lands on /week                                                                       |
| C01-E11 | Dark mode                      | E01 and E07 again in dark                                                                                                        |
| C01-S01 | Smoke on staging               | The sign-in page loads and the API answers /health (group `smoke`, after every staging deploy)                                   |
