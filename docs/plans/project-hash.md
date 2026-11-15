# Pick a project while you write: # in a task's title

Status: approved 15 Nov 2026 ("looks good"), being built. Canvas approved 15 Nov 2026 ("looks good", option A of
three): Quick Add page, boards `Q-Hash`, `Q-HashStates`, `Q-HashNotes`, light and dark, canvas Version 269.

Scope change, 15 Nov: inline task entry (the writing lines) is being removed in its own thread, leaving Quick Add as
the one place to write a task. So `#` ships in Quick Add and the MCP server only; the writing-line pill and the
group line's starting pill are out. Their code is in this branch's history (commit `b7fa22a`) if that changes.

## 1. What the person gets

Setting a project today means leaving the title: Quick Add's Project chip, or the task's panel after it exists.

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
- **Where the project shows:** Quick Add (web, the Mac Quick Add window, phones): the Project chip you already have
  takes it, with its usual width ease and one selection wash. The chip still opens the full picker.
- **Esc keeps the `#` as text.** The same `#` does not reopen the menu while you keep typing after it. A `#` right
  before a digit (`#92`) or in the middle of a word never opens it, and pasted text is never read for `#`.
- **No match:** the menu says "No project called garden" and offers **New project Garden** (first letter made a
  capital). Enter makes it with the next free colour, exactly as "New project…" in the picker does, and picks it. It
  is offered only when nothing matches, so a half-typed name never makes a stray project.
