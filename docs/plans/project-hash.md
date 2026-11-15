# Pick a project while you write: # in a task's title

Status: proposal, awaiting approval. Canvas approved 15 Nov 2026 ("looks good", option A of three): Quick Add page,
boards `Q-Hash`, `Q-HashStates`, `Q-HashNotes`, light and dark, canvas Version 269. No code until this is approved.

## 1. What the person gets

Setting a project today means leaving the title: Quick Add's Project chip, or the task's panel after it exists. The
writing lines on a day, the Backlog and All spaces have no way to set one at all.

- **Type `#` in a title** (at its start or after a space) and a small menu opens under the `#`: the projects of the
  space the task goes to, headed "Projects in Northwind". It is the design system's menu, with the same rows and dots
  as the Project picker.
- **Letters after the `#` narrow it.** A project matches when its name, or any word in it, starts with them
  (`#off` finds Offsite 2027). The matched letters are bold. The first match is lit.
- **↑ ↓ move, Enter or Tab picks, Esc closes.** Typing a space right after an exact name (`#home `) picks it without
  the menu. Clicking a row picks it too. While the menu is open, Enter never adds the task: one Enter picks, the next
  adds.
- **The `#word` leaves the title.** "Review the release notes #pla" becomes "Review the release notes", and the
  cursor stays where it was.
- **Where the project shows:**
  - **Quick Add** (web, the Mac Quick Add window, phones): the Project chip you already have takes it, with its usual
    width ease and one selection wash. The chip still opens the full picker.
  - **Writing lines** (the line at the foot of a day, the line between two rows, a project group's own line, the
    Backlog, Backlog beside, All spaces): a quiet pill at the end of the line, dot and name. × or ⌫ at the very start
    of the line drops it. Enter adds the task with that project and the line comes back empty (with no pill, or the
    group's pill on a group's line).
  - **A project group's line** (By project, PR #108) starts with that group's pill. `#` swaps it, and the task then
    lands in the group it was given.
- **Esc keeps the `#` as text.** The same `#` does not reopen the menu while you keep typing after it. A `#` right
  before a digit (`#92`) or in the middle of a word never opens it, and pasted text is never read for `#`.
- **No match:** the menu says "No project called garden" and offers **New project Garden** (first letter made a
  capital). Enter makes it with the next free colour, exactly as "New project…" in the picker does, and picks it. It
  is offered only when nothing matches, so a half-typed name never makes a stray project.
- **All spaces:** the menu lists the projects of the space the task will be written to (Quick Add's "In" chip; on a
  writing line, Personal or the filtered space; on a group's line, that group's space).
- **Tudu MCP server:** no `#` reading on the server. `create_task` and `update_task` gain an optional `project` (a
  name, any case); `update_task` takes `"none"` to clear it. An unknown name fails with the space's project names so
  the AI app can retry. `list_spaces` lists each space's projects.

Only `#` is ever read in a title. Dates and times stay on their pickers (the times proposal keeps Quick Add free of
date words), and `@` stays free for people later.

Decisions I assumed from the boards, since none was objected to. Say so if any is wrong:

1. The menu shows the space's projects in their Settings order, not most-used first.
2. New project from `#` is offered (only when nothing matches).
3. Picking a second project replaces the first; a task has one project.
4. Tab picks while the menu is open (it would otherwise move focus off the title).

Out of scope: reading `#` anywhere other than a task's title (subtasks, notes, renaming a task in its panel), other
tokens (dates, people), and showing `#` hints in the placeholder.

### One change from the boards

The "Making Garden…" state on `Q-HashStates` does not happen in the app: projects are made on this device first and
synced after (`taskStore.createProject` is instant, as in the picker), so the row picks at once. I'll take that cell
off the boards after approval. The error state stays, for the one refusal that is known at once: a name over 60
characters ("Project names can be up to 60 characters"). A refusal from the server later is handled the way every
refused save is today.

## 2. States

| State                      | What shows                                                                    |
| -------------------------- | ----------------------------------------------------------------------------- |
| Just opened                | All the space's projects, first lit, under the `#`.                           |
| Narrowed                   | The matches, bold letters, first lit.                                         |
| No match                   | "No project called garden" and New project Garden, lit.                       |
| Error                      | A red line folds in under the New project row; the title keeps its `#garden`. |
| Empty (space has none)     | "No projects in Personal yet. Write a name after the # to make one."          |
| Loading (projects not in)  | Three shimmer rows; Enter waits. Rare: projects come with the space.          |
| No room below the line     | The menu opens above the line, so the list never scrolls (Rohit, 15 Nov).     |
| Phone                      | Opens above the title, 44px rows.                                             |
| Picked                     | Quick Add: the chip fills. Writing line: the pill at the end.                 |
| Offline                    | Everything works; a project made offline syncs with the task, in order.       |
| Saving / added (Quick Add) | The menu cannot open while Quick Add saves or confirms.                       |

