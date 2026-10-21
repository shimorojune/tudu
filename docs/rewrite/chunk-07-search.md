# Chunk 07 · Search

Status: approved 21 Oct 2026 (all six choices as proposed), built on branch `rewrite/07-search`. Tests in
[docs/tests/chunk-07.md](../tests/chunk-07.md); deviations in [design-deviations.md](design-deviations.md).

Boards: 07 Search (desktop, dark, tablet, phone, states, motion), 03 Quick Add (Looks like a task you have), 00 The
task row. The panel is the design system's SearchPanel with SearchHit rows and the Quick Add's close-match line; the
styles are already in the vendored stylesheet.

## Scope

- **The panel.** The search icon in the top bar (desk and tablet) opens a 620px panel near the top of the page over a
  light veil; the icon stays lit while it is open. The box is ready to type in. Esc, the veil and the × with an empty
  box close it; with words typed the × clears them. On phones the Search tab opens a full-height sheet with Cancel,
  and the tab is lit while the sheet is up. The top bar never moves. The search is not in the address.
- **Before you type.** Recent searches (up to five, a small clock, pick one to run it again, Clear empties them), then
  Recently opened (up to five tasks you opened lately, read live so a title changed since is current and a deleted
  task is gone). The first time, with neither, one line says what it searches.
- **Typing.** Results follow every key. The server searches the space's tasks by title, task ID and note and sends the
  best thirty: a task ID typed in full first, then titles that start with the words, then titles with every word at a
  word's start, then anywhere in the title, then the ID, then the note, where a line of the note cut around the matched
  word shows under the title. Every word typed has to be found somewhere in the task. Crossed-off tasks sit a step
  below open ones with the same match. Ties go to today, the days ahead (nearest first), the Backlog, the days behind
  (nearest first), then crossed off. The matched words are washed in ink, never red.
