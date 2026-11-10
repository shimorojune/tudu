# Screenshot public by default, and "already reported?" while you type

Issues: #75 (public screenshot switch defaults on) and #76 (suggest similar existing issues, open and closed, with
"+1 that one instead").

Status: awaiting Rohit's approval. Canvas approved 6 Nov 2026 ("yes looks good let's go ahead"): boards
`K-FeedbackSimilar` and `K-FeedbackSimilar-Dark` on the Send feedback page, light and dark, plus sticky `fb-sim-q`.
Rohit's calls from 5 Nov: the switch defaults on now; matches cover every issue, closed ones included; the action is
"+1 that one instead".

Everything below applies only when GitHub filing is on (`filing: 'github'`). With email only the form doesn't change:
no similar box, and the switch isn't shown, as today.

## Part 1 · #75 The screenshot switch starts on

### What changes for the person

- A newly added PNG, JPEG, GIF or WebP screenshot comes in with **"Show it on the public issue" on**. The Public pill
  and accent ring are already showing when the slot folds open (280ms, as today).
- Switching it off applies **to that screenshot only**. Replacing or removing the screenshot and adding another one
  turns it back on. The choice isn't remembered across reports.
- The on line reads "Public. Anyone can see it on GitHub. **Check it shows nothing private.**" The last sentence is in
  `--warning` ink. The off line stays "Private. Only the Tudu team sees it, with your report."
- HEIC and other types GitHub can't show: no change. The switch is off and disabled, with "GitHub can’t show this kind
  of image. It stays with the team."
- The hint next to Add a screenshot changes from a lock and "Private unless you show it" to a globe and **"Shown on the
  issue unless you hide it"**.
- Popover: under Public on GitHub, "The screenshot, unless you hide it". Under Only the Tudu team, "The screenshot,
  when you hide it". The last line becomes "Never sent anywhere: your tasks, notes, people or space names, except what
  a public screenshot shows."

### The privacy trade-off

A screenshot of Today shows task titles, and some of those can be private, so with the switch on by default they go
public unless the sender looks. The guards in this change are only the visible pill and ring, the warning-ink
sentence, and the popover saying so plainly. The real fix is **#67**, which scrambles the text in a screenshot before
it goes out. Once #67 ships, the public copy is the scrambled one and the warning sentence can go. Until then a
mistake is taken down by hand, as `docs/release.md` › "Feedback screenshots" describes (the switch-off on the row
makes the link 404).

### How

1. `apps/web/src/app/feedback.tsx`: `onShot` sets `shotPublic: shotCanBePublic(file.type)` when a screenshot goes in,
   and false when it's removed. `EMPTY.shotPublic` stays false (there's no screenshot yet).
2. `packages/core` `feedbackReportSchema.shotPublic` **keeps its default false**. A report queued offline by an older
   client, which has no field, stays private, because that's what its sender saw.
3. `FeedbackDialog`: the new on copy (the warning span `tp-fb-check`), the hint (globe instead of lock, new words) and
   the popover lines. Its prop doc changes from "off for each new screenshot" to "on for each new screenshot".

## Part 2 · #76 Similar reports, and +1 that one instead

### What changes for the person

- **When it looks.** 450ms after typing stops, once the words have at least 3 words (and at least 12 characters).
  Each new look cancels the one before it (an `AbortController`).
- **Loading.** On the first look only, the box folds open (280ms grid-rows fold, like the screenshot slot) with "Checking
  for similar reports…" and two shimmer rows, for at least 380ms so a fast answer doesn't flash. On later looks the
  current rows stay and dim to 55% opacity, then the new ones crossfade in (160ms). The box never folds shut and opens
  again between looks.
- **Found.** "**Already reported?** +1 that one instead." and up to **3** rows, closest first, rising 40ms apart
  (240ms, 4px). Each row has a state icon (an open ring in success green for open issues, a muted tick for closed
  ones), `#n` and the title, and a meta line. The meta line has a **Fixed** badge (closed as completed) or **Closed**
  (closed as not planned), plus "closed 5 Nov" or "opened 27 Oct", and "· N +1s" once there are any. The row has an
  external-arrow link that opens the issue (in a new tab, or in the browser from the Mac app, like Open on GitHub) and a
  **+1** button. There are no similarity scores.
- **None.** When nothing is above the floor, nothing shows and the box folds shut (280ms), so the form looks exactly
  like today.