Light and dark use the same tokens as the menus already shipped.

## 3. Motion

| What               | How                                                                        |
| ------------------ | -------------------------------------------------------------------------- |
| Menu opens         | `tp-pop-in`, dur-menu 160ms, ease-arrive (from above when it opens upward) |
| Narrowing          | No animation; the lit row's wash moves with dur-menu                       |
| Pick, Quick Add    | The chip's width ease (exists) + a selection wash, 700ms ease-settle       |
| Pick, writing line | The pill slides 6px in from the left and fades in, dur-menu                |
| Menu closes        | `tp-pop-out` 130ms ease-leave                                              |
| Pill dropped       | Shrinks and fades, 150ms ease-leave                                        |
| Error line         | `tp-label-in`                                                              |
| Reduced motion     | Fades only, no wash                                                        |

## 4. How it is built

No server or database change. The task's project already travels with `task.create` (`projectId`) and
`task.project`.

### 4.1 Core (`packages/core`)

- `projectHash.ts`: pure helpers. `hashAt(text, caret)` finds the `#word` the caret is in (null for `#9…`, mid-word
  `#`, or none); `hashMatches(projects, q)` orders name-prefix matches before word-prefix matches; `dropHash(text,
token)` takes the `#word` out and returns the new text and caret, closing up spaces; `exactProject(projects, q)`.
  New project names reuse `projectNamed`, `nextProjectColor` and `PROJECT_NAME_MAX`.

### 4.2 Design system (`packages/ui`)

