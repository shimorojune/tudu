# All spaces: everything you have to do, in one list

Status: approved by Rohit 25 Oct 2026; in progress.
Design: canvas page "All spaces", draft 2, approved by Rohit on 25 Oct 2026 (v88). Boards: A-Desktop, A-Week,
A-Backlog and A-Phone (each with a Dark twin), A-States(-Dark), A-Pieces and A-Motion.

## Why

Rohit asked for an "All spaces" workspace beside Personal, collating everything you have to work on across your
spaces. Today you open each space in turn to see your day. The menu bar already gathers today across spaces
(`gatherToday` in `packages/core/src/menubar.ts`), but the app itself has no such page.

## What changes for the person

1. **Where it lives.** The switcher's first row is **All spaces**, with an ink tile (lucide `layers`) and a
   hairline under it. The tile is `foreground-2` in light and cream in dark. The row only shows when you belong to
   two or more spaces. Its address is `/all`, `/all/week` and `/all/backlog`.
2. **What it shows.** Your own tasks from every space you are a member of, in Today, Week and Backlog. "Your own"
   means the rule every page already uses: tasks you own, plus ownerless tasks in a team space. That includes your
   "only me" tasks. It never includes a colleague's tasks, and never a space you have left. People, Settings,
   Jira and Apps are not in All spaces. The sidebar has Today, Week and Backlog only, and the top bar has Inbox but
   no Jira button.
3. **One flat list per day.** It is not grouped by space. Each row carries its space as a byline pill (tile and
   name) after Jira and before the project. Tight bylines drop the name first. Week tiles and phones show the tile
   only.
4. **The space pill filters.** Clicking the pill narrows All spaces to that space, and a chip under the title shows
   it. ✕ on the chip, or choosing "All spaces" in the Backlog's SpaceFilter, clears it. The filter is in the
   address (`/all?space=northwind`) and survives a reload. To go to a space, use the switcher, or the Space line
   in the task panel.
5. **Its own order.** Dragging in All spaces sets All spaces' order, for you alone. The space pages keep their own
   order, untouched. A day you have never arranged in All spaces is shown in the switcher's order (Personal first),
   then each space's own order. A task that arrives on an arranged day goes to the end. A task moved to another day
   from its space page drops its All spaces place and joins the end of the new day.
6. **Moving between days** (Week drag, Move to, Backlog to a day) changes the task's day in its own space, at the
   end of that space's day, and gives it a place in All spaces' order where you dropped it.
7. **Writing a task.** The writing line says where it goes: "in Personal", or "in Northwind" while filtered to
   Northwind. Quick Add opens on the same space. Personal is the default (Rohit, 25 Oct).
8. **Every other change is the task's own.** Cross off, rename, due, notes, subtasks, comments, project, Jira and
   visibility all write to the task's space, exactly as they would from the space page. The project picker lists
   that space's projects.
9. **The task panel** shows a read-only **Space** fact first. Clicking it opens the task in its own space.
10. **Counts.** Today's "2 of 5" counts across every space (or the filtered one). The Backlog count follows the
    filter. Switcher badges and the top-bar Inbox count are unchanged, and the All spaces row carries no badge.
11. **States**, as drawn on A-States: loading, offline, empty day, the filtered empty "Nothing in Northwind
    today", one space failing to load ("Couldn't load Pilot Farm. Try again"; the other spaces still show), and a
    space removed while you look (its rows leave, and a toast says "You're no longer in Pilot Farm").
12. **Motion**, as on A-Motion:
    - The switcher marks the picked row (tick draws and tile presses, 150ms) before it closes.
    - The page turns out (110ms), then the next one turns in.
    - A filter change keeps the old list up for 100ms while the header changes, then turns the list.
    - The filter chip row opens and closes (180ms).
    - Reduced motion makes all of these 1ms.
13. **Home.** If All spaces was the last place you were, `/` opens it, the way it opens the last space now.
14. **Search always spans every space** (Rohit, 25 Oct), from any page, not only All spaces.
    - It finds every task you can see in every space you're in, including a colleague's tasks that are shared
      with the space.
    - It leaves out a colleague's "only me" task, which is private to them here as everywhere else, and every
      space you have left.
    - A hit from another space carries its space label, the way close matches already do today. In All spaces,
      every hit carries one.
    - Hits keep today's ranking (at most 30). Ties go to the space you're in, then the switcher's order.
    - Opening a hit from another space opens it in its own space.
    - Recently opened and past searches become one list across spaces. The per-space lists in this browser are
      merged into it, newest first.
    - The Quick Add look-alike check ("Already in Northwind") stays per space, since it is about where the new
      task is going.

