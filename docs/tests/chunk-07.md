# Chunk 07 · Search · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project core --project web --project server` and `pnpm e2e search`. End-to-end tests
fix the clock at Sunday 18 October 2026, 10:00, and write their tasks straight through sync so the days and the
notes are exact.

## Unit (`packages/ui`, `packages/core`, `apps/web`)

| ID      | What it checks        | Scenario                                                                                                                                                                                                                                                       |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C07-U01 | Ranking               | The words typed; every word must be found; the tiers (the ID in full, the title starts with the words, every word at a word's start, anywhere in the title, the ID, the note); crossed off a step down; ties by where against today; the limit                 |
| C07-U02 | The note line, where  | The note cut around the first matched word with its ellipses; "Today", "Tomorrow", "Yesterday", "Fri 23 Oct", "Backlog", with "· crossed off"; Today in the brand tone                                                                                         |
| C07-U03 | Look-alikes           | Open tasks sharing two or more words (one for a title of one or two words), the closest first, at most three; nothing under four letters or with no shared word                                                                                                |
| C07-U04 | A search result       | A task row (ring or tick, the matched words marked, the note line, Today in brand, the project dot, the ID); a recent-search row with the clock; the Create row with its note; picking and hovering report                                                     |
| C07-U05 | What the panel shows  | Before you type: Recent searches with Clear, Recently opened, the hint when both are empty; the hits in order with the words marked; the old rows stay until the next answer; "No task matches" with Create first; the skeleton; the quiet line with Try again |
| C07-U06 | Working the panel     | Arrows wrap and Enter picks, the pointer moves the active row; Enter on no match creates; a recent search runs again; Esc closes; × clears then closes; Cancel on the sheet; reopening restores the last search, selected; not with keepLast off               |
| C07-U07 | Quick Add look-alikes | Asked after a pause and not under four letters; the closest with where; N more unfolds; × hides them for good; the title reports onOpenSimilar; Add never waits; words handed in become the title                                                              |
| C07-U08 | Search's memory       | Recent searches and recently opened per browser, one list for every space (chunk 21), five each, newest first, the same words once, Clear; a pick goes to Today showing its day with the row to locate, or to the Backlog on To do or Crossed off              |
| C07-U09 | The phone's tabs      | Search is lit while its sheet is up, More for the Backlog and the More page, else the page's own tab                                                                                                                                                           |

## API (`apps/server`)

| ID      | What it checks | Scenario                                                                                                                                                                                                       |
| ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C07-A01 | `?q=`          | Ranked across the title, the ID and the notes; every word must match; crossed off below; ties by where against the request's today; the hit shape; the ID in full alone; no words give no hits; at most thirty |
| C07-A02 | Notes          | A word inside a tag or a link never matches; the text copy follows every notes change through sync; a task made with a note in Quick Add is found at once; the migration's backfill gives the same words       |
| C07-A03 | `?ids=`, alike | The rows in the order asked without deleted ones; `for=lookalike` returns open tasks sharing words, at most three, nothing for a short title; a stranger is refused                                            |

## End-to-end (`packages/e2e/tests/search`, group `search`)

| ID      | What it checks    | Scenario                                                                                                                                                                                                         |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C07-E01 | Opening           | The top bar's icon (the Search tab on phones) opens the panel with the box focused and the icon lit; the hint the first time; Esc closes; × clears the words; the veil (Cancel on phones) closes                 |
| C07-E02 | Typing            | Rows follow the keys, best match first with the words marked, Today in brand; a note match shows its line cut around the word; a better title match outranks; the crossed-off one below; the ID in full alone    |
| C07-E03 | Picking on a day  | The panel goes, the page turns to a past day, the row glows; arrows and Enter pick the second row and the page turns back to today                                                                               |
| C07-E04 | Picking a Backlog | The Backlog with the row glowing; a crossed-off one lands in Crossed off with the switch on it                                                                                                                   |
| C07-E05 | Create            | No match: "No task matches", Create first and alone; Enter opens Quick Add with the words, focused; Add lands it on today with the wash and the server agrees; the words joined the recent searches              |
| C07-E06 | Recents           | The reopened panel has the last search selected and typing replaces it; an empty box lists Recent searches and Recently opened; a recent search runs again; both survive a reload; a deleted task is gone; Clear |
| C07-E07 | Quick Add         | "Looks like tasks you have" with "1 more" that unfolds, × hides them; one look-alike with where it lives; its title closes the bar and glows the row on Today; the draft is there on the next New task           |
| C07-E08 | Phone             | The Search tab opens the sheet with the tab lit; Cancel closes and the tab goes back; the byline wraps; a pick turns to the day with Today lit (phone)                                                           |
| C07-E09 | Tablet            | The icon in the compact bar opens the 620px panel (tablet)                                                                                                                                                       |
| C07-E10 | Offline           | The quiet line "Couldn’t search right now." with Try again and no skeleton; the recents still there; back online, Try again brings the rows                                                                      |
| C07-E11 | Loading           | A held search shows three skeleton rows and no spinner; released, the rows                                                                                                                                       |
| C07-E12 | Dark              | Searching with the words marked, the pick and the glow, and the recents in the dark theme                                                                                                                        |