- **A row** reads: a ring (open) or a small tick (crossed off), the title (two lines at most), the note line when the
  match is there, then where it lives ("Today" in the brand colour, "Tomorrow", "Fri 23 Oct", "Backlog", "Sat 17 Oct ·
  crossed off", "Backlog · crossed off"), the project with its dot, and the task ID. The list eases to its height; past
  440px it scrolls inside the panel. Up and down arrows walk the rows (wrapping), Enter picks, the pointer follows.
- **Pick a result.** The panel goes, the page turns to the task's day (Today showing that day, past or ahead) or to
  the Backlog (To do, or Crossed off for a crossed-off one), the row is scrolled into the middle and glows where it
  sits. The search joins Recent searches and the task joins Recently opened.
- **Come back to a search.** Reopen the panel during the visit and the last search that led somewhere is back with
  its results, the words selected so typing replaces them. Empty the box for the recents.
- **Create.** With no word match the list reads "No task matches “…”." and the first row is Create “…” (Enter picks
  it): the panel goes and Quick Add opens with the words as the title, Planned as the page would give it (the day in
  view, or nothing on the Backlog). The words join Recent searches.
- **Quick Add: Looks like a task you have.** A moment after you pause in the title (four characters or more), the
  same search in look-alike mode returns open tasks that share enough of the words. A quiet box opens under the title:
  "Looks like a task you have", the closest task's title with where it lives; "N more" unfolds up to two more; × hides
  them for those tasks. The title takes you to that task (the page turns, the row glows) and keeps your draft for the
  visit, as chunk 04's draft already is. It never blocks adding.
- **States**, as drawn: loading (the first answer in flight: skeleton rows, never a spinner), nothing yet, best match
  first, found in a note, a task ID in full, no word match (Create first), nothing at all, phone. Not drawn: offline or
  a failed search shows one quiet line under the box, "Couldn’t search right now.", with Try again; the recents still
  show and a search typed while offline runs when you are back.
- **Reading.** One new endpoint, `GET /api/spaces/:id/search`: `?q=` for the ranked hits, `?ids=` for Recently
  opened, `?q=&for=lookalike` for Quick Add. Postgres finds the candidates by words over the title, the ID and a
  plain-text copy of the notes kept beside the HTML (migration 0004, filled on every notes write and backfilled
  once); the ranking is one function in `packages/core` the server runs over those candidates, so unit tests, the API
  and the app agree. Search is per space. Results are a snapshot, not a live subscription: a change made elsewhere
  shows on the next key or the next opening.
- **Everywhere else.** The top bar's icon and the phone's Search tab come alive; nothing else changes.

Out of scope: close matches by meaning (vector search, [later.md](later.md)), so the "Close matches" heading and
"Looking for tasks like this…" are not shown; Jira keys in the search and in the rows (chunk 10, when there are
Jira keys to search); the Inbox's search line (chunk 08); searching across spaces (never, by the canvas).

## Choices

1. **Search runs on the server, one small request per key.** The words are sent after an 80ms pause and the previous
   rows stay while the next answer comes, so nothing flickers. This keeps to "reads come from the live server" and
   never downloads every note to the browser. The alternative is a search index pulled into the client when the panel
   opens and searched there, which answers with no network at all but has to carry every task's notes.
2. **A plain-text copy of the notes** (`notes_text`, migration 0004) so Postgres searches words, not markup, and a
   word inside a tag name or a link never matches. The alternative matches the HTML and re-checks in Node, which
   misses a word split by formatting and costs a wider scan on every key.
3. **Recent searches and recently opened are per browser and space** (local storage, as the Backlog filter and the
   week's folds are), five each, newest first; the last search is kept in memory for the visit. The alternative keeps
   them on the server so they follow you between devices, at the cost of a table and sync for a small convenience.
4. **"Looks like a task you have" is by shared words** for now, the same search in look-alike mode: open tasks that
   share two or more of the title's words (or the one word of a two-word title), at most three, the closest first.
   Matches by meaning arrive with vector search. The alternative waits for vector search and leaves the line out.
5. **No shortcut opens search.** The canvas rules out keyboard shortcuts for now, so only the icon and the tab open
   it; inside the panel the arrows, Enter and Esc work as drawn. The alternative adds Cmd/Ctrl+K on the desk.
6. **Picking a result goes to the row, not the panel,** as drawn: the page turns and the row glows. Nothing to choose
   unless you would rather it open the task's panel on its day.

## Test plan

Unit (`packages/ui`, `packages/core`, `apps/web`):

| ID      | Component   | Case                                                                                                                                                                                                                                                  |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C07-U01 | core        | Ranking: the words typed; every word must be found; the tiers (ID in full, title starts, every word at a word's start, anywhere in the title, the ID, the note); crossed off a step down; ties by where against today (today, ahead, Backlog, behind, crossed off) |
| C07-U02 | core        | The note line cut around the first matched word with its ellipses; the "where" words (Today, Tomorrow, Yesterday, Fri 23 Oct, Backlog, with "· crossed off")                                                                                           |
| C07-U03 | core        | Look-alikes: shared words and the score, open tasks only, at most three, nothing for a title under four characters                                                                                                                                      |
| C07-U04 | SearchHit   | A task row (ring or tick, the matched words marked, the note line, Today in brand, the project dot, the ID), a recent-search row with the clock, the Create row with its note                                                                           |
| C07-U05 | SearchPanel | Before you type: Recent searches with Clear, Recently opened, the hint when both are empty; a query lists the hits in order; "No task matches" with Create first; the skeleton while loading; the quiet line with Try again on an error              |
| C07-U06 | SearchPanel | Arrows wrap and Enter picks; hover moves the active row; Esc closes; × clears then closes; Cancel on the sheet; a recent search runs again; onSearched on pick and create; reopening restores the last search, selected                                 |
| C07-U07 | QuickAdd    | The look-alike line after the pause and not under four characters; the closest with where; N more unfolds; × hides them; the title reports onOpenSimilar; Add is never blocked                                                                          |
| C07-U08 | web         | Recent searches and recently opened kept per browser and space, five each, newest first, Clear; where a pick goes (a day shows that day on Today with the glow; null goes to the Backlog, To do or Crossed off)                                         |
| C07-U09 | shell       | The top bar's icon is lit while the panel is open; the phone's Search tab is lit while the sheet is up and the page's tab goes back when it closes                                                                                                      |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C07-A01 | `?q=`: ranked across title, ID and notes; every word must match; crossed off below; ties by where against the request's today; at most thirty; the hit shape (id, ref, title, day, done, projectId, snippet); empty words give no hits |
| C07-A02 | Notes: a word inside a tag or a link never matches; the plain-text copy follows every notes change through sync and a task made with a note in Quick Add is found at once; the backfill fills existing rows                 |
| C07-A03 | `?ids=` returns the rows in the order asked and drops deleted ones; `for=lookalike` returns open tasks sharing words, at most three; a stranger is 403                                                                      |

End-to-end, group `search`:

| ID      | Case                                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C07-E01 | Open from the top bar: the panel with the box focused and the icon lit; the hint the first time; Esc closes; the veil closes; × with words clears them                                                 |
| C07-E02 | Type: rows follow the keys, best match first with the matched words marked, a note match shows its line, Today in brand; the task ID typed in full comes first                                         |
| C07-E03 | Pick a result on a day: the panel goes, the page turns to that day (a past one too), the row glows in the middle; arrows and Enter pick as well                                                        |
| C07-E04 | Pick a Backlog result: the Backlog with the row glowing; a crossed-off one lands in Crossed off                                                                                                        |
| C07-E05 | Create: no match, Create “…” first, Enter opens Quick Add with the title; Add lands it on today with the wash                                                                                          |
| C07-E06 | Recents: after a pick the reopened panel has the search selected; an empty box lists Recent searches and Recently opened, Clear empties the searches; both survive a reload; a deleted task is gone     |
| C07-E07 | Quick Add: "Looks like a task you have" for a near-duplicate title with where it lives, "N more", × hides; the title goes to the task and the draft is there on the next New task                       |
| C07-E08 | Phone: the Search tab opens the sheet with the tab lit, Cancel closes; the byline wraps; a pick turns to the day (phone)                                                                               |
| C07-E09 | Tablet: the icon in the compact bar opens the 620px panel (tablet)                                                                                                                                    |
| C07-E10 | Offline and failing: the quiet line with Try again, the recents still there; back online the search runs                                                                                              |
| C07-E11 | Loading: a held search shows the skeleton rows and never a spinner                                                                                                                                    |
| C07-E12 | Dark mode: E02 and E06 again in dark                                                                                                                                                                  |

Not automated: the panel's arrival and leave, the list easing to its height, the glow's timing; you judge those on
staging.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner.
- Staging lets you search from the desk, a tablet and a phone, light and dark: open, type, pick, create, come back to
  a search, and see "Looks like a task you have" in Quick Add.
- The panel matches the 07 boards and the states board; the rows, the marks and the recents match the design
  system's own.
