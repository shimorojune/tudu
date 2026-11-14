# Group the day by project

Status: proposal, awaiting approval. Canvas approved 14 Nov 2026 (Today page, boards `T-Group`, `T-GroupStates`,
`T-GroupMotion`, light and dark, canvas Version 252). No code until this is approved.

## 1. What the person gets

A day often holds several tasks for each of a few projects. Today there is no way to see the day by project in a
space, and the Backlog's "All projects" menu shows one project at a time and hides the rest.

- A **My order | By project** switch (the design system's Segmented) on Today, any other day, 2 days, the Backlog
  beside the day, the Backlog page and All spaces. It shows only when the page has two or more groups. The choice is
  remembered per space on this device.
- **By project** shows the same tasks under one slim header per project: caret, colour dot, name and the count of
  what is left (a green tick once everything in it is crossed off). Groups follow the space's project order
  (Settings › Projects); tasks without a project come last under **No project**. Inside a group the tasks keep the
  order you gave the day.
- **Click a header to fold it** to its one line, click again to open it. Folding the projects you are not on is the
  way to switch between projects. Folds are remembered per space and shared by every page above.
- **"+" on a header** (on hover; always shown on phones) opens a writing line inside that project with the cursor in
  it. A folded group opens first. The task is created in that project.
- **One writing line at the foot of the page**, never two together. It writes to No project. No project has no line
  of its own (its "+" puts the cursor in the page's line). While the last project's own line is open, the page's
  line is hidden.
- On sheets 720px and wider the switch sits on the title's line, between the date and the ring, so grouping costs no
  extra height. On narrower sheets (2 days, phones) it takes its own line under the title.
- **Backlog page:** the switch replaces the "All projects" menu (left of the tools row); To do | Crossed off stays on
  the right. Both views group. The Crossed off view has no "+".
- **All spaces:** groups are projects from every space with work on that day, spaces in switcher order, each
  space's projects in its own order. Rows keep their space pill. Clicking a row's project pill folds every other
  group (in My order it filters, as it does now).
- The writing line's empty box now lines up with its words ("Write the next thing…"). This is a fix to the shared
  component, so every page gets it.

Decisions I assumed from the draft's sticky, since none was objected to. Say so if any is wrong:

1. Grouping is a switch, off by default, not the only view.
2. Folds are shared across pages in a space (fold Platform on Today and the Backlog opens with it folded).
3. While grouped, dragging reorders inside a group only. A task moves to another project in its panel, and to
   another day or the Backlog with its calendar button or "From Sat" pill. Dragging between pages works in My order.
4. The ring counts the whole day, folded groups included.

Out of scope: reordering the groups themselves by drag (that is the project order in Settings), a keyboard shortcut
for the switch, syncing the choice or the folds between devices.

## 2. States

| State | What shows |
| --- | --- |
| Loading, grouping on | Skeleton in the grouped shape: a header bar, then rows. The switch is a bar too. |
| Grouped | Headers with counts, rows under each, one writing line at the foot. |
| Folded | A folded group is its 36px header (44px on phones) with the count. |
| Project done for the day | The count gives way to the success tick; the group stays in place. |
| One group only | Plain list, no headers, switch hidden. The choice is kept and returns with a second group. |
| Empty day | The usual empty page, no switch. |
| Many projects | Folded groups are one line each; every count stays in view. |
| Error | The usual error page, no groups, no switch. Choice and folds are kept. |
| Offline | Everything works; grouping and folds are local, counts follow the device. |
| 2 days | Both pages grouped, switch on its own line, folds shared, no dragging across pages. |
| Backlog beside (#102) | Same switch and folds on the lean sheet; dragging to and from the day works in My order only. |
| Backlog page | Switch on the left, To do \| Crossed off on the right. |
| All spaces | Groups across spaces; space pill on rows; project pill folds the others. |
| Phone | Switch under the compact title, 44px headers, "+" always shown. |
| A project deleted or renamed elsewhere | Its tasks fall under No project or the new name on the next read; a fold kept for a project that is gone is dropped. |

## 3. Motion

| What | How |
| --- | --- |
| Switching My order ↔ By project | The list turns (`Sheet plain`, `--dur-day-turn` 280ms); the header holds still. |
| Folding and opening a group | Grid rows 1fr ↔ 0fr with opacity, `--dur-fold` 300ms, `--ease-change`; the caret turns 90° with it. |
| "+" on a header | Fades in over `--dur-menu` 160ms on hover; the writing line opens with the row-open motion. |
| A group's last open task is crossed off | The count cross-fades to the tick, `--dur-menu`. |
| A group gains its first task or loses its last | The group folds in or away, `--dur-fold`. |
| The page's writing line gives way to the last group's line | Folds away and back, `--dur-fold`. |
| Reduced motion | Everything above becomes a plain fade or an instant change. |

## 4. How it is built

No server change, no migration, no API change. Grouping is a view over data the pages already have.

### 4.1 Design system (`packages/ui`)

- **`TaskGroups`** (new): takes the groups (`key`, `name`, `color`, `tasks`), the folded keys, and the same task
  handlers `TaskList` takes. Renders a `GroupHeader` and one `TaskList` per group, plus the page's writing line and
  the "never two lines" rule. Each inner list has no drag `group`, so rows cannot leave their project by drag.
  Reports `onFold(key, folded)`, `onAdd(text, groupKey, before?)` and `onReorder(groupKey, move)`.
- **`GroupHeader`** (new): a button (`aria-expanded`, names the project and what is left), caret, dot, name, count
  or tick, and the "+" as a second button. Caret, dot and tick are tied to the text baseline, not centred, so they
  sit right whatever the font metrics.
- **`TaskListSkeleton`**: a `grouped` prop for the header-bar shape.
- **`DayHeader`**: a new `aside` slot, drawn on the title's line between the date and the ring when the sheet is
  720px or wider (container query on the sheet) and on its own line otherwise. `children` (All spaces' chips, the
  Backlog's tools row) is unchanged.
- **`AddTask`**: the box aligns to the words' baseline (`components.css`, `.tp-addtask`). Shared fix, all pages.
- **`ProjectFilter`**: removed with its test and its kit state, since the Backlog was its only user. `TaskList`'s
  `filter` prop stays (All spaces' My order still uses it).
- Kit: grouped states added to the Today and Backlog state pages under `apps/web/src/routes/kit`.

### 4.2 App

- **`packages/core/src/groups.ts`** (new, pure): `groupByProject(tasks, projects, spaces?)` returns the ordered
  groups; `dayIndexFor(dayOrder, groupKeys, to)` turns "place 2 in this group" into the task's place in the whole
  day, so a reorder inside a group is one ordinary `taskStore.place` and My order stays consistent.
- **`apps/web/src/app/grouping.ts`** (new): per-space store in local storage, `tudu.group` =
  `{ [spaceId | "all"]: { on: boolean, folded: string[] } }`, same shape of code as today's `backlog/filter.ts`.
  `apps/web/src/routes/backlog/filter.ts` and `tudu.backlog.filter` go away (the old key is deleted on first read).
- **`TodayPage.tsx`** (`DaySheet`): reads the store, passes the switch to `DayHeader`'s `aside`, renders
  `TaskGroups` when on and there are two or more groups, else the list as now. Writing in a group calls
  `taskStore.create(spaceId, day, text, index, { projectId })` with the index after the group's last task. In
  grouped view the sheet passes no drag `group`, so 2 days cannot trade rows.
- **`BacklogBeside.tsx`** and **`BacklogPage.tsx`**: the same wiring; the page drops `ProjectFilter`, the
  "Show all projects" empty state and the per-project count words.
- **All spaces** (`allSpaces.tsx`, `TodayPage.tsx`): groups by project name (as its filter does today), key
  `spaceId:projectId`; in grouped view the project pill's signal folds the others instead of filtering. A task
  written in a group is created in that project's space.

### 4.3 After merge

Design system artifact and canvas synced from the code: `TaskGroups`, `GroupHeader`, `DayHeader` aside and the
`AddTask` fix go into the Tudu Paper kit, the draft boards lose their board-level CSS and use the kit, and the
Backlog boards on every page lose the "All projects" menu. The sticky is marked BUILT.

## 5. Test scenarios

IDs take the next free number at build time. Tests run on PR CI, not on the Mac.

### New

| ID | Where | Scenario |
| --- | --- | --- |
| C02-U47 | core `groups.test.ts` | Groups follow project position, No project last; tasks keep the day's order inside a group; a task whose project is gone lands in No project; All spaces orders by space then project |
| C02-U48 | core `groups.test.ts` | `dayIndexFor`: first, middle and last place in a group map to the right place in the day; a group of one; the moved task excluded from the count |
| C02-U49 | ui `GroupHeader.test.tsx` | Caret, dot, name and count; the tick when all are crossed off; `aria-expanded`; click and Enter report the fold; "+" reports add and does not fold |
| C02-U50 | ui `TaskGroups.test.tsx` | One header and list per group; a folded group shows no rows and is inert; folding reports the key |
| C02-U51 | ui `TaskGroups.test.tsx` | "+" mounts that group's writing line focused; on a folded group it opens the group first; Enter reports the text with the group key |
| C02-U52 | ui `TaskGroups.test.tsx` | Writing lines: one at the foot; No project's "+" focuses it; it is hidden while the last project's line is open and back when that closes |
| C02-U53 | ui `TaskGroups.test.tsx` | A drag or Alt-arrow inside a group reports the group and the move; rows have no drop target in another group |
| C02-U54 | ui `DayHeader.test.tsx` | `aside` renders between date and ring; absent, the header is unchanged; `children` still render in the tools row |
| C02-U55 | ui `TaskListSkeleton.test.tsx` | `grouped` draws header bars and rows |
| C02-U56 | web `grouping.test.ts` | On/off and folds kept per space and across reloads; a space never seen is off with nothing folded; a fold for a project that is gone is dropped; `tudu.backlog.filter` is removed |
| C02-E26 | e2e today | Two projects on the day: the switch shows, By project groups in project order with counts, survives a reload, My order restores the plain list in the same order |
| C02-E27 | e2e today | Fold a group, turn to tomorrow and back, reload: still folded; the ring still counts the whole day |
| C02-E28 | e2e today | "+" on a header: the cursor is in the line, the task is saved with that project (read from the server) and sits last in the group; in My order it sits after that group's last task |
| C02-E29 | e2e today | Reorder inside a group, switch to My order: only that task moved, positions on the server match |
| C02-E30 | e2e today | One project only: no switch, plain list; add a task in a second project (Quick Add) and the groups return |
| C02-E31 | e2e today | 2 days grouped: switch on its own line, a fold applies to both pages, a row cannot be dropped on the other page, the calendar button still moves it |
| C02-E32 | e2e today | Backlog beside grouped: same folds; drag across is off in By project and works again in My order |
| C02-E33 | e2e today | Phone and tablet: switch under the title, 44px headers, "+" visible without hover; desktop 720px+: switch on the title's line and the header no taller than before |
| C02-E34 | e2e today | Dark theme, reduced motion, and the loading skeleton in the grouped shape on a held read |
| C02-E35 | e2e today | Never two writing lines: open the last project's line and the page's line is gone; Esc brings it back |
| C06-U11 | web Backlog page | The header's tools row: grouping switch first, To do \| Crossed off last; no project menu |
| C06-E16 | e2e backlog | By project on the Backlog: groups and counts, a cross off folds the row away and the count drops, Crossed off groups too with no "+", folds match Today's |
| C21-U24 | web All spaces | Groups across spaces in switcher order; a written task goes to the group's space and project |
| C21-E30 | e2e all spaces | By project in All spaces: space pills stay, a project pill folds the other groups, My order's pill still filters |

### Updated

| ID | Change |
| --- | --- |
| C06-U01 | Removed with `ProjectFilter`. |
| C06-U04 | Stays for `TaskList`'s `filter` (All spaces), moved to chunk 21's wording. |
| C06-U05 | Header: the switch replaces the filter in the tools row. |
| C06-U06 | Count words lose the "in Platform" forms. |
| C06-U09 | Replaced by C02-U56 (grouping memory); "More lists the Backlog" stays. |
| C06-E05 | Rewritten as C06-E16; the filter menu, chip and "Show all projects" cases go. |
| C06-E10, C06-E13 | "the filter" becomes "the grouping switch" (hidden while loading with fewer than two groups known). |
| C02-U14 | Adds: the box sits on the words' baseline (computed style), light and compact. |
| C02-U16, C02-E-two-days cases | Unchanged in My order; assert they run with grouping off. |
| C02-D02 | Mac: unchanged, runs in My order. |
| Kit snapshot tests | New grouped states; `ProjectFilter` state removed. |

### Manual (yours, on staging)

| ID | Check |
| --- | --- |
| MC-G01 | Mac app, Today with 3 projects: the header's caret, dot, name and count sit on one line, and the writing line's box lines up with its words. These were the two alignment fixes I could not render myself. |
| MC-G02 | Fold all but one project on Today, open the Backlog page: same folds. Quit and relaunch: still there. |

## 6. Risks

- **Alignment was fixed blind.** I could not render the canvas boards, so the header and writing-line fixes are
  computed, not seen. C02-U14 and C02-E33 check geometry in a real browser on CI, and MC-G01 is your eye on it.
- **Removing the Backlog's project menu is a behaviour change**: "only Platform" becomes "fold the others", which is
  one click per other project. If that turns out too slow with many projects, a "fold all others" on Alt-click is a
  small follow-up; not built now since you removed Only this / Show all.
- **Position math**: a reorder inside a group must not disturb other projects in My order. Covered by C02-U48 and
  C02-E29.
- **All spaces** has its own ordering store (`placeInAll`); grouped reorder there goes through the same
  `dayIndexFor` against the All spaces order. Covered by C21-U24 and C21-E30.
- **Other open work**: the right-click menu (PR #107) and task times touch `TaskRow`, not the list's structure;
  whichever merges second rebases. No shared files with this beyond `TodayPage.tsx`.

## 7. Release

Web and Mac together, no migration, nothing to back up. The grouping choice starts off for everyone; a remembered
Backlog project filter is dropped silently.
