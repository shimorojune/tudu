# Chunk 01 · Sign in and the app shell

Status: approved 20 Oct 2026, built on branch `rewrite/01-signin-shell`.

Boards: 11 Sign in (desktop, tablet, phone, dark, code, states, motion), 00 Layout, 01 Today desktop/tablet/phone (shell only).

## Scope

- Server: Hono app, Drizzle schema v0 (users, sessions, verification codes, spaces, members), Better Auth with the email OTP plugin, Resend in staging and production, an in-memory outbox in dev and test with `GET /__test/outbox` behind `TEST_ROUTES=1`. Personal space is created on first sign-in.
- Client: `packages/client` with the API client, auth state, the query client, the outbox skeleton (no mutations yet) and the SSE subscriber with heartbeat and reconnect.
- Shell from the boards: Sidebar with views, this week and spaces (desktop, folds to the rail), icon rail (tablet), bottom tabs with the round New task button (phone), TopBar with search, New task and the avatar, AccountMenu with theme and Sign out. Buttons that belong to later chunks are present but inert.
- Sign in: email, then the six-digit code, with every state on the states board: not an email, sending, wrong code (the boxes nudge once), checking, you're in, code expired, too many tries. Desktop pairs the form with the picture of the day; tablet and phone show the form alone.
- Today as a placeholder: the empty sheet with "Nothing planned for today yet" and the day header, no task list yet.
- Routing: signed-out visits remember where you were going and return there after sign in.
- Infra: web and server Dockerfiles (arm64), staging deploy on merge, the Dokploy runner live, the throwaway test database per run.

Out of scope: tasks, Getting started, invites, spaces beyond Personal.

## Test plan

Unit:

| ID      | Component   | Case                                                                          |
| ------- | ----------- | ----------------------------------------------------------------------------- |
| C01-U01 | CodeField   | Typing advances box to box; backspace moves back; paste fills all six         |
| C01-U02 | CodeField   | Six digits submit by themselves; a wrong code nudges once and clears          |
| C01-U03 | SignIn      | Email step validates on submit, not while typing; "not an email" shows in red |
| C01-U04 | SignIn      | Each state renders: sending, checking, you're in, expired, too many tries     |
| C01-U05 | Sidebar     | Active item marks by colour, never by weight; folds to the rail and back      |
| C01-U06 | BottomTabs  | Active tab, the New task button, badge counts                                 |
| C01-U07 | AccountMenu | Theme switch changes theme; Sign out calls its handler                        |
| C01-U08 | client      | The SSE subscriber reconnects with backoff and resumes from the last event id |

API, against a throwaway database:

| ID      | Case                                                                                  |
| ------- | ------------------------------------------------------------------------------------- |
| C01-A01 | Request a code for a valid email: 200, the outbox holds one mail with six digits      |
| C01-A02 | Request a code for a bad address: 400 with a plain message                            |
| C01-A03 | Verify the right code: a session and the user; a personal space exists for a new user |
| C01-A04 | Verify a wrong code: 401, attempts counted, the code stays valid                      |
| C01-A05 | Five wrong codes: locked, "too many tries", a new code is required                    |
| C01-A06 | A code older than ten minutes: expired                                                |
| C01-A07 | A code can be used once                                                               |
| C01-A08 | More than five requests for one email in ten minutes are refused                      |
| C01-A09 | `GET /me` returns the user with a session and 401 without                             |
| C01-A10 | Sign out ends the session; the cookie no longer works                                 |
| C01-A11 | The events stream sends a heartbeat and closes cleanly on sign out                    |

End-to-end, group `auth` and `shell`:

| ID      | Case                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------- |
| C01-E01 | New person, desktop: email, code from the outbox, lands on the empty Today                         |
| C01-E02 | Returning person: "Welcome back", code, Today                                                      |
| C01-E03 | Wrong code nudges and lets you retry; the right code then works                                    |
| C01-E04 | Expired code shows the message and "Send a new code" works                                         |
| C01-E05 | Too many tries locks the code and offers a new one                                                 |
| C01-E06 | Sign in on the phone project: the form alone, the sheet above the keyboard                         |
| C01-E07 | Desktop shell: sidebar, top bar, the sheet; tablet: the rail; phone: the tabs and the round button |
| C01-E08 | Theme: pick Dark in the avatar menu, reload, still dark; System follows the emulated OS theme      |
| C01-E09 | Sign out returns to sign in; the back button does not reveal the app                               |
| C01-E10 | Visiting /week signed out, then signing in, lands on /week                                         |
| C01-E11 | Dark mode: C01-E01 and C01-E07 again with the dark theme                                           |

Not automated: the real Resend delivery (checked once by hand on staging), the picture of the day on the desktop sign in.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner.
- Staging at https://staging.tudu.egeng.info lets you sign in with a real code by email.
- The shell matches the boards at 1440, 834 and 390, light and dark.