- **Can't check** (the model is off, the mirror has never synced, or the request failed): one muted line, "Couldn’t
  check for similar reports. Sending works as usual." There's no retry button: the next pause in typing tries again.
- **Picked.** **+1** picks the row. The row lifts onto `--card` with a 1.5px ink ring (180ms) and its +1 becomes a
  tick (`aria-pressed`). A bar rises above the footer saying "Adds your words to **#64** as a comment. No new issue." with
  **Undo**, and Send becomes **+1 on #64** with a check icon. Undo, or pressing the tick again, unpicks. Picking another
  row moves the pick there. If later typing makes the picked issue drop out of the results, it stays pinned as the
  first row until it's unpicked.
- **Sending.** The button spinner, "Adding…". **Sent** has the same shape as Filed: title "Thanks, it’s on #64", sub
  "Your words are on the issue as a comment. Follow it there.", the tick pop, "#64" with "+1 · <issue title>", your
  words, and the link to **your comment**. GitHub down gives today's pending state ("The GitHub issue follows in a few
  minutes"), and the sweep posts the comment later.
- **Refused for good at send** (the issue was locked or deleted after the mirror synced): today's error line, "That
  issue can’t take comments now. Send it as a new report instead.". The pick clears and the words stay.
- **Kind.** Switching Bug or Idea keeps the list: matches cover both kinds.
- **Your reports.** A +1 is a row like any other, with a small **+1** pill and the **issue's** title. It links to your
  comment. Its loading, empty and error states are today's.
- **Hidden:** under 3 words, with email-only filing, in Your reports and in the done states.
- **Reduced motion:** the folds, rises, crossfades and the tick pop become instant.
- **Phone sheet:** the same box and rows. The bar says "Adds your words to **#64**. No new issue."

### On GitHub

A +1 is a **comment** on the picked issue, built like an issue body. It starts with a line, **"+1 from the Tudu
app"**, then the words, the screenshot when it's shown, the app details when they're on, and the ref footer. The
public/private split is the same as for a new issue. Name and email never go on it.

- No 👍 reaction: every report goes out with one token, so a reaction could only ever count once.
- A **closed** issue gets the comment and **isn't reopened**. A "still happening after the fix" is then visible to the
  team in the issue and in the mail.
- **Locked** issues are left out of the matches.
- Pull requests are never matched.

### What goes where

| Piece          | New issue                  | +1 instead                             |
| -------------- | -------------------------- | -------------------------------------- |
| Where          | A new issue                | A comment on the picked issue          |
| Screenshot     | On the issue unless hidden | On the comment unless hidden           |
| App details    | When on                    | When on                                |
| Name and email | Team mail only             | Team mail only, subject "+1 on #64: …" |
| Closed issue   | n/a                        | Comment goes on, not reopened          |

### How: server (`apps/server`)

