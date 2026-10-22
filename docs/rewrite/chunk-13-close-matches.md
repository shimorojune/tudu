# Chunk 13 · Close matches

Status: approved 22 Oct 2026 as revised; built on branch `rewrite/13-close-matches`. Tests in
[docs/tests/chunk-13.md](../tests/chunk-13.md); deviations in [design-deviations.md](design-deviations.md).

Boards: 07 Search (S-States "Close matches on their way", "Close matches unavailable", "No word matches", "A Jira
key or task ID"; S-Motion "Close matches" and "Looks like a task you have"), 03 Quick Add. The round 2 sticky:
"Close matches by meaning (the vector search we'll add) come under their own heading a moment after you stop typing.
Word matches never wait for them." The parts are the design system's SearchPanel (the `Close matches` heading, its
loading and error lines) and QuickAdd's close-match box; both already exist in the vendored bundle and stylesheet.
Chunk 07 shipped word search and left this heading out; chunk 07's choice 4 made "Looks like a task you have" by
shared words "for now". This chunk adds the meaning.

## Scope

- **Close matches in Search.** 260ms after you stop typing, the panel asks for tasks that mean what you typed. They
  arrive under their own heading, `Close matches`, below the word matches: at most four, the closest first, never a
  task already listed above. While they come, a small spinner and "Looking for tasks like this…" sit under the
  heading; the word matches are already there and never wait. A row reads as every search row does (ring or tick,
  the title, where it lives, the project, the ID), with no words washed in ink, since nothing was matched by word.
  With no word match at all, Create “…” comes first as it does today and the close matches show under it, in case
  you already have the task. A task ID or Jira key typed in full comes first and skips close matches. Offline or
  with the matching down, one quiet line reads "Close matches aren’t available right now. Word matches still work."
  Up, down and Enter walk into the close matches as they walk the word hits; a pick turns the page to the row.
- **Across your spaces.** Close matches come from every space you are in, not just the one you are looking at
  (your decision of 22 Oct; the canvas said per space). A row from another space carries that space's tile and name
  in its byline before where it lives ("Northwind · Backlog"), and a pick switches to that space and turns to the
  row. Word matches stay in the space you are in, as chunk 07 shipped them, since the box is in that space's top
  bar; say so if you want both across.
- **Who may see what.** A search, by word or by meaning, only ever returns tasks you may read: your own tasks in
  any space you are in; other people's tasks in a team space you are in when they are shared with the space
  (visibility `space`); a task whose owner has left the space, which belongs to everyone there. Never another
  person's `Only me` task, never anything in a space you are not in, so never anyone's Personal. The same rule
  widens word search, which today lists only your own tasks in a team space: it now lists shared tasks of others
  too, since People already shows them. One predicate in the server, used by both reads and tested on its own.
- **Quick Add: Looks like a task you have, by meaning.** The same check runs 380ms after you pause in the title
  (four characters or more): tasks you may read that mean the same as what you are writing, in the space Quick Add
  will add to, merged with chunk 07's shared-word look-alikes, the closest first, at most three. The box, "N more",
  × and "Open" keep chunk 07's behaviour. It never blocks adding.
- **What a task means.** Every task carries a small vector made from its title and the first 300 characters of its
  notes (plain text). It is made on the server right after a task is created, renamed or its notes change, and a
  task that was never embedded (older rows, a restore) gets one from a background pass that works through the
  table a few rows at a time. Crossed-off tasks still match (the row shows its tick); deleted tasks never. The
  vector is a property of the task row, so the visibility rule applies to it exactly as to the row.
- **How good it is, measured.** A labelled set of fifty searches against a fixture space (a paraphrase, a synonym,
  a related errand, a decoy that must not match: "teeth checkup" for "Dentist appointment", "file taxes" for
  "Send the accountant last year's receipts", "walk the dog" must not find "Renew passport") lives in
  `packages/core/test/fixtures/close-matches.json`. An API test embeds them with the shipped model and scores recall
  at four (the expected task is in the four) and precision (no decoy in the four). The scores are written to
  `docs/tests/chunk-13.md` by `pnpm test:status` and the gate is recall ≥ 0.85 and precision ≥ 0.9; below that the
  PR does not open and choice 1's alternative is built instead.
- **Reading.** `GET /api/search/meaning?q=&exclude=` (across your spaces) returns up to four hits above a closeness
  threshold, skipping the `exclude` IDs (the word hits the panel already has); each hit carries its space.
  `GET /api/spaces/:id/search?for=lookalike` returns the merged list for Quick Add. The hit shape is chunk 07's plus
  `spaceId`.
