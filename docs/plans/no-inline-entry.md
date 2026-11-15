# No typing in task lists: the writing line opens Quick Add

Status: approved by Rohit on 15 Nov 2026; building. Asked by Rohit on 15 Nov 2026 ("checkbox alignment is broken when typing
task - let's do one thing, let's remove inline task addition entirely, only keep the modal based entry"). Design
approved by Rohit on 15 Nov 2026 ("looks good"): canvas page Today, the no-inline draft row at y 30700, boards
`T-AddQA`, `T-AddQA-Dark`, `T-AddQAMotion`, `T-AddQAStates`, `T-AddQAStates-Dark` (canvas Version 274). Test cases
are listed below with the `NI-` prefix.

Rohit's calls during the canvas round (15 Nov):

- Keep the "Write the next thing…" line. It no longer turns into a field: it opens Quick Add.
- No "+" at the top of a sheet (v1 had one at the end of the eyebrow line; "barely visible", dropped).
- No border under the last row of a list when no line follows it.

## Why

Every list has its own small editor: the line at the foot of a list, the "+" between two rows, and a project's own
line under its group header. Each one is a field that swaps in for a label, and each one has had alignment bugs (the
placeholder baseline, C02-U14; now the checkbox drifting while you type). Quick Add already does everything those
lines do and more (day, due, time, project, note, files, sending). One way in means one editor to keep straight.

## What changes for the person

1. **The line stays, the field goes.** The last line of a list keeps its words and look: "Write the next thing…" on a
   day, "Add to the Backlog…" in the Backlog and the Backlog beside Today, "Add to Personal…" (the target space) in
   All spaces. A click, or Enter / Space when it has focus, opens Quick Add. It never becomes a text field.
2. **Quick Add opens set to that list.**

   | Line                                         | Quick Add opens with                                                            |
   | -------------------------------------------- | ------------------------------------------------------------------------------- |
   | A day's line (Today, any day, either of two) | Planned on that day                                                             |
   | The Backlog page, the Backlog beside Today   | No day (Backlog)                                                                |
   | All spaces                                   | The target space (Personal, or the filtered space) and that list's day / no day |
   | A project group's "+" (By project)           | That list's day / no day and that project                                       |
   | The "No project" group                       | That list's day / no day, no project                                            |

   Everything in Quick Add can still be changed before Add. Esc or a click outside closes it and nothing is made,
   and focus goes back to the line when it had it (NI-U07).

3. **Where the task lands.** Last in the list it was opened from (last in its group with By project), with the usual
   arrival wash, as Quick Add's own Add does today. Quick Add closes after Add, as now. Focus goes back to the line,
   so Enter opens it again for the next task.
4. **Gone:** the "+" between two rows (and its pause / hide-while-dragging rules), a project's own writing line under
   its header, the "never two writing lines" juggling. The group header "+" stays and opens Quick Add (row 2).
5. **Empty lists** show their empty state with a **New task** button that opens Quick Add set the same way, and no
   line under it. "Add a task" is renamed "New task" everywhere (the welcome on Today, an empty day, an empty
   Backlog). The empty Backlog beside Today is redesigned by the "Fix Backlog empty state beside Today" thread; its
   button is the same "New task".
6. **Unchanged:** the top bar's New task, the New task shortcut, the phone's round button, Search's Create, the menu
   bar's New task, Quick Add from a note. Subtasks keep their inline "Add subtask" line in the panel and the row's
   fold (a subtask is not a task list).
7. **Last row border.** A list that ends without a line (Crossed off, read-only lists, a list in a loading or error
   state) draws no bottom border under its last row.
8. **Phones.** Same line, it opens the Quick Add sheet set to that list. No header "+" on phones beyond the existing
   group header one.
9. **Motion** (T-AddQAMotion). Clicking the line: a 120ms press wash on the line, then Quick Add's own open (unchanged).
   Add: the row arrives with the existing gap-open + wash. The line itself never moves or changes size.
10. **States** (T-AddQAStates). Loading: no line under the shimmer. Error: the error state, no line. Offline: the line
    opens Quick Add as now, and Quick Add's offline rules apply (it saves and syncs later, attach is off).

## How

### Design system (`packages/ui`)

- `AddTask` becomes a button only: props `label`, `onOpen`, `compact`, `className`. It drops `onAdd`, `openKey`,
  `autoOpen`, `onClose` and its input. `aria-haspopup="dialog"`. Same `.tp-addtask` class, so its look is untouched.
- `TaskList`: `onAdd(text, before?)`, `addKey`, `onAddClose` and `insertable` go. New `onAddOpen?: () => void`; the
  line shows when `addLabel` and `onAddOpen` are both set. The insert slot (`tp-ins`, `canInsert`, `insertBefore`)
  and its CSS are removed.
- `TaskGroups`: `onAdd(text, group, before?)`, `groupAddLabel`, `addKey`, `onAddClose` and the per-group line
  (`openLine`, `line`, `endBump`) go. New `onAddOpen?: () => void` (the end line) and `onGroupAdd?: (key, group) =>
void` (the header "+"; `GroupHeader`'s `onAdd` keeps its name and calls it).
- `QuickAdd`'s `seed` gains `day?: IsoDate | null` (added by PR #111, Backlog empty state; this work reuses it) and `projectId?: string | null`. A seed with `day` sets the
  day (null = Backlog); with `projectId` sets the project (only one in `projects`, else none, as the project-hash
  work already requires).
- CSS: `.tp-root:not(:has(> .tp-addtask)) > .tp-list > .tp-item:last-child .tp-row { border-bottom-color:
transparent; }`.
- `motion.ts`: `follow === 'add'` (scroll the line into view while typing) has nothing left to follow and goes.
- `DayHeader` gets nothing (the v1 "+" was dropped; its canvas-kit patch is removed when syncing).

### Web app (`apps/web`)

- `dayView.ts`: `QuickAddSeed` has `day` from PR #111 and gains `projectId?: string | null`; `QuickAddHost` passes
  them to `QuickAdd`'s seed as `day` / `projectId`. The unused `useNewTaskAsk` / `askNewTask` go.
- `TodayPage`: the `writing` state and every `onAdd` handler go. `onAddOpen = () => openQuickAdd({ day })` (in All
  spaces also `spaceId: all.target.id`); `onGroupAdd` adds the group's `projectId` (and its space in All spaces).
  The welcome and empty day buttons read New task and call the same `openQuickAdd`.
- `BacklogPage`, `BacklogBeside`: the same with `day: null`. The empty Backlog page's "Add a task" reads New task.
- `quickAdd.tsx` already flashes the new task when it lands in view and toasts with Show when it does not; By project
  placement (last in its group) comes from the project being set, since a group lists its project's tasks in order.
- Kit routes (`routes/kit/*`) follow the component props.

### Mac app

Nothing native changes. The line is a web button in the WKWebView like every other.

### Canvas and docs

- Design system artifact: `AddTask`, `TaskList`, `TaskGroups`, `QuickAdd`, `EmptyState` pages and their README /
  `index.d.ts` updated from the shipped code; the canvas-kit draft patch (`onOpen`, `onAddOpen`, `onGroupAdd`, seed
  project, the last-row rule) applied, the unused `DayHeader` `onAdd` patch dropped, kit `TaskList` defaults to no
  insert slot.
- Canvas: the five `T-AddQA*` boards marked Built; every other board that draws a "+" between rows, a project's own
  line, or "Add a task" redrawn to the new rule (listed in the PR).
- `docs/tests/no-inline-entry.md` indexes the tests below; the replaced tests are marked as replaced in their chunk
  files.

## Test scenarios

All tests run on PR CI (and Actions › Flake check for repeats), not on Rohit's Mac.

### Existing tests that change

About 105 calls of the e2e helpers `writeTasks` (`fixtures/today.ts`) and `writeBacklog` (`fixtures/backlog.ts`),
in 14 spec files, use the line only to set up tasks. Both helpers are rewritten to: click the sheet's line (or the
empty state's New task), fill Quick Add's "Task title", press Enter, wait for the row and for Quick Add to close,
once per title. The specs that call them do not change. Tests whose subject was the inline field:

| Test                                                                    | Becomes                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| C02-U14 (AddTask: serif, Enter, baseline)                               | Replaced by NI-U01                                                   |
| C02-U10 (written on the last line opens its gap)                        | Replaced by NI-U02                                                   |
| C02-U11 (the "+" between rows)                                          | Removed; NI-U03 checks there is no insert slot                       |
| C02-U51, C02-U52 (a project's own line, never two lines)                | Replaced by NI-U04                                                   |
| C02-U49 ("+" adds)                                                      | Kept, "+" calls `onGroupAdd`                                         |
| C06-U04, C21-U10 (filters turn off the "+")                             | Kept without the "+" half; the filtered line still calls `onAddOpen` |
| RM-U09 / RM-D02 (right-click in the writing line keeps the system menu) | Retargeted to the subtask input and Quick Add's title field          |
| C02-E05 (the "+" between two tasks)                                     | Removed (NI-E03 checks it is gone)                                   |
| C06-E01, C06-E02 (Backlog writing line, the +)                          | C06-E01 keeps the line's words; C06-E02 replaced by NI-E02           |
| C06-E14, C12-E01 ("Add a task")                                         | Read "New task"                                                      |
| C02-E28, C02-E35 (a project's own line)                                 | Replaced by NI-E05                                                   |
| C02-E33 (headers and the writing line level)                            | Kept, measures the line button                                       |
| C21-E06, C21-E16, C21-E30 (All spaces line, "+")                        | Go through Quick Add; land in the same space as before               |
| FX-E01..FX-E03 (placeholder paints where the label was)                 | Removed; NI-E07 checks the line never moves                          |
| SK-E03 (typing in the writing line, ⌃2)                                 | Retargeted to typing in a subtask input                              |

### Unit (vitest)

| ID     | Where                                            | Case                                                                                                                    |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| NI-U01 | `packages/ui/src/components/AddTask.test.tsx`    | A button with the label, `aria-haspopup="dialog"`; click, Enter and Space call `onOpen`; there is no textbox ever       |
| NI-U02 | `packages/ui/src/components/TaskList.test.tsx`   | `addLabel` + `onAddOpen` draws the line; click calls `onAddOpen`; no `onAddOpen`, no line; a new task gets the gap wash |
| NI-U03 | `packages/ui/src/components/TaskList.test.tsx`   | No insert slot between rows at any pause, hover or drag; the last row has no bottom border when no line follows         |
| NI-U04 | `packages/ui/src/components/TaskGroups.test.tsx` | The header "+" calls `onGroupAdd(key, group)`; a folded group stays folded; no group writing line; one end line         |
| NI-U05 | `packages/ui/src/components/QuickAdd.test.tsx`   | A seed with `day` sets the day (null shows Backlog), with `projectId` the project; an unknown project leaves none       |
| NI-U06 | `packages/ui/src/components/QuickAdd.test.tsx`   | A seed with only a title keeps the page's day and no project (Search's Create, notes keep working)                      |

### End-to-end (Playwright, web)

| ID     | Group        | Case                                                                                                                                  |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| NI-E01 | `today`      | Click "Write the next thing…": Quick Add opens on today, no textbox in the list; Add: the row is last with the wash; reload keeps it  |
| NI-E02 | `backlog`    | "Add to the Backlog…" opens Quick Add on Backlog; Add: the row is last in the Backlog, no day on the server                           |
| NI-E03 | `today`      | Hovering and pausing between rows shows no "+"; no `textbox` named New task exists anywhere on the page                               |
| NI-E04 | `today`      | Two days: tomorrow's line opens Quick Add on tomorrow and the task lands there; the Backlog beside Today's line opens on Backlog      |
| NI-E05 | `today`      | By project: Platform's "+" opens Quick Add with Platform and today; Add lands it last in Platform's group; No project's line has none |
| NI-E06 | `today`      | Enter on the focused line opens Quick Add; Esc closes it, nothing is made, focus is back on the line; Enter opens it again            |
| NI-E07 | `motion`     | The line's box is the same before, during and after the click (light and dark); the last row has no bottom border                     |
| NI-E08 | `all-spaces` | All spaces: "Add to Personal…" opens Quick Add in Personal; filtered to Northwind it opens in Northwind; it lands in that space       |
| NI-E09 | `today`      | Empty day: New task opens Quick Add on that day, no line under the empty state; the welcome's New task does the same                  |
| NI-E10 | `today`      | Phone: the line opens the Quick Add sheet on today; Add lands it                                                                      |
| NI-E11 | `today`      | Offline: the line opens Quick Add; the task shows at once and reaches the server when back                                            |
| NI-E12 | `today`      | Dark theme: the line and the empty state's New task in dark tokens                                                                    |

### Desktop (Tudu Test on the macOS CI runner)

| ID     | Case                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| NI-D01 | In the Mac app the line opens Quick Add on today and Add lands the task (existing helper path) |

### Manual (Rohit, Mac app on staging)

| ID      | Case                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| MC-NI01 | Click "Write the next thing…" a few times in a row: Quick Add opens each time with no flicker and the line never shifts |

## Risks and overlaps

- Writing several tasks in a row now takes a Quick Add round per task instead of Enter, Enter, Enter. That is the
  trade Rohit asked for; if it hurts, a later "Add and keep open" in Quick Add is the fix, not the inline field.
- The e2e helpers get slower (a dialog per title). Measured on CI in the PR; if the suite time grows a lot, setup-only
  tests can seed through the API instead.
- `QuickAddSeed.day` is shared with the "Fix Backlog empty state beside Today" work, and `QuickAdd.tsx` is also
  touched by the project-hash branch. Whichever lands second rebases; neither changes the other's behaviour.
- Removing `TaskList`'s `onAdd` breaks any caller left on it at compile time, which is the point: no list can keep
  an inline field by accident.
