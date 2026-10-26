# Chunk 21 · All spaces · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). The feature's proposal is
[docs/plans/all-spaces.md](../plans/all-spaces.md). Run this chunk's tests with `pnpm test` and `pnpm e2e all-spaces`.

## Unit (`packages/core`, `packages/client`, `packages/ui`, `apps/web`)

| ID      | Where                     | Case                                                                                                                                                                   |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C21-U01 | core `allSpaces.test.ts`  | `gatherAll` merges three spaces into one list; unarranged days follow switcher order then each space's order; Personal first                                           |
| C21-U02 | core `allSpaces.test.ts`  | Arranged day: places win; a task with no place goes to the end, oldest first; a place whose `day` is stale counts as none                                              |
| C21-U03 | core `allSpaces.test.ts`  | Isolation: a cached task whose space isn't in the list is dropped; a colleague's task in a shared space is dropped; your "only me" task stays                          |
| C21-U04 | core `allSpaces.test.ts`  | Filter: `space` narrows to one space; counts (done, total) match the shown list with and without the filter                                                            |
| C21-U05 | core `spaces.test.ts`     | `all` is reserved: `spaceSlug('All')` gives `all-2`; `spaceForSlug` never matches `all`                                                                                |
| C21-U06 | client `tasks.test.ts`    | `placeInAll` sends only `all.place` and leaves every space position alone; tight neighbours renumber the day in one batch                                              |
| C21-U07 | client `tasks.test.ts`    | `moveInAll` sends `task.place` (day, position null) then `all.place`, in order, for the task's own space                                                               |
| C21-U08 | client `tasks.test.ts`    | Wrong-space guard: cross, rename, due, project and subtask writes from All spaces carry the task's own space; `create` uses the target passed, not the last-used space |
| C21-U09 | client `tasks.test.ts`    | `ALL_SPACES_CHANGED` from another tab invalidates places; from this tab it does nothing; `forgetSpace` removes that space's cached queries and nothing else            |
| C21-U10 | ui `TaskRow.test.tsx`     | The space pill: tile and name, bare in brief and compact; a press calls `onSignal(task, 'space')` and not `onOpen`                                                     |
| C21-U11 | ui `SpaceSwitch.test.tsx` | All spaces row first with a separator; hidden with one space; picking marks the row before `onPick` fires                                                              |
| C21-U12 | ui `SpaceTile.test.tsx`   | The `all` tile uses `tp-stile-all`; initials render as centred SVG text; Personal's small icon                                                                         |
| C21-U13 | ui `TaskDetail.test.tsx`  | The Space fact is first, read-only, and calls `onOpenSpace`                                                                                                            |
| C21-U14 | web `shell.test.ts`       | In All spaces: the sidebar has Today, Week and Backlog only; no Jira button; the Inbox count is unchanged; the All spaces row has no badge                             |
| C21-U15 | web `space.test.ts`       | `/all?space=northwind` keeps the filter; an unknown slug drops it; `/all` with one space goes to `/me`; `homePath` returns `/all` when it was last                     |
| C21-U16 | web `search.test.ts`      | Hits outside the open space are labelled; in All spaces all are; old per-space recent and history lists merge into one, newest first, without repeats                  |
| C21-U17 | core `allSpaces.test.ts`  | `placesFor`: between placed neighbours only the moved task is written; with an unplaced or too-close neighbour the whole day is numbered afresh                        |
| C21-U18 | web `refOnce.test.ts`     | The task panel tells the page a task's ref once per open task, however often the page re-renders; another task, or the same one reopened after closing, tells it again |
| C21-U19 | web `allScope.test.ts`    | All spaces' scope keeps its identity while only `?task=` changes, changes once when `?space=` does; `setFilter` edits the address as it is when called                 |

## API (`apps/server/src/allSpaces.test.ts`, against the test database)

| ID      | Case                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C21-A01 | `all.place` on your task in Personal and in Northwind stores your row; the tasks' own `position` values are unchanged                                   |
| C21-A02 | Auth: `all.place` on a task in a space you aren't in returns 403; on Meera's task in a shared space returns 403; on her "only me" task returns 404      |
| C21-A03 | `GET /api/all-spaces/places` returns only your rows: Meera's rows for the same tasks never appear, and neither do rows for a space you've left          |
| C21-A04 | Stale day: after `task.place` moves the task, its old row is left out of the read; `all.place` with a day that isn't the task's returns 400             |
| C21-A05 | Clocks: an older `all.place` loses to a newer one; replaying the same mutation id is a no-op                                                            |
| C21-A06 | Leaving: `leaveSpace`, `removeMember` and `deleteSpace` delete the leaver's rows for that space and no one else's; `restoreMember` brings no order back |
| C21-A07 | `all.place` publishes `ALL_SPACES_CHANGED` to you only; Meera, in the same space, gets nothing                                                          |
| C21-A08 | Migration: a space slugged `all` becomes `all-2`, its `space_slugs` row for `all` is gone, and creating a space named "All" gets `all-2` (or `all-3`)   |
| C21-A09 | `GET /api/search?q=` finds your tasks and Meera's shared tasks in Northwind and Pilot Farm in one list, each with its `spaceId`                         |
| C21-A10 | Search auth: Meera's "only me" task, a task in a space you aren't in, a space you've left and deleted tasks never appear, by words or by `?ids=`        |
| C21-A11 | `?here=` only breaks ties: a space you aren't in adds nothing; the cap of 30 holds across spaces; the old per-space route still answers                 |

