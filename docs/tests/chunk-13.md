# Chunk 13 · Close matches · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project core --project web --project server` and `pnpm e2e search` (the close-match
cases live in chunk 07's group, since they are the same panel). End-to-end tests fix the clock at Sunday
18 October 2026, 10:00, write their tasks straight through sync, and ask the test API to embed what is pending
(`POST /__test/embeddings/drain`) rather than wait for the batch after a sync. The real model runs in API and
end-to-end tests; the core tests use a fake embedder.

## Accuracy

The gate: recall at four of 0.85 or better and precision of 0.9 or better over the labelled searches in
`packages/core/test/fixtures/close-matches.json` (C13-A07 fails the run otherwise).

<!-- accuracy -->

Last measured 2026-10-22 15:03 UTC with `Xenova/all-MiniLM-L6-v2` (floor 0.3) over 50 labelled searches: recall at four **0.955**, precision **1**. Missed: `"changelog" missed notes: nothing`, `"new hire setup" missed onboard: Draft the Q4 hiring plan`.
<!-- /accuracy -->

## Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/server`)

| ID      | What it checks  | Scenario                                                                                                                                                                                                                         |
| ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-U01 | Close matches   | Ordered by closeness, the floor applied, excluded IDs dropped, at most four; the text embedded is the title plus the first 300 characters of the notes, trimmed and lowercased                                                   |
| C13-U02 | Quick Add merge | Shared-word look-alikes and meaning hits on one scale (a full word match 1, half 0.75; meaning its similarity), duplicates folded, open tasks only, at most three, nothing under four characters                                 |
| C13-U03 | The embedder    | The fake in tests; the real one answers 384 unit numbers and the same text gives the same vector; `EMBEDDINGS=off` means no model and an unavailable meaning search; a bad value fails the start                                 |
| C13-U04 | readableBy      | Your own, shared by others, owner gone; never another's Only me, never a space you are not in; the same rows from the word, meaning and look-alike reads                                                                         |
| C13-U05 | SearchHit       | A row from another space shows that space's tile and name before where it lives                                                                                                                                                  |
| C13-U06 | SearchPanel     | The `Close matches` heading under the word hits with "Looking for tasks like this…" while loading, rows without washed words and without a task the word hits list, the error line, nothing for a full ID, arrows walk into them |
| C13-U07 | SearchPanel     | No word match: Create first, close matches under it; Enter still creates                                                                                                                                                         |
| C13-U08 | QuickAdd        | Covered by C07-U07: the box after the pause with the hits the app answers, "N more", ×, Open (the app's answer now merges words and meaning, C13-A06)                                                                            |
| C13-U09 | web             | A hit from another space carries that space for its row, one from this space none; a pick in another space goes to its address                                                                                                   |
| C13-U10 | model folder    | A plain checkout keeps the model in its own .local/models                                                                                                                                                                        |
| C13-U11 | model folder    | A git worktree uses the main checkout's .local/models                                                                                                                                                                            |
| C13-U12 | model folder    | A worktree whose gitdir has no commondir file still finds the main checkout                                                                                                                                                      |
| C13-U13 | model folder    | No .git at all falls back to the folder itself                                                                                                                                                                                   |
| C13-U14 | model folder    | A .git file without a gitdir line falls back to the folder itself                                                                                                                                                                |

## API (`apps/server`)

| ID      | Scenario                                                                                                                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-A01 | `GET /api/search/meaning`: a paraphrase finds the task, the closest first, at most four, above the floor, `exclude` honoured, hits from two of your spaces each carry their space; no words gives nothing; no session is 401 |
| C13-A02 | By meaning: a second member's shared task is found, their Only me task never, a space you left never, another's Personal never, even when it is the nearest; an outsider gets nothing; a stranger to a space is 403          |
| C13-A03 | By word: the space's word search now lists a second member's shared task and never their Only me one; Quick Add look-alikes and Recently opened read the same way                                                            |
| C13-A04 | A created task has a vector after the batch settles; a rename or a notes change nulls and refills it; a crossed-off one still matches; a deleted one never                                                                   |
| C13-A05 | The backfill: rows with no vector get one, a few at a time, `embedded_text` records what was embedded; a write while the model is busy is not overwritten with the stale vector                                              |
| C13-A06 | `for=lookalike` returns the merged list: shared words, meaning, folded, at most three; with the model down the words alone and the meaning search is 503                                                                     |
| C13-A07 | Accuracy: the labelled searches against the fixture space with the shipped model; recall at four ≥ 0.85 and precision ≥ 0.9; the scores are written above                                                                    |
| C13-A08 | Migration 0010 applied: the `vector` extension, the two columns, the HNSW index                                                                                                                                              |

## End-to-end (`packages/e2e/tests/search`)

| ID      | Scenario                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C13-E01 | Type a word: word hits at once, then `Close matches` with a paraphrase, no washed words; the arrows and Enter pick it and the page turns to its day with the row glowing |
| C13-E02 | A close match from another space: the row names it; the pick switches to that space and the row glows                                                                    |
| C13-E03 | Two people in a space: the second's shared task appears by word and by meaning for the first, their Only me task never, the second's Personal task never                 |
| C13-E04 | No word match: Create first, the close match below; Enter opens Quick Add with the words                                                                                 |
| C13-E05 | A task ID typed in full comes first with no close matches; a Jira key typed in full (no task linked to it here) skips them too and offers Create                         |
| C13-E06 | The model down (test switch): the quiet line, the word matches still there; back up, the heading returns on the next words                                               |
| C13-E07 | Quick Add: a title that means an existing task shows "Looks like a task you have" with it; a shared-word match still shows; Open goes to the task and keeps the draft    |
| C13-E08 | A task renamed in a second browser context is found by its new meaning here                                                                                              |
| C13-E09 | Phone: the sheet shows the heading and its rows; a pick turns to the day (phone)                                                                                         |
| C13-E10 | Dark: E01 again in dark                                                                                                                                                  |

Not automated: the close matches' 200ms fade and Quick Add's 220ms open; judge them on staging.