## Data (packages/db, migration `0013_all-spaces.sql`)

- New table `all_spaces_places`:
  - Columns: `user_id`, `task_id`, `day` (date, null for the Backlog), `position` (double), `clock` (timestamptz)
    and `updated_at`.
  - Primary key `(user_id, task_id)`. Both columns cascade on delete.
  - Index `(user_id, day)`.
  - A row only counts while its `day` equals the task's current `day`. A task moved elsewhere falls back to "no
    place" without anyone having to clean up.
- **Reserve `all`.** Add `all` to `RESERVED_SLUGS` in `packages/core/src/spaces.ts`. The migration:
  - renames any team space slugged `all` to `all-2` (or the next free number);
  - deletes any `space_slugs` row for `all`.
  - Members of such a space keep every other link. `/all` now opens All spaces. I expect no such space to exist,
    and the migration logs a count so we can confirm.

## Server (apps/server)

- **No new read of tasks.** All spaces is put together on the client from the per-space reads that already exist
  (day, week, backlog, marks, projects). Each of those already checks membership and the "your own" rule on the
  server. That keeps one source of truth for authorization: there is no cross-space query to get wrong.
- **`GET /api/all-spaces/places?from=&to=&backlog=1`** returns your rows, as `{ taskId, day, position }[]`.
  - It joins `tasks` and `space_members`, so it only returns rows for tasks in spaces you are in now, and only
    tasks you own or that are ownerless.
  - A row whose day no longer matches the task's day is left out.
  - The span is capped at 62 days, like marks.
- **New sync mutation `all.place { id, day, position }`.** `id` is the task, and the mutation writes only your
  `all_spaces_places` row.
  - It is rejected with 403 if you're not a member of the task's space, or the task isn't yours (someone else's,
    or "only me" for another person).
  - It is rejected with 400 if `day` isn't the task's current day after the batch. The client always sends
    `task.place` first in the same batch.
  - Last write wins by `at`, against `clock`.
  - The mutation is classified like `me.*`: no task list changes, so `announce` isn't called.
- **New live event `ALL_SPACES_CHANGED { days, clientId }`**, published to you only, so your other tabs refresh
  their order.
- **Search.** New `GET /api/search?q=&today=` and `GET /api/search?ids=`:
  - They use the same `readableBy(userId)` rule that close matches already use (`apps/server/src/closeMatches.ts`):
    spaces you're a member of now, and tasks that are yours, ownerless, or shared with the space. `searchTasks` and
    `hitsById` drop their `spaceId` argument and take that rule instead.
  - `?here=<spaceId>` only breaks ties. It is never a filter, so a forged id can't widen anything.
  - Each `SearchHit` already has `spaceId`. The panel looks up the name and colour from `me.spaces`.
  - `GET /spaces/:spaceId/search` stays for one release for the Mac app on 0.37, then goes. Its `for=lookalike` mode
    stays as it is.
- **Leaving.** `leaveSpace`, `removeMember` and `deleteSpace` delete the leaver's `all_spaces_places` rows for that
  space's tasks, in the same transaction. The read filter already hides them; this keeps the table clean and
  makes "put back" (`restoreMember`) start with no stale order.

## Client (packages/client, packages/core)

- **`gatherAll`** in `packages/core/src/allSpaces.ts` (new) is pure.
  - Inputs: the spaces in switcher order, each space's tasks for a day, your places, your id, and the filter.
  - Output: one ordered list.
  - It drops any task whose `spaceId` isn't in the spaces given. That is the guard against a stale cache from a
    space you just left.
  - It applies the "your own" rule again, in the same way `gatherToday` does.
  - The order rule is the one in item 5 of "What changes for the person".
  - It also returns the counts (done and total) for the header.