- `useProjectHash` (lib) and `ProjectHashMenu`: the menu, its keys, placement under the `#` (measured from the
  field's font), the flip above when the nearest scrolling box has no room, Esc memory, still states for the kit.
- `AddTask` gains `projects`, `project` (the line's starting project), `spaceName`, `onNewProject`, and `onAdd(text,
projectId)`. It becomes a controlled input (needed to take the `#word` out). New `ProjectPill` at the line's end.
  The baseline layout from #108 stays; the pill is centred on the line.
- `TaskList` and `TaskGroups` pass those through; `onAdd` gains the project. A group's line starts with the group's
  project.
- `QuickAdd`: the title runs `useProjectHash`; a pick sets the existing `projectId`; the Project chip gets the
  one-off wash class.
- CSS in `components.css`: `.tp-hm*`, `.tp-pill-proj`, keyframes; reduced-motion rules.

### 4.3 App (`apps/web`)

- Today (day, 2 days, All spaces), Backlog page, Backlog beside: pass the target space's projects, its name and
  `taskStore.createProject` to the lines; `onAdd` passes `projectId` into `taskStore.create` (`extra`), overriding
  the group's.
- Quick Add (`app/quickAdd.tsx`, Quick Add page, Mac window): already passes `projects` and `onNewProject`; pass the
  space name and the loading flag.
- No change to the Mac app's Rust side.

### 4.4 MCP server (`apps/mcp`)

- `create_task`: optional `project`; resolved through `GET /api/spaces/:spaceId/projects` (case-insensitive exact
  name), sent as `projectId` on `task.create`. `update_task`: `project` or `"none"` sends `task.project`.
- `list_spaces`: each space's projects (names, colours).
- Unknown name: a tool error listing the space's project names. Never creates a project.

### 4.5 After merge

Sync the DS artifact (new pieces in its hand-written bundle, the AddTask/QuickAdd changes, README lines), turn the
canvas draft boards into shipped ones (drop the Making cell and the Draft labels), and fold the `#` behaviour into
the Quick Add, Today and Backlog prototypes.

## 5. Test scenarios

Ids `PH-…` come from this plan (like `RM-` and `SK-`), listed in `docs/tests/project-hash.md`. All run on PR CI
(Actions › Flake check for repeats), not on Rohit's Mac.

### New, unit (vitest)

| ID     | Where                         | Case                                                                                  |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------- |
| PH-U01 | `core/projectHash.test.ts`    | `hashAt`: start of title, after a space, caret mid-word, `#92`, `a#b`, two `#`s       |
| PH-U02 | `core/projectHash.test.ts`    | `hashMatches`: name prefix before word prefix, case-insensitive, empty query = all    |
| PH-U03 | `core/projectHash.test.ts`    | `dropHash`: start, middle and end of the title; spaces close up; caret position       |
| PH-U04 | `ui/ProjectHashMenu.test.tsx` | Typing `#` opens it with the space heading and the first row lit; letters narrow it   |
| PH-U05 | `ui/ProjectHashMenu.test.tsx` | ↑ ↓ wrap; Enter and Tab pick; a click picks; Enter never reaches the field's own add  |
| PH-U06 | `ui/ProjectHashMenu.test.tsx` | Esc closes and keeps `#`; that `#` stays closed while typing on; a new `#` opens      |
| PH-U07 | `ui/ProjectHashMenu.test.tsx` | `#home ` + space picks an exact match; a partial match types the space                |
| PH-U08 | `ui/ProjectHashMenu.test.tsx` | No match: New project row; picks the made project; over 60 characters shows the error |
| PH-U09 | `ui/ProjectHashMenu.test.tsx` | Empty space and loading states; Enter waits while loading                             |
| PH-U10 | `ui/ProjectHashMenu.test.tsx` | Flips above when the scrolling box has no room below; never grows its scroll height   |
| PH-U11 | `ui/AddTask.test.tsx`         | Pick shows the pill; Enter adds with the project; × and ⌫ at the start drop it        |
| PH-U12 | `ui/AddTask.test.tsx`         | A line with a starting project keeps it after each add; `#` swaps it                  |
| PH-U13 | `ui/QuickAdd.test.tsx`        | Pick fills the Project chip and takes the `#word` out; no menu while saving           |
| PH-U14 | `ui/QuickAdd.test.tsx`        | Switching the space drops a project not in it (existing rule still holds after `#`)   |
| PH-U15 | `mcp/tools.test.ts`           | `create_task` with project; `update_task` project and `"none"`; unknown name errors   |
| PH-U16 | `mcp/tools.test.ts`           | `list_spaces` lists projects                                                          |

### New, end-to-end web (Playwright)

| ID     | Where                        | Case                                                                                            |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| PH-E01 | `tests/quick-add/hash.spec`  | Quick Add: `#pla` Enter, Enter: the task is on Today in Platform, titled without `#pla`         |
| PH-E02 | `tests/quick-add/hash.spec`  | Quick Add: `#garden` makes Garden, the task has it, Settings › Projects lists it                |
| PH-E03 | `tests/today/hash.spec`      | Today's writing line: pill, Enter, the row shows the project; the line comes back empty         |
| PH-E04 | `tests/today/hash.spec`      | The line between two rows takes `#` and the task lands there with its project                   |
| PH-E05 | `tests/today/hash.spec`      | By project: a group's line starts with its pill; `#` to another project lands in that group     |
| PH-E06 | `tests/today/hash.spec`      | Menu at the foot of a long day opens above; the list's scrollTop and scrollHeight do not change |
| PH-E07 | `tests/today/hash.spec`      | `Fix #92` and an Esc'd `#word` are saved as typed                                               |
| PH-E08 | `tests/backlog/hash.spec`    | Backlog page and Backlog beside lines take `#`                                                  |
| PH-E09 | `tests/all-spaces/hash.spec` | All spaces: the menu lists the target space's projects; the task goes there with the project    |
| PH-E10 | `tests/quick-add/hash.spec`  | Phone size: the menu opens above the title; a tap on a row picks                                |
| PH-E11 | `tests/today/hash.spec`      | Offline: a task with a project made by `#` syncs both when back online                          |

### New, desktop (Tudu Test on the macOS CI runner)

| ID     | Where                         | Case                                                                                 |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| PH-D01 | `mac/tests/project-hash.spec` | The Quick Add window: `#` menu opens inside the window; Enter picks and does not add |

### Updated

- `AddTask.test.tsx` and `TaskList`/`TaskGroups` add tests: `onAdd` now has a second argument (project).
- `C02-E26..E35` (group lines, #108): a group's line now shows its pill; assertions on the line's text move from
  the input to the input plus pill.
- `docs/tests/mcp-server.md`: tool list shows `project` on `create_task` and `update_task`.

### Manual (yours, on staging)

- **MC-PH01**, Mac Quick Add window: type `#` and pick with the keyboard; check the menu is not clipped by the
  window and reads right in dark mode.
- **MC-PH02**, Today on the Mac app: a long day, writing line at the foot, `#`: the menu opens above and nothing
  scrolls.

## 6. Risks

- **A title that really starts a word with `#`** (`#hashtag`, `C#` is safe since mid-word): one Esc keeps it.
  PH-E07 guards the save.
- **Menu placement from font metrics:** measured with canvas `measureText` on the field's own font; off by a pixel or
  two at worst. The menu also stays inside the window (Linger's edge shift).
- **Controlled AddTask:** it was uncontrolled; IME composition and the line between two rows need care. Composition
  events are skipped while `isComposing`.
- **Shared component change:** every list gets `#` at once; the props are optional, so a list that passes no
  projects (Jira's add line, Inbox) behaves exactly as now.
- **Parallel work:** the times proposal touches QuickAdd's chips, not its title. Whichever merges second rebases.

## 7. Release

No migration, no new settings, no server change beyond the MCP server. Ships with the next web, Mac and MCP release.
