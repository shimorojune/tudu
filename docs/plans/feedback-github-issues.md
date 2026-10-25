# Report from the top bar, follow it on GitHub

Status: proposal, awaiting Rohit's approval. Canvas: approved 25 Oct 2026 (boards `K-FeedbackIssue` and
`K-FeedbackIssue-Dark` on the Send feedback page, v80), light and dark. Token: a fine-grained token on Rohit's
account for now (Rohit, 25 Oct); a bot account can replace it later without code changes.

## What Rohit asked for

"The add feedback module is currently hidden away. Would be nice if we had a button in the header (like a bug icon)
that they could use to quickly invoke the same module. Also when they file a bug or feature, I want it to create a
github issue on the repo, and that Issue ID with URL should be shared back to them so they can track their request.
Do inform them before they submit in a subtle way so they aren't surprised."

## What changes for the person

- **A bug button in the header** opens the same Send feedback form. Desktop and Mac app: first in the top bar, left
  of Search. Tablet: same place in the compact bar. Phone: in the header, left of the Inbox. Tooltip and accessible
  name "Report a bug or idea". One wiggle on hover (360ms, none with reduced motion); pressed wash while the form is
  open. Avatar › Send feedback, More › Send feedback and the menu bar's ⋯ › Send feedback… all stay.
- **The form says it is public, quietly.** The sub line becomes "It’s filed as a public issue on GitHub, so you can
  follow it." The footer's left side gets "Public on GitHub" (globe icon, dotted underline); clicking it opens a small
  popover: public = what you write, bug or idea, app details when on; team only = your name and email, the
  screenshot; never sent = tasks, notes, people, space names. The screenshot hint says "Only the Tudu team sees it",
  the details line says "Shown on the issue", the placeholder adds "Leave out anything private." No checkbox.
- **Filing:** Send reads "Filing…" and the form dims a touch. Then the body crossfades to **Filed**: a tick draws,
  `#142` rises in with the kind, the first line of the text, and a copy row with the issue URL (Copy turns into a
  tick for 700ms). Footer: Your reports, Open on GitHub, Done. Done (or Esc, or the veil) closes it and a toast keeps
  "Filed as #142 on GitHub" with Copy link for 4.5s.
- **GitHub down, slow or rate limited:** the report is saved and mailed as today, and the form shows **Sent**: "The
  GitHub issue follows in a few minutes." The server files it later; the number then shows in Your reports.
- **A refusal a retry won't fix** (11th report this hour, too long, not an image): a warning line rises in above the
  footer and the words stay. Today that was a toast.
- **Offline:** as today it waits on the device and sends itself. New: when it lands with a number, a toast says
  "Filed as #143 on GitHub" with Copy link.
- **Your reports:** a view inside the form ("Your reports · N ›" under the details switch; Your reports in the Filed
  footer). Newest first, your last 20: kind icon, `#142`, the title, "Today · Something’s wrong". Filed rows open the
  issue. A row waiting for GitHub shimmers where the number goes. Reports from before this change say "Sent by
  email". Loading (skeleton rows), empty ("Nothing sent yet") and error ("Couldn’t load your reports", Try again)
  states. Back returns to where you came from.
- Signed out: no bug button (sending needs an account), as today.

## What goes where (the repo is public)

| Piece                                            | GitHub issue (public)                                               | Team only (row + mail)         |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------ |
| What you write                                   | Body; first line (≤70 chars, cut at a word with …) is the title     | Yes                            |
| Bug or idea                                      | Labels `bug` or `enhancement`, plus `from-app`                      | Yes                            |
| App details (switch on)                          | Version, track, system, browser, page, kind of space, window, theme | Yes                            |
| Name, email                                      | Never                                                               | Yes (mail From line, Reply-To) |
| Screenshot                                       | Never                                                               | Yes (mail attachment, storage) |
| User id, space names, tasks, notes, page address | Never                                                               | Never (already true today)     |