- **`TaskStore`**:
  - `allPlacesQuery(from, to)` and `placeInAll(id, day, index)`. The second computes the position against the
    composed list and renumbers the whole day when neighbours are too close, as `place` does.
  - `moveInAll(id, day, index)`: a `task.place` with `position: null` (the end of the space's day), then an
    `all.place`, in that order and in one flush.
  - Its `onEvent` handles `ALL_SPACES_CHANGED` by invalidating `['all-places']`.
  - When `me.spaces` loses a space, `forgetSpace(spaceId)` removes that space's `day`, `week`, `task`, `marks`,
    `projects` and `members` queries. Re-joining then never flashes the old rows.
- **Writes route themselves.** Every existing mutation is keyed by task id and resolved through `known`, so it goes
  to the task's own space with no change. The one write that names a space is `task.create`. The writing line and
  Quick Add pass the target space explicitly (Personal or the filter), never "the open space".

## UI kit (packages/ui) and design system

These are the kit changes drafted on the canvas. They go in the kit and are mirrored into the design-system artifact
(bundle and `@ds-bundle` manifest) in the same PR:

- **`TaskRow`**: `inSpace` signal (tile and name; bare in brief and compact). Its pill press calls
  `onSignal(task, 'space')`.
- **`TaskList`**: `onSignal(task, k)`, `newProps` (the writing line's "in Personal") and `filterSpace`.
- **`Chip`**: a `space` prop. The tile goes inside the label span, tied to the baseline.
- **`SpaceFilter`**: `allTile`.
- **`SpaceTile`**:
  - an `all` kind and a small Personal icon;
  - initials drawn as SVG `<text>`, so they stay centred at fractional positions;
  - the icon sized to whole pixels.
- **`SpaceSwitch`**:
  - a separator after `all`;
  - the picked-row tick and press;
  - the trigger's name swap animation.
- **`TaskDetail`**: `inSpace` and `onOpenSpace` (the Space fact).
- **CSS**: the `tp-stile-all` light and dark rules, the baseline `vertical-align` rules for `tp-sg-tile` and
  `tp-chip-tile`, and the `tp-ssw-*` animations, with their reduced-motion block.

## Web (apps/web)

- New `/all` layout route (static, so it takes precedence over `/$space`) with `/`, `/week` and `/backlog`
  children. It renders the same shell with an "all" `SpaceProvider` value, so the sidebar and top bar know.
- With fewer than two spaces, `/all` redirects to `/me`, and the switcher hides the row.
- The Today, Week and Backlog pages take their data from a `useAllDay` / `useAllWeek` / `useAllBacklog` hook while
  in All spaces. These are `useQueries` over the spaces, run in parallel. No page forks into a second copy: the
  page components already take a list and callbacks.
- `?space=` is parsed like the Inbox's filter. A slug you aren't in is dropped, along with its chip.
- `rememberSpace('all')`, so `homePath` can return `/all`.
- **Search** (`app/SearchHost.tsx`, `app/search.ts`):
  - It reads `/api/search`, whatever page you're on.
  - `spaceOfHit` labels any hit outside the open space. In All spaces there is no open space, so every hit is
    labelled.
  - Projects for hits come from each hit's own space.
  - `useRecentTasks` and `useSearches` move to one per-browser key, and the old per-space keys are merged into it
    once.
  - `goToTask` already opens a task in its own space.
- Record the deviations in `docs/rewrite/design-deviations.md` if any remain at the end. None are planned.

## Performance

- With N spaces, a view makes N per-space reads plus one places read, all in parallel, against caches that are
  shared with the space pages. Going from Northwind's Today to All spaces' Today re-reads nothing that is still
  fresh.
- Rohit's account has a handful of spaces. Up to about 15, this is cheaper than a new cross-space endpoint, and it
  needs no new invalidation logic, because every existing `TASKS_CHANGED` already refreshes the right day cache.
  Past that we would add a batch read. That is not planned now.
- One slow or failing space doesn't block the rest. Its rows are missing, and the page shows the banner from item 11.

## Test scenarios

New chunk 21 (`docs/tests/chunk-21.md`, added in the same PR). Each ID is in its test's name, so
`pnpm test:status` finds it.

### Unit (vitest)

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

### API (apps/server, against the test database)

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

### End to end (`packages/e2e/tests/all-spaces`, group `all-spaces`, desktop unless noted)

Every spec makes its own users and spaces. The multi-user specs use two browser contexts: you, and Meera.

| ID      | Case                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C21-E01 | You're in Personal, Northwind and Pilot Farm. All spaces Today shows your tasks from all three, each with its pill, and "2 of 5" adds up                                        |
| C21-E02 | Isolation: Meera's Northwind tasks and her "only me" task never show in your All spaces; your "only me" task does; nothing from a space you're not in                           |
| C21-E03 | Pill filter: click Northwind's pill, only Northwind rows remain, the chip shows, the address has `?space=northwind`; reload keeps it; ✕ clears it                               |
| C21-E04 | Own order: drag a Pilot Farm task to the top in All spaces; reload keeps it; Pilot Farm's own Today keeps its old order                                                         |
| C21-E05 | Wrong-space writes: from All spaces, cross off, rename and set a due day on a Northwind task; Northwind's Today shows each change and Personal has none                         |
| C21-E06 | Writing line: a task written in All spaces lands in Personal; filtered to Northwind, it lands in Northwind; Quick Add opened from All spaces says the same                      |
| C21-E07 | Week: drag a Northwind task from Monday to Wednesday; it's on Wednesday in Northwind's Week at the end, and where you dropped it in All spaces                                  |
| C21-E08 | Backlog: SpaceFilter lists All spaces and each space; choosing Pilot Farm narrows the list and the count; the done view is filtered the same way                                |
| C21-E09 | Live: Meera adds a task for you in Northwind; it appears in your All spaces without a reload. Your second tab sees your reorder live                                            |
| C21-E10 | Removed while looking: Meera removes you from Pilot Farm; its rows leave All spaces live with the toast, the filter on Pilot Farm resets, and re-adding you shows no stale rows |
| C21-E11 | Space deleted while filtered to it: the list falls back to All spaces, and the switcher no longer lists it                                                                      |
| C21-E12 | One space failing: Pilot Farm's day read returns 500; the banner names Pilot Farm, the other rows still show, and Try again fills it in                                         |
| C21-E13 | Panel: the Space fact reads Northwind; clicking it opens the task in `/northwind`; the project picker lists Northwind's projects only                                           |
| C21-E14 | Switcher: the All spaces row is hidden with one space and appears once you join a second; the page turns out and in without a jump                                              |
| C21-E15 | Slug: create a space named "All"; its address is `/all-2`, and `/all` is still All spaces                                                                                       |
| C21-E16 | Phone: the switcher row, tile-only pills, the filter chip and the writing line's "in Personal"; tapping a pill filters                                                          |
| C21-E17 | Dark: E01's list in dark; the All spaces tile is cream, and the pills and chip match A-Desktop-Dark                                                                             |
| C21-E18 | Requests: one day read per space and one places read on opening All spaces Today; going back to Northwind's Today makes no new day read                                         |
| C21-E19 | Search from Northwind's Today finds a Personal task and Meera's shared Pilot Farm task, each labelled; opening one lands in its own space                                       |
| C21-E20 | Search never shows Meera's "only me" task, and after Meera removes you from Pilot Farm its tasks drop out of the next search                                                    |
| C21-E21 | Search from All spaces labels every hit; Recently opened lists tasks from two spaces after opening one in each                                                                  |

The group runs three times locally before the PR, as AGENTS.md asks. Existing Today, Week and Backlog specs keep
their IDs and are not changed, since space pages behave as before. Chunk 07's Search specs keep their IDs. Any that
assume one space's results are updated for the wider search, and none are dropped.

## Decided

1. A task written in All spaces goes to Personal by default, or to the filtered space (Rohit, 25 Oct).
2. Search always spans every space, and covers every task visible to you (Rohit, 25 Oct). See item 14.

## Out of scope

- People, Jira and Settings in All spaces.
- The menu bar, which already gathers across spaces and is unchanged.
- A tablet board. It follows desktop down to the existing breakpoint, then phone.
- A server-side cross-space read. We add one only if we measure a need for it.

## Rollout

One PR containing:

- the migration, the server, client, core, kit and web changes, and the tests;
- `docs/tests/chunk-21.md`;
- the design-system mirror;
- the canvas page marked "built".

It ships in the next release. Old clients ignore `ALL_SPACES_CHANGED` and never send `all.place`, so there is no
compatibility work.
