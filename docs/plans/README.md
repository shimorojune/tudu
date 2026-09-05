# Tudu implementation roadmap

Source of truth for the design: `/Users/rraj/Documents/work/tudu_designs/Tudu.dc.html`.

That file is the agreed direction. The six `Tudu Day *.dc.html` files are rejected
alternates and must not be used as reference. The design system lives in
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

## Product model in one paragraph

A task belongs to exactly one of three buckets: Now, Next, Later. Priority is the
task's position in the list inside its bucket, not a separate field. A manager cannot
put anything directly into a report's day: everything a manager sends lands in the
report's Inbox, and the report accepts it into a bucket or declines it with a reason.
Every meaningful change to a task appends an event to that task's timeline. JIRA is a
tether, not a source of truth for everything: JIRA owns status and deadline, Tudu owns
bucket and order.

## Steps

| # | Step | Plan | Status |
|---|------|------|--------|
| 1 | Foundations: deps, router, theme, app shell chrome | [01-foundations.md](./01-foundations.md) | Done |
| 2 | Task data model and API | not written | Pending |
| 3 | Today screen, read only | not written | Pending |
| 4 | Task CRUD and drag to reorder | not written | Pending |
| 5 | Detail pane: Details, Comments, Timeline | not written | Pending |
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

Drizzle tables for `tasks`, `subtasks`. Bucket enum, fractional or integer ordering
within a bucket, start date, deadline, carried counters, privacy flag. Hono CRUD routes
scoped to the authenticated user. RTK Query endpoints and tags in `packages/store`. Zod
schemas in `packages/shared` reused by client and server.

Design screens covered: none visually. This is the spine for steps 3 to 12.

### Step 3: Today screen, read only

The three pane layout from A1: task list (flex), JIRA column (296px), detail inspector
(356px), with draggable dividers via `react-resizable-panels`. Now, Next and Later
bucket sections. Task row anatomy: checkbox, title, meta line. Selected row treatment.
Renders real tasks from step 2. Nothing is editable yet. The JIRA column renders the
"No JIRA connected" empty state from C6b.

Design screens covered: A1 layout, C6 first run empty state, C6b JIRA not connected.

### Step 4: Task CRUD and drag to reorder

Create, rename, complete, delete. Subtask list. The add row at the bottom of the list.
Drag to reorder within a bucket and drag across buckets, using `@dnd-kit`. Optimistic
updates through RTK Query. This is the first step where the app is genuinely usable.

Design screens covered: A1 interactions, the add row, subtask rows.

### Step 5: Detail pane: Details, Comments, Timeline

Tables for `comments`, `timeline_events`, `attachments`. The three tabs from A3. The
timeline is append only and every mutation from step 4 onward writes to it. Attachments
support drop and paste. The visibility footer with "Make private".

Design screens covered: A1 detail pane, A3 Comments, A3 Timeline.

### Step 6: Rollover, carry dots, slipping

A server side job at the configured day start time that moves unfinished tasks forward
and increments `carried_days`. The dismissible rollover banner, the carry dots, the
"Push all to Later" bulk action, and the slipping rule (carried two days or more, or
past deadline).

Design screens covered: A2 Rollover.

### Step 7: Week view and drag to reschedule

Seven column grid, Monday to Sunday. Today column highlight. Task cards placed by
scheduled day. Drag a card to another day to reschedule, option drag to copy. Week
picker popover and jump to this week.

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

## Screens deliberately left out of the roadmap

`C4 Create account` and `C4 Sign in` are already handled by Clerk's hosted components.
Restyling them to match the mockup is a Clerk `appearance` prop exercise and can be
folded into step 11.