The issue body is built only from the report's `kind`, `text` and the strict `details` schema, never from the
session, so nothing else can leak in. `@name` mentions in the text get a zero-width joiner after the `@`, so a report
can't ping people on GitHub. The body ends with "Filed from the Tudu app" and the report's short reference (the
first 8 characters of the feedback row id), so the team can find the private row and mail for a public issue.

## How

### Server (`apps/server`)

1. **Env** (`env.ts`): `FEEDBACK_GITHUB_TOKEN` (optional), `FEEDBACK_GITHUB_REPO` (default `shimorojune/tudu`),
   `FEEDBACK_GITHUB_API` (default `https://api.github.com`; tests point it at the fake). No token: no issues, the
   form behaves as today (email only, "Thanks. That’s with the Tudu team now."), and the client is told so (below).
2. **Migration `0013_feedback-issues.sql`**: on `feedback`, add `issue_number int`, `issue_url text`,
   `issue_state text` (`'none' | 'pending' | 'filed' | 'failed'`, default `'none'`), `issue_attempts int default 0`,
   `issue_claimed_at timestamptz`. Rows from before stay `'none'` ("Sent by email").
3. **`feedback/github.ts`** (new): `IssueTracker` with `file(report): Promise<{ number, url }>`;
   `GithubIssues` posts `POST /repos/{repo}/issues` with `title`, `body`, `labels`, an 8s timeout and
   `Accept: application/vnd.github+json`. Errors are typed: `retryable` (network, timeout, 5xx, 403 with
   `x-ratelimit-remaining: 0`, 429) vs `final` (401, 404, 422). `issueTitle()` and `issueBody()` are pure and live in
   `@tudu/core` so the tests pin exactly what goes public.
4. **`POST /api/feedback`**: unchanged checks, idempotency and mail. After the row is inserted (only by the request
   that inserted it, so a double click or retry never files twice), if a tracker is configured: claim the row
   (`issue_state = 'pending', issue_claimed_at = now()`), try to file inline, and on success store number and URL
   (`'filed'`). On a retryable error, or when the **app-wide cap** of 30 issues per hour is reached, leave it
   `'pending'` for the sweep. The mail still goes in every case. The answer grows from `{ id }` to
   `{ id, issue: { number, url } | null, pending: boolean }`. A repeat of the same report answers with the stored issue.