1. **Migration `0021_feedback-similar`** (back up the prod DB before releasing, as always):
   - A new table `github_issues`: `number int primary key`, `title text`, `body_text text` (the issue body up to the
     app's `---` footer, with the Screenshot block and markdown images stripped, capped at 4,000 characters), `state`
     (`open` | `closed`), `state_reason` (`completed` | `not_planned` | `reopened` | `duplicate` | null), `locked
boolean`, `url text`, `created_at`, `closed_at`, `updated_at` (GitHub's), `embedding vector(384)` nullable,
     `embedded_text text`, and an index on `updated_at`.
   - `feedback.plus_one_of int` nullable, the issue a report +1s.
2. **The mirror (`feedback/issueMirror.ts`).** `IssueTracker` gains `list(since?: Date)`, which calls `GET
/repos/:repo/issues?state=all&sort=updated&direction=asc&per_page=100&since=…`, follows the `Link` header, and drops
   items with `pull_request`. Rows are upserted by number. A changed title or body nulls the embedding. The sync runs
   on boot and every **10 minutes**, from the newest `updated_at` held. When the app files an issue, it upserts that
   row at once, so a duplicate sent a minute later is found. The existing fine-grained token already has Issues read
   and write, so no new secret is needed. Without `FEEDBACK_GITHUB_TOKEN` nothing syncs and the endpoint isn't mounted.
3. **Embedding.** The same `Embedder` as tasks (`all-MiniLM-L6-v2`, 384 dims). `Embeddings` gains a second pending
   source: `github_issues` rows with no vector, embedded from `embeddingText(title, body_text)` in the same batches. A
   failed batch logs and retries on the next tick, like tasks.
4. **`GET /api/feedback/similar?q=`** (session required). It trims `q` to 1,000 characters, and it needs 3 words, or it
   returns `{ issues: [] }`. It runs `cosineDistance` over `github_issues` where `embedding is not null and not locked`,
   ordered by distance, limit 3, above `SIMILAR_FLOOR`, and answers `{ issues: SimilarIssue[] }`, with `SimilarIssue =
{ number, title, url, state: 'open' | 'fixed' | 'closed', createdAt, closedAt, plusOnes }`. `plusOnes` counts
   `feedback` rows with that `plus_one_of`. It answers **503** "Close matches aren’t available right now." when the
   model is off (`MeaningUnavailable`), or when the mirror has never synced, so that a blank result isn't mistaken for
   "nothing similar". Per-user cap: 30 looks a minute (in memory). Past it, 429, which the client shows as "can't
   check".
5. **`SIMILAR_FLOOR`** starts at **0.5**, set in `@tudu/core` next to `MEANING_FLOOR` (0.3). Issue bodies are longer
   and noisier than task titles, so a looser floor would surface weak matches on almost every report. The number is
   tuned once, on Rohit's Mac, against the real issues: #64 vs "Jira count says 1 but two assigned" must match, and #64
   vs "drawing is dark in dark mode" must not. The cases are pinned in C19-A24.
6. **Sending a +1.** `feedbackReportSchema` gains `plusOneOf: z.number().int().positive().nullable().default(null)`.
   - At send, if `plusOneOf` isn't in the mirror or is locked, the server answers **409** with the "can’t take
     comments now" error, and no row is saved.
   - Otherwise the row gets `plus_one_of`, and `fileReport` calls the new `tracker.comment(number, body)` (`POST
/repos/:repo/issues/:n/comments`) instead of `file`. The body is `issueBody({ …, plusOne: true })`, which adds the
     "**+1 from the Tudu app**" first line. `issue_number` is the target issue and `issue_url` is the comment's
     `html_url`.
   - The hourly app cap (`ISSUES_PER_HOUR`, 30) counts comments too.
   - GitHub refusing for good **at send** (403 locked, 404, 410) answers 409 as above and deletes the row (and its
     screenshot), so the person can resend it as new.
   - **In the sweep** (the person has already left), a +1 that GitHub refuses for good is **filed as a new issue
     instead**, with "Similar to #64" as the body's first line. The report is never lost.
7. **Mail.** The subject is "+1 on #64: <gist>". The body gains "+1 on #64 <issue url>". The rest is unchanged.
8. **`GET /api/feedback/mine`**: each report gains `plusOneOf: number | null`. Its `title` is the mirror's title for a
   +1, or the report's own when the mirror doesn't have it.
9. **Test fake (`feedback/fake.ts`).** It gains `GET /repos/:o/:r/issues` (state=all, since, a `Link` header after 100
   items, a PR item to be filtered out, and a locked flag), `POST /repos/:o/:r/issues/:n/comments` (with the same
   `down`, `limited` and `final` modes, plus `locked` giving a 403), and `POST /seed`, which adds issues for tests.
   `FakeEmbedder` stays as it is: tests seed words whose fake vectors are close.

### How: client

10. **`packages/core`**: the `SimilarIssue` type, `SIMILAR_FLOOR`, `SIMILAR_LIMIT = 3`, `SIMILAR_MIN_WORDS = 3`, and
    `MyReport.plusOneOf`.
11. **`packages/ui` `SimilarReports`** (new, and it goes into the design system): props `state: 'hidden' | 'loading' |
'ready' | 'error'`, `issues`, `picked`, `onPick(number | null)` and `onOpen(url)`. It holds the fold, the shimmer
    (380ms minimum), the stale dim and crossfade, the rows, the pinned pick, the tick and `aria-pressed`. The heading
    is a `role="status"` live region, so screen readers hear "Already reported?" once per result set and not on every
    keystroke.
12. **`FeedbackDialog`**: renders `SimilarReports` between the words and the screenshot slot, and the "instead" bar
    above the footer. Send's label and icon follow `picked`, and its `loadingLabel` is "Adding…". The done state
    swaps its copy for a +1. `FeedbackReports` gets the +1 pill.
13. **`apps/web/src/app/feedback.tsx`**: a `useSimilarIssues(text, on)` hook (debounce, abort, minimum words,
    first-look shimmer, stale-while-loading). The draft gains `plusOneOf` and the picked `SimilarIssue`, so the pinned
    row survives a reload. The report JSON and the offline queue carry `plusOneOf`. A 409 clears the pick and shows the
    error line.
14. **Kit (`routes/kit/FeedbackStates.tsx`)**: phases for loading, found, can't check, picked, +1 sent, +1 pending, the
    +1 row in Your reports, and the switch on by default. Each in light and dark, desktop and phone sheet.

### Design parity (before the PR is ready)

- Canvas: the older boards that still say the switch is off by default get the #75 changes. That covers
  `K-FeedbackShot` and `-Dark` (the "off every time" notes and steps, the hint, the popover and the table) and
  `K-FeedbackIssue` and `-Dark` (the hint, the popover and the privacy table). Then the `K-FeedbackSimilar` boards and
  the sticky are marked approved.
- Design system: a new `SimilarReports` component (README, `index.d.ts`, bundle js/css). `FeedbackReports` gets the
  +1 row, and the DS's Send feedback notes get the default-on switch, the new hint and the new popover lines.

## Test scenarios

New IDs continue chunk 19's (last used: C19-U22, C19-A19, C19-E17). "(update)" marks a change to an existing test.
All tests run on Rohit's Mac.

Unit, core (`packages/core/src/feedback.test.ts`):

| ID               | Scenario                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U23 (new)    | `feedbackReportSchema`: `plusOneOf` defaults to null; 0, negatives, decimals and strings are refused; `shotPublic` still defaults to false                            |
| C19-U24 (new)    | `issueBody({ plusOne: true })` starts with "**+1 from the Tudu app**" and otherwise equals the issue body (words, shown screenshot, details, ref)                     |
| C19-U25 (new)    | `issueBodyText` (for the mirror) cuts at the app's `---` footer and strips the Screenshot block and image links; a hand-written issue keeps its text, capped at 4,000 |
| C19-U08 (update) | Neither body ever holds the name, email, user id or file name, with or without `plusOne`                                                                              |

Server (`apps/server/src/feedback.test.ts` and a new `issueMirror.test.ts`, with the fake tracker and the fake embedder):

| ID               | Scenario                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-A20 (new)    | Sync: 130 seeded issues across two pages land in `github_issues`; the PR item is dropped; a second sync asks with `since` and only upserts the changed one; a changed title nulls the embedding                                              |
| C19-A21 (new)    | Filing a new issue upserts its mirror row at once; the next drain embeds it                                                                                                                                                                  |
| C19-A22 (new)    | `GET /similar`: closest first, at most 3, open and closed both, locked left out, below-floor left out; `state` is `fixed` for completed and `closed` for not planned; `plusOnes` counts rows                                                 |
| C19-A23 (new)    | `GET /similar`: fewer than 3 words gives `[]`; no session gives 401; model down or never synced gives 503; the 31st look in a minute gives 429                                                                                               |
| C19-A24 (new)    | Floor calibration with the real model (skipped when the model isn't on disk): #64's text matches "Jira count says 1 but two assigned" and doesn't match "drawing is dark in dark mode"                                                       |
| C19-A25 (new)    | +1 send: the fake gets a comment on #n (not a new issue) whose body starts "+1 from the Tudu app" and embeds the shown screenshot link; the row has `plus_one_of`, and its `issue_url` is the comment url; the mail subject is "+1 on #n: …" |
| C19-A26 (new)    | +1 to an issue not in the mirror, or locked there: 409, no row, no mail, no comment                                                                                                                                                          |
| C19-A27 (new)    | +1 while GitHub is down: pending; the sweep posts the comment later; the same report sent twice gives one comment                                                                                                                            |
| C19-A28 (new)    | +1 refused for good at send (locked 403, 404): 409 and the row and screenshot are gone; refused for good in the sweep: filed as a new issue starting "Similar to #n"                                                                         |
| C19-A29 (new)    | `/mine` lists a +1 with `plusOneOf` and the issue's title                                                                                                                                                                                    |
| C19-A30 (new)    | Migration 0021 creates `github_issues` and `feedback.plus_one_of`; existing rows read `plus_one_of` null                                                                                                                                     |
| C19-A31 (new)    | Without `FEEDBACK_GITHUB_TOKEN`, `/similar` isn't mounted (404) and nothing syncs                                                                                                                                                            |
| C19-A11 (update) | A comment body never holds the name, email, user id, space name, storage key or file name                                                                                                                                                    |

Unit, UI (`packages/ui/src/components/SimilarReports.test.tsx`, `FeedbackDialog.test.tsx`, `FeedbackReports.test.tsx`):

| ID               | Scenario                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U26 (new)    | `SimilarReports`: hidden renders the fold shut; loading shows two skeleton rows; error shows the one muted line; ready lists rows with the Fixed and Closed badges and the +1 count |
| C19-U27 (new)    | +1 calls `onPick(n)`; the picked row has `aria-pressed="true"` and the tick; pressing it again calls `onPick(null)`; a picked issue missing from `issues` is pinned first           |
| C19-U28 (new)    | The arrow calls `onOpen(url)`; the rows and buttons have the aria labels from the canvas ("+1 #64 instead of a new issue")                                                          |
| C19-U29 (new)    | `FeedbackDialog` with a pick: the bar shows "#64", Send reads "+1 on #64", Undo clears it; the done state reads "Thanks, it’s on #64"                                               |
| C19-U30 (new)    | Email-only filing: no similar box, whatever the props                                                                                                                               |
| C19-U31 (new)    | `FeedbackReports`: a +1 row has the pill and the issue's number                                                                                                                     |
| C19-U19 (update) | Screenshot in: the switch is **on** with the "Public." line and the warning sentence; off, the "Private." line                                                                      |
| C19-U21 (update) | The hint reads "Shown on the issue unless you hide it" (globe); the popover lines are flipped                                                                                       |

Unit, web (`apps/web/src/app/feedback.test.tsx`):

| ID               | Scenario                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U32 (new)    | `useSimilarIssues` (fake timers): no request under 3 words; one request 450ms after the last key; a newer keystroke aborts the older request; stale rows stay during a later look |
| C19-U33 (new)    | The report JSON carries `plusOneOf`; a queued offline +1 keeps it through a reload; a 409 clears the pick and keeps the words                                                     |
| C19-U22 (update) | Adding a PNG sets `shotPublic` true, adding a HEIC false; removing it and adding another sets it true again; switching off sticks for that screenshot                             |

End to end (`packages/e2e/tests/feedback/feedback.spec.ts`; the desktop, phone and dark projects; the fake tracker with seeded issues):

| ID               | Scenario                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-E18 (new)    | Type words close to a seeded closed issue: the box shows it with Fixed; +1 it and Send ("+1 on #n"): the fake has a comment and no new issue; Your reports shows the +1 row |
| C19-E19 (new)    | Pick, then Undo, then Send: a new issue is filed as today                                                                                                                   |
| C19-E20 (new)    | Words unlike any seeded issue: no box appears; the form is today's                                                                                                          |
| C19-E21 (new)    | Similar search down (test switch): the muted "Couldn’t check" line; Send still files                                                                                        |
| C19-E22 (new)    | Attach a PNG: the switch is on and the pill shows before Send; send: the issue embeds the image                                                                             |
| C19-E16 (update) | Attach, switch **off**, send: no image link on the issue; the mail has the attachment                                                                                       |
| C19-E17 (update) | Switch off, remove the screenshot, add another: the switch is **on** again                                                                                                  |
| C19-E09 (update) | The kit's new phases in light and dark; nothing overflows at phone width                                                                                                    |

Manual, on staging after the deploy:

- Type a duplicate of a real issue and check it's offered.
- +1 it and check the comment on github.com shows the screenshot.
- Check that the mirror's first sync over the real repository finishes inside a minute.

## Open points

- **The floor** will be tuned once against the real issues (C19-A24). If 0.5 misses obvious duplicates, it moves
  down, with the cases recorded in the test.
- **The scale cap.** The mirror holds every issue, and at roughly 100 now that's trivial. Past about 5,000 a vector
  index (`ivfflat`) would be added. That's not needed now.
- **Reopening closed issues on a +1:** deliberately not done. The team decides from the comment.
- **No similar box when GitHub filing is off.** There's nothing to match against without the mirror.
