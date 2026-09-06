# Tudu implementation roadmap

Source of truth for the design:
`/Users/rraj/Documents/work/tudu_designs/Tudu.artifact.html` (27 screens, decoded from the
[Claude artifact](https://claude.ai/code/artifact/26712a88-3eed-429a-b4ed-6bc11c15b3fa)).
Open the HTML file in a browser to read every screen. Canva design `DAHUWPSU1Vk` (title
"Tudu") is the upstream source. `/Users/rraj/Documents/work/tudu_designs/Tudu.dc.html` is
superseded and must not be used as reference. The six `Tudu Day *.dc.html` files are
rejected alternates. The design system lives in
`/Users/rraj/Documents/work/tudu_designs/_ds/modernist-a66f2ef5-bc24-49ae-997b-e721e12e0c64/`.

## How these plans work

Each step gets its own numbered plan file in this folder. Plans are written to be
executed by an implementation agent with no prior context, so they carry exact file
paths, exact commands, exact code and exact verification steps.

Only write the next plan once the previous step is merged. Later steps depend on
decisions made in earlier ones, so writing them early guarantees rework.

## Hard repo rules

1. **No em-dash characters anywhere in the repo.** `pnpm lint:copy` greps the whole
   working tree for U+2014 and exits non-zero if it finds one. This includes markdown,
   comments and JSX copy. Use a hyphen, a colon or a comma.
2. Commits follow conventional commits. `commitlint` runs on the `commit-msg` hook.
3. TypeScript is strict with `noUnusedLocals` and `noUnusedParameters` on. Unused
   imports and unused function parameters are build failures, not warnings.
4. Border radius is `0` everywhere. Do not reintroduce rounded corners.
5. Shared UI lives in `packages/ui`. `apps/desktop` and `apps/web` stay thin shells
   that only bootstrap React.

## Product model

### Buckets are within a day. The horizon is the date.

The date picker already answers "when". The buckets answer the one thing a date cannot:
will this actually happen today.

- **Now**: committed. You are doing this today, and if someone asks what you are
  working on, this is the answer.
- **Next**: queued for today. Starts when Now clears.
- **Later**: on today's list, but honestly first to slip.

So they are must, should and could for a single day, and they reset every morning
through rollover. They are not times of day. Any classification that needs constant
re-sorting as the day moves gets abandoned by week two.

Priority is the task's position in the list inside its bucket, never a separate field.

### Undated work lives in Unscheduled, not in Later

A task either has a day, in which case it sits in exactly one of that day's three
buckets, or it has no day, in which case it sits in the Unscheduled backlog and has no
bucket at all. Nothing else is representable: a database check constraint ties the day
and the bucket together as a pair.

This exists because Later was carrying two meanings at once, low priority today and no
date at all. It now means only the first. You drag out of Unscheduled onto a day, which
is also what makes the week view honest.

### Unscheduled is a top-level nav tab

Undated tasks live on their own route at `/unscheduled`, not inside the Today three pane
layout. The nav tab sits between Inbox and Team and shows a plain faint count of
backlog items (not Inbox's red badge). Step 7 drags from this route onto a day column.
Step 4 makes the list editable.

### Now has a soft cap of five

Five tasks, nudged and never blocked. This is the whole ballgame. Without a cap,
everything lands in Now and the buckets become decoration. With one, moving something in
forces something out, which is the actual thinking the app exists to provoke.

The cap is also what makes the manager view worth having. A report with three things in
Now is a real signal; nineteen is noise. It is what turns "move this to Now" into a
meaningful request rather than a shrug, because the manager is implicitly asking what
comes out.

The API never enforces it. Rollover has to be able to carry five unfinished Now tasks
into tomorrow, so an over-cap day must stay storable. Step 4 adds the cap badge to the
Now header (`3 / 5` at cap, `6 / 5` when over). `DEFAULT_NOW_SOFT_CAP` in
`@tudu/shared` is `5`. Step 11 turns this into a user preference in the 3 to 5 range.

### The rest

Rollover preserves the bucket: an unfinished Now returns tomorrow as Now with a carry
dot, not demoted. Three dots on a task is then a visible argument that it should be
delegated or dropped.

A manager cannot put anything directly into a report's day. Everything a manager sends
lands in the report's Inbox, and the report accepts it into a bucket or declines it with
a reason. Every meaningful change to a task appends an event to that task's timeline.

JIRA is a tether, not a source of truth for everything. JIRA owns status and deadline,
Tudu owns bucket and order. Put another way: JIRA sets the date, you set the bucket.
JIRA knows when something is due, only you know whether you are touching it today.

## Steps

| # | Step | Plan | Status |
|---|------|------|--------|
| 1 | Foundations: deps, router, theme, app shell chrome | [01-foundations.md](./01-foundations.md) | Done |
| 2 | Task data model and API | [02-task-data-model.md](./02-task-data-model.md) | Done |
| 3 | Today screen, read only | [03-today-screen.md](./03-today-screen.md) | Done |
| 4 | Task CRUD and drag to reorder | [04-task-crud-and-drag.md](./04-task-crud-and-drag.md) | Done |
| 5 | Detail pane: Details, Comments, Timeline | [05-detail-pane.md](./05-detail-pane.md) | Done |
| 6 | Rollover, carry dots, slipping | not written | Pending |
| 7 | Week view and drag to reschedule | not written | Pending |
| 8 | Command palette and keyboard shortcuts | not written | Pending |
| 9 | Manager: Inbox, roster, report's day | not written | Pending |
| 10 | JIRA integration | not written | Pending |
| 11 | Settings screens | not written | Pending |
| 12 | macOS shell: menu bar, global hotkeys, Dock badge | not written | Pending |

### Step 1: Foundations

Dependencies, a router, the extra shadcn components, theme token additions, a
light/dark/system theme provider, and the real top navigation bar from screen A1 with
four empty routes behind it. No product features. This exists so every later step has
somewhere to render.

Design screens covered: the nav chrome shared by A1, A2, A4, A5, B1, B2, C6, C7.

### Step 2: Task data model and API

Drizzle tables for `tasks` and `subtasks`. Nullable bucket enum paired to a nullable
scheduled date by a check constraint, integer ordering within a lane, start date,
deadline, carried counters, privacy flag. Hono CRUD routes scoped to the authenticated
user. RTK Query endpoints and tags in `packages/store`. Zod schemas in
`packages/shared` reused by client and server.

A lane is the triple `(userId, scheduledDate, bucket)`, and both nulls together are the
Unscheduled lane. One reorder endpoint rewrites whole lanes, which covers reordering,
moving across buckets, scheduling out of Unscheduled, unscheduling, and step 7's move
to another day.

Design screens covered: none visually. This is the spine for steps 3 to 12.

### Step 3: Today screen, read only

The three pane layout from A1: task list (flex), JIRA column (296px), detail inspector
(356px), with draggable dividers via `react-resizable-panels`. Now, Next and Later
bucket sections with context-aware labels. Task row anatomy: checkbox, title, meta
line. Selected row treatment. Renders real tasks from step 2. Nothing is editable yet.
The JIRA column renders the "No JIRA connected" empty state from C6b. A new
`/unscheduled` route and nav tab list the backlog. When Now is empty but Next has
tasks, a one-line prompt offers to pull the next thing in (inert until step 4).

Design screens covered: A1 layout, C6 first run empty state, C6b JIRA not connected.

#### Step 3 decisions (settled)

**1. Unscheduled lives on its own nav tab** at `/unscheduled`, between Inbox and Team,
with a faint count badge. Not a fourth pane, not a strip under Today.

**2. Bucket labels are context-aware.** Today shows Now / Next / Later. Any other
selected date shows Priority 1 / 2 / 3. Stored enum values stay `now | next | later`.
One label resolver in `packages/ui` serves step 11's rename preference later.

**3. No auto-pull when Now empties.** Show a prompt: "Now is clear. Pull the next thing
in?" Step 4 wires the button to the reorder endpoint. No schema change.

### Step 4: Task CRUD and drag to reorder

Create, rename, complete, delete. Subtask list with add and toggle. The add row at the
bottom of the list. Drag to reorder within a bucket and drag across buckets, using
`@dnd-kit`. Optimistic updates through RTK Query. This is the first step where the app
is genuinely usable.

Design screens covered: A1 interactions, the add row, subtask rows, A2b Now cap badge.

#### Step 4 decisions (settled)

**1. Rename and delete live in a right-click menu** on the row. Double-click the title
renames in place. The menu also carries Move to Now / Next / Later and Unschedule (or
Schedule to today on the Unscheduled route).

**2. Completing a task leaves it in place**, struck through and faded. It does not sink
to the bottom of its bucket.

**3. New tasks from the add row land at the bottom of Later** on whichever date is
selected (or undated on the Unscheduled route).

**4. Add a subtask** is a faint line at the bottom of the expanded subtask list on the
selected row only.

**5. Subtasks stay folded** behind the `2 of 3` count on unselected rows. No expand
chevron.

**6. Delete asks first** via the existing `alert-dialog` component. The database
soft-deletes; there is no restore endpoint, so no Undo toast.

**7. The drag handle is always visible** on every row, not only the selected row.

**8. The Now soft cap is five**, matching the mockup badge (`3 / 5`, over-cap `6 / 5`).
`DEFAULT_NOW_SOFT_CAP` changes from `3` to `5`.

### Step 5: Detail pane: Details, Comments, Timeline

Tables for `comments` and `timeline_events`. The three inspector tabs become real:
Details gains a "Latest" preview and a "Make private" footer; Comments is a working
thread (single-player until step 9); Timeline is append-only and records every task-level
change from this step onward. Attachments are deferred to their own later step (no file
storage exists yet).

Design screens covered: A1 detail pane (Latest block), A3 Comments, A3 Timeline.

#### Step 5 decisions (settled)

**1. Attachments deferred.** No S3, no disk volume in `docker-compose.yml`, Neon Postgres
only. File upload, drop zone, and paste become their own step once real storage is chosen.

**2. Comments built now, single-player.** The thread works for one user today. Step 9 adds
the manager and the "notified in Tudu" footer.

**3. Timeline records task-level changes only.** Created, renamed, completed, reopened,
moved, rescheduled, deadline/start/privacy changed, commented, comment edited, comment
deleted. Subtask ticks are ignored.

**4. No JIRA row and no "Shared with" row in Details.** Those belong to steps 10 and 9.
The "Latest" two-event preview and the "Make private" footer are built now.

**5. `commentCount` on the task payload.** The Comments tab badge is correct the moment
the pane opens, without a separate count fetch.

**6. Tab choice is sticky across task selection.** If you are on Timeline and click
another task, you stay on Timeline.

**7. Comments can be edited and deleted.** Edit is in-place (same contentEditable pattern
as task rename). A faint "edited" marker appears next to the timestamp. Delete asks first
via `alert-dialog`. Both write timeline rows.

**8. Synthetic "Created" for old tasks.** Tasks that existed before step 5 show a Created
line built from `task.createdAt`. No backfill migration.

**9. Timeline loads newest 50 with "Show older".** Keeps the pane fast on long-lived tasks.

**10. Task change and timeline row go out as one `db.batch()`.** Neon HTTP has no
interactive transactions; batch is the atomic substitute.

**11. The X on the tab strip clears the selection.** Shows the empty inspector pane.

**12. Composer placeholder is "Add a comment…".** Enter sends, Shift+Enter inserts a
newline. One row per timeline change (no merging "set deadline and commented" into one
sentence).

### Step 6: Rollover, carry dots, slipping

A server side job at the configured day start time that moves unfinished tasks forward
and increments `carried_days`. The dismissible rollover banner, the carry dots, the
"Push all to Later" bulk action, and the slipping rule (carried two days or more, or
past deadline).

Design screens covered: A2 Rollover.

### Step 7: Week view and drag to reschedule

Seven column grid, Monday to Sunday. Today column highlight. Task cards placed by
scheduled day. Drag a card to another day to reschedule, option drag to copy. Drag from
the Unscheduled route onto a day column to schedule. Week picker popover and jump to
this week.

Design screens covered: A5 Week.

### Step 8: Command palette and keyboard shortcuts

`cmdk` command palette on Cmd K. Quick add on Cmd N. The full in app shortcut map. This
comes after the actions exist so the palette has something to call.

Design screens covered: A4 palette shell, C8 Quick add (in app portion only).

### Step 9: Manager: Inbox, roster, report's day

Tables for `manager_links`, `manager_permissions`, `inbox_items`, `manager_invites`.
Accept into a bucket or decline with a reason. Team roster with per report counts.
Read only view of a report's day plus the send a task form. Permission checks on every
query. Private tasks are never visible to a manager.

Design screens covered: B1 Inbox, B2 Team roster, B3 Report's day, C5 Manager invite.

### Step 10: JIRA integration

Server side Atlassian proxy, because a browser cannot call the Atlassian API directly.
Connection storage, a pull loop on an interval, the JIRA column populated, the link
palette on Cmd L, create and link, and the conflict rule (JIRA wins status and deadline,
Tudu wins bucket and order, everything logged to the timeline).

Design screens covered: A1 JIRA column, A4 Link to JIRA, C2 Settings JIRA,
C6b all three JIRA empty states.

### Step 11: Settings screens

Five settings pages behind a 214px sidebar: General, Account, JIRA, Manager,
Notifications. Mostly forms over preferences written in earlier steps.

Design screens covered: C1, C2, C3, C3b, C3c.

### Step 12: macOS shell

Tauri and Rust work, separate from React: menu bar popover with the compact day
summary, global hotkeys that work with the app closed, Dock badge showing the Inbox
count only, and native notifications with inline accept actions.

Design screens covered: C8 Menu bar, C8 Quick add (global portion), C8 Notification,
C8 Dock icon.

## Design deviations

The mockup is the source of truth, with these recorded exceptions. Do not "fix" the
code back to the mockup on any of these points.

1. **A5's footer copy is superseded.** It reads "Unscheduled tasks stay in Later until
   you give them a day". Undated tasks now live on the Unscheduled route and never
   appear in a day's Later. See the product model above for why.
2. **Unscheduled is a nav tab, not drawn inside A1's three panes.** The latest artifact
   shows the tab in the top bar with a faint count. The day list pane stays three
   buckets only.
3. **Per-bucket empty lines when a day has no tasks in one bucket.** Not drawn in A1.
   Step 3 shows one faint placeholder line per empty bucket when the user has tasks
   elsewhere.
4. **Task row hover tint.** The mockup does not specify hover. Step 3 uses a 2% ink
   tint (`bg-foreground/[0.02]`).
5. **Context-aware bucket labels on non-today dates.** Priority 1 / 2 / 3 instead of
   Now / Next / Later when `selectedDate !== today`.
6. **The macOS title bar with traffic lights is not built.** A1 draws it for context.
   The operating system draws it in the real app.
7. **Rollover preserves the bucket.** An unfinished Now returns as Now with a carry dot.
   The mockup's A2 does not state this either way.
8. **The first nav tab is a dynamic day label, not the fixed word "Today".** It reads
   Today, Tomorrow, or Yesterday, and falls back to a short date such as "Sun 6 Sep"
   further out, matching `DateNav`'s format. The mockup always draws it as "Today".
   The tab width animates when the label changes so the tabs after it slide instead
   of snapping. The Unscheduled count carries `min-w-[15px]` so Team does not nudge
   when the count crosses two digits.
9. **The drag handle is always visible.** The mockup draws it only on the grabbed row,
   but the row grid silently changes width on select, which is bad UX. Step 4 uses one
   grid (`13px 19px minmax(0,1fr)`) for every row. The handle is a fixed 18×9px box
   centred on the checkbox so it does not stretch when the row expands. Horizontal
   padding stays `px-[28px]` on select; the 2px selection bar is an overlay-only
   pseudo-element, not inset shadow that steals layout space. Vertical padding still
   shifts slightly on select (`15px` to `14px`, or `12px` on Later rows), but it
   transitions over the same 200ms ease-out as the subtask panel so selecting a row
   does not snap its height.
10. **Drop feedback is invented.** The mockup footer lists drag states as future work.
    Step 4 reorders the real list under the cursor so the row you drag is already
    sitting where it will land, tints the target bucket at 3% ink, and uses
    translate-only motion so rows slide instead of scaling. The pending order lives
    in one ids-per-bucket map, so the preview and the saved order cannot disagree.
    Three dnd-kit settings are load-bearing and easy to lose: `onDragMove` (not just
    `onDragOver`, which only fires when the hovered row changes, so crossing a row
    midpoint never re-targeted), `MeasuringStrategy.Always` (the preview reflows the
    list, so rects measured once at drag start go stale), and re-targeting only when
    the pointer itself moved (a reflow re-fires targeting under a still cursor and
    the row flip-flops between buckets). Each bucket droppable covers its whole
    section including the header, otherwise the header is a dead band where
    targeting falls back to guesswork. Drops on bucket chrome (header, gaps above
    the first row or below the last) resolve to the nearest row slot from pointer Y,
    not always the bottom. Collision never returns the dragged row: when only its
    invisible slot is under the pointer, the bucket droppable wins and placement
    resolves from pointer Y. Sortable strategy transforms are off because the DOM
    reorder is the preview; sibling rows slide into place via a 180ms FLIP hook that
    fires only when a row's position in the bucket order changes, so expand and
    collapse is left entirely to the CSS height transition. The dragged row stays in
    the list as a collapsed-height faint slot (`bg-foreground/[0.04]`), not an
    invisible full-height hole; the `DragOverlay` carries the title.
    `DragOverlay` uses `dropAnimation={null}`: the default 250ms fly-back animates
    the ghost to the row's start position while the live preview already shows it at
    the drop spot, so the ghost looks like a duplicate bouncing home.
11. **Completed parent tasks get strikethrough and fade.** The mockup only draws
    completed subtasks this way. Parent tasks stay in place when ticked; they do not
    sink to the bucket bottom. Step 4 uses a 220ms strike sweep across the title
    (not a static `line-through`) plus a checkbox fill fade. Subtasks use the same
    sweep and fade.
12. **Rename and delete live in a right-click menu.** The mockup draws neither. Click
    the title on a selected row to rename in place on the same contentEditable node,
    so the row does not reflow; Delete opens a confirm dialog.
13. **"Add a subtask" line on the selected row.** The mockup draws subtasks but no way
    to add one. Step 4 adds a faint affordance at the bottom of the expanded list.
    The panel expands with a 200ms height transition; subtask create is optimistic so
    the new row appears as soon as Enter is pressed. Click a subtask title to rename
    it in place on the same contentEditable node, same as the parent task.
14. **C6 first-run tip copy says Later, not Next.** The mockup's numbered tip originally
    said Next; product decision is Later for the add row default.
15. **Attachments cut from step 5.** The mockup's ATTACHMENTS block and comment paste
    affordance are deferred until a real storage backend exists. Step 5 builds Comments
    and Timeline without file upload.
16. **Comment composer says "Add a comment…".** The mockup draws "Reply to Marcus…".
    Neutral copy until step 9 adds the manager.
17. **No "Marcus is notified in Tudu" footer on Comments.** That line belongs to step 9.
    Step 5 omits the Comments tab footer entirely.
18. **Visibility footer reads "Only you can see this task".** The mockup draws "Marcus
    can see this task" with a manager name. Step 5 uses owner-only copy until step 9.
19. **No JIRA or Shared with rows in Details.** Those fields appear in steps 10 and 9.
    Step 5 keeps Bucket, Start, Deadline, Carried, and the private badge only.
20. **One timeline row per change.** The mockup merges "set the deadline to today 18:00,
    and commented" into one sentence. Step 5 writes separate rows so the diff builder
    stays simple and never wrong.
21. **Comments are editable and deletable.** The mockup draws no edit or delete controls.
    Step 5 adds in-place edit (contentEditable), a faint "edited" marker, delete with
    confirm, and matching timeline rows.
22. **Timeline pages at 50 with "Show older".** The mockup does not draw paging. Step 5
    loads the newest 50 events and appends older pages on demand.
23. **Synthetic Created line for pre-step-5 tasks.** No backfill migration. The UI
    renders a Created event from `task.createdAt` when the timeline table has no
    `created` row for that task.
24. **The inspector close X is wired.** A1 draws an X on the tab strip. Step 3 left it
    out. Step 5 clears `selectedTaskId` on click.

## Screens deliberately left out of the roadmap

`C4 Create account` and `C4 Sign in` already exist as hand rolled forms over Better
Auth, at `packages/ui/src/routes/SignInRoute.tsx` and `SignUpRoute.tsx`. They are not a
hosted component: Clerk was removed in 0.3.0. Styling them to match the mockup is
ordinary form work and can be folded into step 11.