5. **The sweep** (in `bootstrap.ts`'s existing interval, 5 min): rows `'pending'` whose claim is over 2 minutes old,
   oldest first, at most 10 a run, under the hourly cap. It re-claims each row with a conditional update before
   filing, so a request and the sweep never both file it. After 12 attempts (about an hour), or on a final error,
   the row becomes `'failed'` and the server logs it; the mail already has it. Final errors (bad token, repo gone)
   are logged loudly, since they need Rohit.
6. **`GET /api/feedback/mine`** (new): `{ filing: 'github' | 'email', reports: [{ id, kind, title, createdAt,
issue: { number, url } | null, state }] }`, the caller's last 20. `title` is the first line, cut like the issue
   title. `filing` tells the form which notice to show.
7. **Spam and abuse:** signed-in only (as now); 10 reports per person per hour (as now); the new 30 issues per hour
   cap for the whole app (reports past it are saved and mailed, and filed later); text must be at least 3
   non-space characters (as now, "Say what happened first."). Nothing is ever filed from a signed-out request.
8. **Test fake** (`feedback/fake.ts`, mounted at `/__test/github-issues` with `TEST_ROUTES=1`): records issues,
   answers numbers from 1, and can be told `down` (503), `limited` (403 + rate-limit headers) or `slow` (sleeps past
   the timeout). `/__test/github-issues/list` returns what was filed, for the E2E assertions.

### Client

9. **`packages/ui`:**
   - `icons.tsx`: add `bug` (lucide `Bug`) and `globe` (lucide `Globe`).
   - `TopBar`: new `onFeedback?: () => void` and `feedbackOpen?: boolean`; renders the bug `IconButton` first
     when given. CSS for the wiggle and reduced motion in `components.css`.
   - `FeedbackDialog`: new props `filing: 'github' | 'email'`, `phase` gains `'filed' | 'pending'`, `issue`,
     `error`, `onReports`, `reportsCount`. The footer notice and its popover (Radix Popover, as the other pops),
     the Filed and Sent bodies, the error line. With `filing: 'email'` it keeps today's copy and has no notice.
   - `FeedbackReports` (new): the list with loading, empty and error states, used inside the dialog.
   - `IssueLink` (new, small): the URL row with Copy, using `copyText` from `lib/clipboard.ts`.
10. **`apps/web`:** `AppShell` passes `onFeedback={openFeedback}` to `TopBar` and adds the bug to the phone header.
    `feedback.tsx`: `postReport` returns the issue; `FeedbackQueue.submit` returns `{ how, issue, pending }`;
    `flush()` reports each landed issue so `FeedbackHost` can toast "Filed as #143 on GitHub"; the host fetches
    `/api/feedback/mine` once when the form first opens (and again after a send), and holds the dialog's view
    (`form | filed | pending | reports`).
11. **Infra:** `infra/staging/compose.yaml` and `infra/production/compose.yaml` pass `FEEDBACK_GITHUB_TOKEN` and
    `FEEDBACK_GITHUB_REPO` through. `docs/release.md` gets a line on creating the token.

### What Rohit does by hand (once)

- Create a fine-grained token on github.com › Settings › Developer settings: repository access **only
  shimorojune/tudu**, permission **Issues: Read and write** (Metadata read comes with it), expiry 1 year (calendar
  the renewal; on expiry the server logs a final error and reports keep going by email).
- Set `FEEDBACK_GITHUB_TOKEN` in Dokploy staging and production. Staging can point `FEEDBACK_GITHUB_REPO` at a
  private scratch repo if you don't want test reports on the real one (recommended).
- Create the `from-app` label on the repo (`bug` and `enhancement` exist by default). I'll check whether GitHub
  makes a missing label on its own with this token and drop this step if it does.

### Design parity (after implementation, before the PR is ready)

- Every desktop, tablet and phone header on the canvas gets the bug button (Today, Week, Backlog, Search, Inbox,
  Jira, Task detail, Quick Add, All spaces, Spaces, Settings, the clickable K-Proto), light and dark.
- `K-Feedback` is folded into the new boards: its "where reports land is open" line goes, the sub line and the
  states match the app.
- The Tudu Paper design system gets the `bug` and `globe` icons, `TopBar`'s feedback button, the dialog's new
  phases, `FeedbackReports` and `IssueLink`, and the canvas's copy of the bundle is refreshed.

## Test scenarios

New IDs continue chunk 19's. "(update)" changes an existing test.

Unit, core (`packages/core/src/feedback.test.ts`):

| ID            | Scenario                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U07 (new) | `issueTitle`: first line, trimmed, cut at a word with … past 70 chars; a text that is one long word is cut hard                           |
| C19-U08 (new) | `issueBody`: the words, then the details lines, then "Filed from the Tudu app · ref"; details off says so; no name, email, id, screenshot |
| C19-U09 (new) | `@mentions` get a zero-width joiner; `#12` and links pass through untouched; the labels are `bug`/`enhancement` plus `from-app`           |

Server (`apps/server/src/feedback.test.ts`, against the fake tracker):

| ID               | Scenario                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C19-A01 (update) | Saves the row and image, mails as today, files one issue with title, body and labels, answers `{ id, issue: { number, url } }` |
| C19-A02 (update) | The same report twice, including two at once: one row, one mail, one issue; the second answer carries the same issue           |
| C19-A05 (new)    | GitHub 503, timeout or 403 rate limit: 200 with `issue: null, pending: true`; the row is `pending`; the mail still went        |
| C19-A06 (new)    | The sweep files pending rows once each, skips fresh claims, stops at the hourly cap, and marks `failed` after 12 attempts      |
| C19-A07 (new)    | A final error (401, 404): `failed` at once, no retry, logged; the reporter still gets 200 and the mail goes                    |
| C19-A08 (new)    | The 31st issue in an hour across all users is left `pending`; the 11th report from one person is still 429                     |
| C19-A09 (new)    | No token: no issue, `issue: null, pending: false`, state stays `none`; `/mine` says `filing: 'email'`                          |
| C19-A10 (new)    | `GET /api/feedback/mine`: only my reports, newest first, 20 at most, with issue and state; signed out is 401                   |
| C19-A11 (new)    | The issue body never holds the user's name, email, id, a space name or the screenshot key (asserted on what the fake received) |
| C19-A04 (update) | Migration 0013 adds the issue columns with their defaults; old rows read as `none`                                             |

Unit, UI (`packages/ui`):

| ID               | Where                | Scenario                                                                                                                              |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U01 (update) | FeedbackDialog.test  | Kinds, Send off with no words, "Filing…" (github) or "Sending…" (email); the public sub line only with `github`                       |
| C19-U10 (new)    | FeedbackDialog.test  | "Public on GitHub" opens the what's-shared popover; Esc and a click outside close it and keep the draft                               |
| C19-U11 (new)    | FeedbackDialog.test  | Filed: `#142`, the gist, the URL; Copy writes the URL and shows the tick; Open on GitHub has the URL; Done closes                     |
| C19-U12 (new)    | FeedbackDialog.test  | Pending shows "The GitHub issue follows"; an error line shows the reason with the words kept and Send back                            |
| C19-U13 (new)    | FeedbackReports.test | Loading skeleton, empty, error with Try again calling back, the list: filed rows link out, pending shimmers, old rows "Sent by email" |
| C19-U14 (new)    | TopBar.test          | With `onFeedback`, the bug button comes first, named "Report a bug or idea", pressed while `feedbackOpen`; without, none              |

Unit, web (`apps/web/src/app/feedback.test.tsx`):

| ID               | Scenario                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| C19-U05 (update) | The queue returns the issue from the answer; a queued report that lands later reports its issue once      |
| C19-U06 (update) | Send with GitHub on shows Filed (no auto-close); Done clears the draft and toasts "Filed as #… on GitHub" |
| C19-U15 (new)    | Pending answer shows Sent with the issue to follow; email-only answer keeps today's thanks toast          |
| C19-U16 (new)    | Your reports is fetched once on first open and after each send; Back returns to the view it came from     |

End to end (`packages/e2e/tests/feedback/feedback.spec.ts`, desktop, phone and dark projects; the API points at the
fake tracker):

| ID               | Scenario                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C19-E01 (update) | The header's bug button opens the form (avatar › Send feedback still does); send; Filed shows `#n` and the URL; the fake has one issue with the words and details and no email; the mail still arrives |
| C19-E05 (update) | Offline: saved toast; back online, one mail, one issue, and a "Filed as #n on GitHub" toast                                                                                                            |
| C19-E07 (update) | Phone: the header's bug opens the sheet; Filed sheet; More › Send feedback still opens it                                                                                                              |
| C19-E10 (new)    | Double-click Send: one issue, one mail                                                                                                                                                                 |
| C19-E11 (new)    | Fake down: Sent with the issue to follow; Your reports shows the waiting row; fake back, the sweep (triggered by a test route) files it and the row gets its number                                    |
| C19-E12 (new)    | "Public on GitHub" popover lists public and private pieces; the screenshot hint says only the team sees it                                                                                             |
| C19-E13 (new)    | Your reports: empty for a new person, then the filed report linking to its issue                                                                                                                       |
| C19-E14 (new)    | Copy in Filed puts the issue URL on the clipboard (desktop project, clipboard permission granted)                                                                                                      |
| C19-E09 (update) | The kit: the new phases (filed, pending, error, reports loading/empty/error) light and dark; nothing overflows at phone width                                                                          |

Existing tests that change only because the answer grew (`{ id }` → `{ id, issue, pending }`) or the copy changed:
C19-A03, C19-E02 to C19-E04, C19-E06, C19-E08. Their behaviour checks stay the same.

## Open points

- Issue author: Rohit's account for now; switching to a bot account later is only a new token.
- No open/closed status in Your reports for now. Showing it would need a GitHub read per row, cached. It could come
  later.