## End-to-end (`packages/e2e/tests/all-spaces`, group `all-spaces`, every size unless noted)

Every spec makes its own users and spaces. The multi-user specs use two browser contexts: you, and Meera.

| ID      | Case                                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C21-E01 | You're in Personal, Northwind and Pilot Farm. All spaces Today shows your tasks from all three, each with its pill, and "2 of 5" adds up                                                              |
| C21-E02 | Isolation: Meera's Northwind tasks and her "only me" task never show in your All spaces; your "only me" task does; nothing from a space you're not in                                                 |
| C21-E03 | Pill filter: click Northwind's pill, only Northwind rows remain, the chip shows, the address has `?space=northwind`; reload keeps it; ✕ clears it                                                     |
| C21-E04 | Own order: drag a Pilot Farm task to the top in All spaces; reload keeps it; Pilot Farm's own Today keeps its old order (desk and tablet)                                                             |
| C21-E05 | Wrong-space writes: from All spaces, cross off, rename and set a due day on a Northwind task; Northwind's Today shows each change and Personal has none                                               |
| C21-E06 | Writing line: a task written in All spaces lands in Personal; filtered to Northwind, it lands in Northwind; Quick Add opened from All spaces says the same                                            |
| C21-E07 | Week (on a Wednesday): drag a Northwind task from Thursday into the middle of Friday; it's at Friday's end in Northwind, and where you dropped it in All spaces after a reload (desk)                 |
| C21-E08 | Backlog: SpaceFilter lists All spaces and each space; choosing Pilot Farm narrows the list and the count; the done view is filtered the same way                                                      |
| C21-E09 | Live: Meera asks you for a task in Northwind and you take it; it appears in your All spaces without a reload. Your second tab sees your reorder live (desk and tablet)                                |
| C21-E10 | Removed while looking: Meera removes you from Pilot Farm; its rows leave All spaces live with the notice, the filter on Pilot Farm resets, and re-adding you shows no stale rows                      |
| C21-E11 | Space deleted while filtered to it: the list falls back to All spaces, and the switcher no longer lists it                                                                                            |
| C21-E12 | One space failing: Pilot Farm's day read returns 500; the banner names Pilot Farm, the other rows still show, and Try again fills it in                                                               |
| C21-E13 | Panel: the Space fact reads Northwind; clicking it opens the task in `/northwind`; the project picker lists Northwind's projects only                                                                 |
| C21-E14 | Switcher: the All spaces row is hidden with one space and appears first once you have a second; picking it opens All spaces Today                                                                     |
| C21-E15 | Slug: create a space named "All"; its address is `/all-2` (or the next free one), and `/all` is still All spaces                                                                                      |
| C21-E16 | Phone: tile-only pills, tapping one filters, the filter chip and the writing line's "in Northwind" (phone only)                                                                                       |
| C21-E17 | Dark: E01's list in dark; the All spaces tile in the switcher is cream (the dark foreground)                                                                                                          |
| C21-E18 | Requests: one day read per space and one places read on opening All spaces Today; going back to Northwind's Today makes no new day read                                                               |
| C21-E19 | Search from Northwind's Today finds a Personal task and Meera's shared Pilot Farm task, each labelled; opening one lands in its own space                                                             |
| C21-E20 | Search never shows Meera's "only me" task, and after Meera removes you from Pilot Farm its tasks drop out of the next search                                                                          |
| C21-E21 | Search from All spaces labels every hit; Recently opened lists tasks from two spaces after opening one in each                                                                                        |
| C21-E22 | A task written in All spaces (every space, filtered to Personal, filtered to Northwind) opens at once while the server holds its answer back; the tab stays responsive and the address gains `?task=` |
| C21-E23 | A saved task opens, closes and opens again on All spaces Today (unfiltered and filtered), Week and Backlog without freezing                                                                           |
| C21-E24 | The same two triggers on a space's own Today, Week and Backlog (regression guard for the shared panel)                                                                                                |

Every end-to-end spec makes its own people and spaces. Chunk 07's Search specs keep their IDs; C07-U08 now reads
one list per browser (Search spans every space), and C07-E11 holds the new `/api/search` route.
