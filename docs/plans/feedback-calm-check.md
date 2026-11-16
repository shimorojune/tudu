# A calm duplicate check in Send feedback (#114, #115)

Status: approved by Rohit 16 Nov 2026 ("also implement 114 and 115. They are approved as well"), after canvas draft 2:
boards "Draft · #114 #115 · A calm duplicate check" (K-FeedbackCheck, K-FeedbackCheck-Dark) on the Send feedback page
of the design canvas. Follows [feedback-similar-reports.md](feedback-similar-reports.md) (#76, PR #86).

## The reports

- **#114**: the "Already reported?" box flickers while typing: it shimmers, says "Checking…", dims and swaps rows on
  almost every pause.
- **#115**: a similar report's row shows only its title, which is often a cut-off first line ("I have two JIRA’s, but
  the count still shows 1. A new JIRA was…"), so you can't tell whether it is your problem.

## What was wrong

- `useSimilarIssues` (`apps/web/src/app/feedback.tsx`) asked 450ms after every pause, even when only a comma or the
  case changed, aborted the look before, and showed `loading` (two shimmer rows) on the first look and `stale` (dimmed
  rows) on every later one. A failed look showed a muted "Couldn’t check" line. So the box moved on every pause.
- The server's answer (`searchSimilarIssues`, `apps/server/src/feedback/issueMirror.ts`) carried only the title; the
  report's words were in the mirror (`body_text`) but never sent.

## The rule (Rohit's notes on draft 1)

- **Nothing shows while looking.** No shimmer, no "Checking…", no dimming. The box appears only when an answer has
  credible matches: closeness at or above `SIMILAR_FLOOR` (0.5, `packages/core/src/feedback.ts`, unchanged). A later
  answer with none folds it shut. A look that fails says nothing and leaves the box as it was.
- **Ask less.** 800ms after typing stops (was 450ms), and only when the words changed: case, punctuation and spacing
  are not new words. Answers are kept while the form is open, so going back to earlier words shows their answer at
  once without asking. A look that was asked finishes even if typing goes on; only the newest answer is shown.
- **The report's own words.** Each row shows the opening words of the report (up to 280 characters, cut at a word,
  without the "Similar to #N" lead), falling back to the title for an issue with no words. Clamped to 3 lines, with no
  expansion on hover or focus (Rohit: expanding on hover "doesn't feel nice").
- The +1 pick, the arrow, the badges and the pinned pick are unchanged.

## The change

- `packages/core/src/feedback.ts`: `SIMILAR_DEBOUNCE_MS = 800`; `similarKey(text)` (lowercase, letters and numbers
  only, single spaces); `SIMILAR_SUMMARY_MAX = 280`; `issueSummary(bodyText)`; `SimilarIssue.summary?: string`.
- `apps/server/src/feedback/issueMirror.ts`: the similar query selects `body_text` and answers
  `summary: issueSummary(bodyText)`. Additive field, no migration, old apps ignore it.
- `apps/web/src/app/feedback.tsx` `useSimilarIssues`: the key check, a per-open answer cache, a sequence number so only
  the newest answer shows, no abort, no `loading`/`error`/`stale`.
- `packages/ui/src/components/SimilarReports.tsx`: `SimilarReportsState` is `'hidden' | 'ready'`; the shimmer, the
  error line and `stale` are gone; rows show `summary || title`. `FeedbackDialog` drops the `stale` prop.
- `packages/ui/src/styles/app.css`: `.tp-sim-tt` clamps to 3 lines (`-webkit-line-clamp: 3`, `overflow-wrap:
anywhere`); the rows align to the top so the ring, the arrow and +1 sit on the first line; the skeleton, error and
  stale rules are removed (`less-motion.css` regenerated).
- Kit page (`apps/web/src/routes/kit/FeedbackStates.tsx`): the "checking" and "couldn’t check" pairs are removed; the
  "already reported?" pair shows a long summary.

## States

- Under three words, nothing found, a look on its way, a look that failed, the model down (503) or the 429 limit: the
  box is folded shut (or stays as it was). Sending is never blocked by the check.
- Offline: a look fails silently, as above.
- Email-only filing: no box, as before.

## Design system and canvas (no drift)

- Design system: SimilarReports loses the loading/error states and `stale`, rows show the summary with the 3-line
  clamp; README states "hidden | ready, nothing while looking".
- Canvas: K-FeedbackCheck boards titled Built, sticky grey; the old #76 boards for "checking" and "couldn’t check" are
  removed from the Send feedback page.

## Test scenarios

Tests run on PR CI (Rohit, 10 Nov 2026: no test runs on his Mac).

### New

| ID      | File                                                 | Scenario                                                                                                                                              |
| ------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U40 | `packages/core/src/feedback.test.ts`                 | `similarKey`: case, punctuation and spacing give the same key; a new word gives a new one; letters outside ASCII are kept.                            |
| C19-U41 | `packages/core/src/feedback.test.ts`                 | `issueSummary`: one line, no "Similar to #N" lead, empty stays empty, a long body is cut at a word with "…" under 280.                                |
| C19-A37 | `apps/server/src/feedback.test.ts` (inside C19-A22)  | `GET /similar` rows carry `summary`, the issue's own words.                                                                                           |
| C19-E25 | `packages/e2e/tests/feedback/feedback.spec.ts` (E18) | The row of a seeded issue reads its body's words.                                                                                                     |
| C19-E26 | `packages/e2e/tests/feedback/feedback.spec.ts`       | With the next answer held: the rows stay as they are, not dimmed, no shimmer; after it, the same words with new case and punctuation send no request. |

### Updated

| ID       | File                                                 | Change                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U26  | `packages/ui/src/components/SimilarReports.test.tsx` | Hidden is shut with no "Checking", no skeleton, no error line; ready lists the rows; a later empty answer folds it shut.                                                                                      |
| C19-U26b | `packages/ui/src/components/SimilarReports.test.tsx` | (was the shimmer hold) A row shows the summary, else the title; `.tp-sim-tt` clamps to 3 lines; no `tp-sim` hover or focus rule grows it.                                                                     |
| C19-U27  | `packages/ui/src/components/SimilarReports.test.tsx` | The pinned pick holds with `hidden` (was `error`).                                                                                                                                                            |
| C19-U32  | `apps/web/src/app/feedback.test.tsx`                 | None under three words; none 500ms after the last key, one by 800ms; a slow look leaves the box as is; punctuation only asks nothing; newest wins; earlier words come from the cache; a failure says nothing. |
| C19-U38  | `apps/web/src/app/feedback.test.tsx`                 | Waits sized for 800ms.                                                                                                                                                                                        |
| C19-E21  | `packages/e2e/tests/feedback/feedback.spec.ts`       | Search down: the box stays shut, no line, no shimmer; Send still files.                                                                                                                                       |
| C19-E09  | `packages/e2e/tests/feedback/feedback.spec.ts`       | The kit's "checking" and "couldn’t check" phases are gone from the list.                                                                                                                                      |

### Unchanged, must still pass

C19-U27..U31, U33 (+1 pick and send), C19-A22..A31, C19-E18..E20, E22..E24.

### Mac

No Mac-only code. Manual check MC-FC01 for Rohit after release: in the Mac app, type a report close to an existing
issue; the box appears once, with the report's words, and doesn't flicker while you keep typing.