- **Which space:** the menu lists the projects of the space the task will be written to (Quick Add's "In" chip).
  Switching that space leaves the other space's project behind: it is never sent with the task.
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
| No room below the title    | The menu opens above the title, so nothing scrolls (Rohit, 15 Nov).           |
| Phone                      | Opens above the title, 44px rows.                                             |
| Picked                     | The Project chip fills.                                                       |
| Offline                    | Everything works; a project made offline syncs with the task, in order.       |
| Saving / added (Quick Add) | The menu cannot open while Quick Add saves or confirms.                       |

Light and dark use the same tokens as the menus already shipped.

## 3. Motion

| What            | How                                                                        |
| --------------- | -------------------------------------------------------------------------- |
| Menu opens      | `tp-pop-in`, dur-menu 160ms, ease-arrive (from above when it opens upward) |
| Narrowing       | No animation; the lit row's wash moves with dur-menu                       |
| Pick, Quick Add | The chip's width ease (exists) + a selection wash, 700ms ease-settle       |
| Menu closes     | `tp-pop-out` 130ms ease-leave                                              |
| Error line      | `tp-label-in`                                                              |
| Reduced motion  | Fades only, no wash                                                        |

## 4. How it is built

No server or database change. The task's project already travels with `task.create` (`projectId`) and
`task.project`.

### 4.1 Core (`packages/core`)

- `projectHash.ts`: pure helpers. `hashAt(text, caret)` finds the `#word` the caret is in (null for `#9…`, mid-word
  `#`, or none); `hashMatches(projects, q)` orders name-prefix matches before word-prefix matches; `dropHash(text,
token)` takes the `#word` out and returns the new text and caret, closing up spaces; `exactProject(projects, q)`.
  New project names reuse `projectNamed`, `nextProjectColor` and `PROJECT_NAME_MAX`.

### 4.2 Design system (`packages/ui`)

- `useProjectHash` (lib): the menu, its keys, placement under the `#` (measured from the field's font), the flip
  above when the nearest scrolling box has no room, Esc memory. Any title field can use it.
- `QuickAdd`: the title runs `useProjectHash`; a pick sets the existing `projectId`; the Project chip gets the
  one-off wash class. New props `spaceName` and `projectsLoading`. It only sends a `projectId` that is one of its
  `projects` (the space's), so a space switch never sends the last space's project.
- CSS in `components.css`: `.tp-hm*`, keyframes; reduced-motion rules.

### 4.3 App (`apps/web`)

- Quick Add (`app/quickAdd.tsx`, Quick Add page, Mac window): already passes `projects` and `onNewProject`; pass the
  space name and the loading flag.
- No change to the Mac app's Rust side.

### 4.4 MCP server (`apps/mcp`)

- `create_task`: optional `project`; resolved through `GET /api/spaces/:spaceId/projects` (case-insensitive exact
  name), sent as `projectId` on `task.create`. `update_task`: `project` or `"none"` sends `task.project`.
- `list_spaces`: each space's projects (names, colours).
- Unknown name: a tool error listing the space's project names. Never creates a project.

### 4.5 After merge

Sync the DS artifact (the hook in its hand-written bundle, the QuickAdd changes, README lines), turn the canvas
draft boards into shipped ones (drop the Making cell, the writing-line cells and the Draft labels), and fold the `#`
behaviour into the Quick Add prototype.

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
| PH-U05 | `ui/ProjectHashMenu.test.tsx` | ↑ ↓ wrap; Enter and Tab pick; a click picks; Enter never reaches Quick Add's add      |
| PH-U06 | `ui/ProjectHashMenu.test.tsx` | Esc closes and keeps `#`; that `#` stays closed while typing on; a new `#` opens      |
| PH-U07 | `ui/ProjectHashMenu.test.tsx` | `#home ` + space picks an exact match; a partial match types the space                |
| PH-U08 | `ui/ProjectHashMenu.test.tsx` | No match: New project row; picks the made project; over 60 characters shows the error |
| PH-U09 | `ui/ProjectHashMenu.test.tsx` | Empty space and loading states; Enter waits while loading                             |
| PH-U10 | `ui/ProjectHashMenu.test.tsx` | Flips above when the box around it has no room below; always above on phones          |
| PH-U13 | `ui/QuickAdd.test.tsx`        | Pick fills the Project chip and takes the `#word` out; no menu while saving           |
| PH-U14 | `ui/QuickAdd.test.tsx`        | A project left from another space is not sent with the task                           |
| PH-U15 | `mcp/tools.test.ts`           | `create_task` with project; `update_task` project and `"none"`; unknown name errors   |
| PH-U16 | `mcp/tools.test.ts`           | `list_spaces` lists projects                                                          |

### New, end-to-end web (Playwright)

| ID     | Where                       | Case                                                                                    |
| ------ | --------------------------- | --------------------------------------------------------------------------------------- |
| PH-E01 | `tests/quick-add/hash.spec` | Quick Add: `#pla` Enter, Enter: the task is on Today in Platform, titled without `#pla` |
| PH-E02 | `tests/quick-add/hash.spec` | Quick Add: `#garden` makes Garden, the task has it, Settings › Projects lists it        |
| PH-E07 | `tests/quick-add/hash.spec` | `Fix #92` and an Esc'd `#word` are saved as typed; Esc closes the menu, not the bar     |
| PH-E10 | `tests/quick-add/hash.spec` | Phone size: the menu opens above the title; a tap on a row picks                        |
| PH-E11 | `tests/quick-add/hash.spec` | Offline: a task with a project made by `#` syncs both when back online                  |

### New, desktop (Tudu Test on the macOS CI runner)

| ID     | Where                         | Case                                                                                 |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| PH-D01 | `mac/tests/project-hash.spec` | The Quick Add window: `#` menu opens inside the window; Enter picks and does not add |

### Updated

- `docs/tests/mcp-server.md`: tool list shows `project` on `create_task` and `update_task`.

### Manual (yours, on staging)

- **MC-PH01**, Mac Quick Add window: type `#` and pick with the keyboard; check the menu is not clipped by the
  window and reads right in dark mode.

## 6. Risks

- **A title that really starts a word with `#`** (`#hashtag`, `C#` is safe since mid-word): one Esc keeps it.
  PH-E07 guards the save.
- **Menu placement from font metrics:** measured with canvas `measureText` on the field's own font; off by a pixel or
  two at worst. The menu also stays inside the window (Linger's edge shift).
- **IME composition:** keys are ignored while `isComposing`, so a Japanese or Chinese title never picks by accident.
- **Parallel work:** the times proposal touches QuickAdd's chips, not its title; the inline entry removal deletes the
  writing lines this no longer touches. Whichever merges second rebases.

## 7. Release

No migration, no new settings, no server change beyond the MCP server. Ships with the next web, Mac and MCP release.