- **Everywhere else.** Nothing else changes. Jira keys, the Inbox and the phone's search sheet behave as before;
  the sheet shows the heading the same way.

Out of scope: matching on comments or subtasks (not drawn, and the vector would drift as comments pile up); a
"did you mean" on Today's writing line (not drawn); languages other than English beyond what the model gives
(choice 1 names the model); the hosted model itself, unless the gate fails (choice 1).

## Choices

1. **The model runs inside the API, no key and nothing leaves the host, with the hosted path ready behind it.**
   `all-MiniLM-L6-v2` through Transformers.js (ONNX on the CPU, the quantised weights are 23MB, 384 numbers per
   task), downloaded once at image build and bundled, so staging and production start offline. A short title embeds
   in about 10ms on the Dokploy host; a search embeds the words once per request. The API container grows by about
   150MB of memory while the model is loaded. The embedder is one interface with a setting, `EMBEDDINGS=local`
   (the default); the hosted adapter (`EMBEDDINGS=voyage` or `openai`, with `EMBEDDINGS_API_KEY` and a column width
   that follows the model) is built only if the accuracy gate fails, and then the gate is run again against it
   before the PR opens. The alternative starts hosted: better matches on day one, a key to keep, every title sent to
   a third party, a search that fails when they do.
2. **The vector lives on the task row.** Migration 0010 turns on pgvector (`create extension if not exists
vector`), adds `tasks.embedding vector(384)` and `tasks.embedded_text` (the exact text the vector was made from,
   so a write that changes the title or notes nulls the vector in the same update and the pass refills it), and an
   HNSW index for cosine distance. The alternative is a separate `task_embeddings` table, which keeps the task row
   lean but costs a join on every search and a second row to keep in step. A model with another width (choice 1's
   fallback) is a new migration that re-types the column and nulls it for the backfill.
3. **One visibility predicate, in the server, for every search.** `readableBy(userId)`: the task's space is one
   you are a member of, and (the task is yours, or its owner is gone, or it is shared with the space). Meaning search
   filters by it inside the vector query (a `where` before the nearest-neighbour order, so the four nearest are the
   four nearest you may read, not four you may read among the nearest forty). Word search and Quick Add use the
   same function. The alternative filters after the vector query, which can return fewer than four when the
   nearest rows are someone else's.
4. **Embedding is done in-process, after the response.** When a sync batch lands, the API answers first and then
   embeds the changed tasks in order; a 60s tick picks up anything missed and the backfill. No queue, no worker
   container, as the attachment sweep already works. The alternative is a job table drained by a loop, which
   survives a restart mid-batch at the cost of a table and a second code path; the tick's backfill already covers
   that case because a task with no vector is simply embedded later.
5. **Closeness has a floor.** A close match needs a cosine similarity of 0.45 or more (tuned during the build
   against the labelled set), so an unrelated task never appears under the heading just because it is the nearest
   of a few. The alternative shows the top four whatever their distance, which reads as noise in a small space.
6. **Quick Add merges words and meaning.** Shared words stay in the list (a task you wrote with the same words
   always shows, even when the model finds them far), meaning adds what words miss ("Renew my passport" finds "Passport
   expires in March"), the two are scored on one scale and cut to three. The alternative replaces words with meaning
   and loses the sure thing for the clever one.
7. **No comments in the vector.** A task's meaning is what you wrote in its title and notes; comments are other
   people's words and would pull the task towards them.

## Test plan

Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/server`):

| ID      | Component   | Case                                                                                                                                                                                                                        |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-U01 | core        | Close matches: ordered by closeness, the floor applied, excluded IDs dropped, at most four; the text embedded is the title plus the first 300 characters of the notes, trimmed and lowercased                               |
| C13-U02 | core        | Quick Add merge: shared-word look-alikes and meaning hits on one scale, duplicates folded, open tasks only, at most three, nothing under four characters                                                                    |
| C13-U03 | server      | The embedder interface: a fake embedder in tests; the real one loads once, answers 384 numbers, and the same text gives the same vector; `EMBEDDINGS` picks the adapter and a bad value fails the start                     |
| C13-U04 | server      | `readableBy`: your own, shared by others, owner gone; never another's `Only me`, never a space you are not in; the same rows from the word, meaning and look-alike reads                                                    |
| C13-U05 | SearchHit   | A row from another space shows that space's tile and name before where it lives                                                                                                                                             |
| C13-U06 | SearchPanel | The `Close matches` heading under the word hits with "Looking for tasks like this…" while loading, rows without washed words, the error line, nothing for a full ID or Jira key, arrows walk into the close matches         |
| C13-U07 | SearchPanel | No word match: Create first, close matches under it; Enter still creates                                                                                                                                                    |
| C13-U08 | QuickAdd    | The box after the pause shows meaning hits with where they live; "N more", ×, Open as before                                                                                                                                |
| C13-U09 | web         | The second request goes 260ms after the last key with the word hits' IDs excluded, is dropped if the words change, and its failure never touches the word rows; a pick in another space switches space and turns to the row |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-A01 | `search/meaning`: a paraphrase finds the task, the closest first, at most four, above the floor, `exclude` honoured, hits from two of your spaces each carry their space                                                                                                               |
| C13-A02 | Who may see what, by meaning: a second member's shared task is found, their `Only me` task never, a task in a space you left never, another person's Personal never, even when it is the nearest by meaning; an outsider gets nothing; a stranger to a space is 403 on its word search |
| C13-A03 | Who may see what, by word: the space's word search now lists a second member's shared task and never their `Only me` one; Quick Add look-alikes the same                                                                                                                               |
| C13-A04 | A created task has a vector after the batch settles; a rename or a notes change nulls and refills it; a deleted task never matches; a crossed-off one still does                                                                                                                       |
| C13-A05 | The backfill: rows with no vector get one from the tick, a few at a time, and `embedded_text` records what was embedded                                                                                                                                                                |
| C13-A06 | `for=lookalike` returns the merged list: shared words, meaning, folded, at most three                                                                                                                                                                                                  |
| C13-A07 | Accuracy: the fifty labelled searches against the fixture space with the shipped model; recall at four ≥ 0.85 and precision ≥ 0.9; the scores are written for `docs/tests/chunk-13.md`                                                                                                 |
| C13-A08 | Migration 0010 applies on a database at 0009: the extension, the column, the index; the mac CI Postgres has pgvector                                                                                                                                                                   |

End-to-end, group `search` (added to chunk 07's group, desktop unless said):

| ID      | Case                                                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-E01 | Type a paraphrase: word hits at once, then `Close matches` with the task, no washed words; Enter from the arrows picks it and the page turns to the row                           |
| C13-E02 | A close match from another space: the row carries that space's name; the pick switches space and the row glows                                                                    |
| C13-E03 | Two people in a space (two browser contexts): the second's shared task appears by word and by meaning for the first, their `Only me` task never; the second's Personal task never |
| C13-E04 | No word match: Create first, the close match below; Enter opens Quick Add with the words                                                                                          |
| C13-E05 | A task ID typed in full comes first with no close matches; a Jira key the same (the fake Jira)                                                                                    |
| C13-E06 | The matching down (TEST_ROUTES switch): the quiet line, the word matches still there; back up, the heading returns on the next key                                                |
| C13-E07 | Quick Add: a title that means an existing task shows "Looks like a task you have" with it; a shared-word match still shows; Open goes to the task and keeps the draft             |
| C13-E08 | A task renamed in a second context is found by its new meaning on the next search here                                                                                            |
| C13-E09 | Phone: the sheet shows the heading and its rows; a pick turns to the day (phone)                                                                                                  |
| C13-E10 | Dark: E01 again in dark                                                                                                                                                           |

Not automated: the 200ms fade of the close matches and the box's 220ms open; judge them on staging. The real model
runs in API and end-to-end tests (it is deterministic); the core tests use a fake embedder.

## Done when

- The tests above pass three runs in a row locally and in CI, and chunk 07's search group still passes.
- The accuracy gate passes with the shipped model, and its scores are in `docs/tests/chunk-13.md`.
- Staging finds a task by meaning from the desk, a tablet and a phone, light and dark, across two spaces, and
  Quick Add warns on a paraphrase; a second account sees nothing of your Personal.
- The API image builds on arm64 with the model inside and starts with no network to the model's host; the API's
  memory on staging is noted in the PR.

Open item for you (nothing blocks the build): none. No new settings on Dokploy unless the gate fails and the
hosted model is built (then `EMBEDDINGS` and `EMBEDDINGS_API_KEY` on the staging and production composes).
