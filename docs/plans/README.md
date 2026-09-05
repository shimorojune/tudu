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

### Now has a soft cap

Three to five, nudged and never blocked. This is the whole ballgame. Without a cap,
everything lands in Now and the buckets become decoration. With one, moving something in
forces something out, which is the actual thinking the app exists to provoke.

The cap is also what makes the manager view worth having. A report with three things in
Now is a real signal; nineteen is noise. It is what turns "move this to Now" into a
meaningful request rather than a shrug, because the manager is implicitly asking what
comes out.

The API never enforces it. Rollover has to be able to carry five unfinished Now tasks
into tomorrow, so an over-cap day must stay storable.

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
bucket sections. Task row anatomy: checkbox, title, meta line. Selected row treatment.
Renders real tasks from step 2. Nothing is editable yet. The JIRA column renders the
"No JIRA connected" empty state from C6b.

Design screens covered: A1 layout, C6 first run empty state, C6b JIRA not connected.

#### Open questions for step 3

Settled during step 2 planning that these are real decisions, and deliberately left
open. Raise all three before writing `03-*.md`. Do not let an implementation default
answer them silently.

**1. Where the Unscheduled list lives.** A1 has three panes and draws no backlog
surface anywhere. Candidates: a fourth pane, a collapsible strip under the day list, or
a popover. Whatever it is, step 7 drags out of it onto a day, so it cannot be
Today-only.

**2. What the buckets are called on a day that is not today.** "Now" and "Next" are
today words and read wrong on tomorrow or last Tuesday. Something like Priority 1, 2, 3
reads better there.

This is a label problem, not a data problem, and the design already agrees: C1 has a
"Bucket names" row reading "Now · Next · Later" with a "Rename…" affordance, so those
words were always user-editable labels over three fixed slots. The stored enum values
stay `now | next | later` as stable slot ids. Step 3 adds one label resolver, which
then also serves step 11's rename preference.

**3. What happens when Now empties.** Auto-pulling the top of Next into Now is the
obvious move and it is probably wrong. The cap only works because moving something into
Now forces something out; if Now refills itself the moment it clears, it stops being a
commitment and becomes a queue that tops itself up. It would also write a surprise
timeline event on every completion.

The middle path is a prompt: Now is clear, pull the next thing in, one click, user still
decides. Either way it is built on the reorder endpoint from step 2, so no schema
change rides on this.

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

## Design deviations

The mockup is the source of truth, with these recorded exceptions. Do not "fix" the
code back to the mockup on any of these points.

1. **A5's footer copy is superseded.** It reads "Unscheduled tasks stay in Later until
   you give them a day". Undated tasks now live in the Unscheduled backlog and never
   appear in a day's Later. See the product model above for why.
2. **A1 gains an Unscheduled surface that the mockup does not draw.** Follows from the
   point above. Step 3 decides its shape.
3. **Now carries a soft cap the mockup does not show.** Three to five, nudge only.
4. **The macOS title bar with traffic lights is not built.** A1 draws it for context.
   The operating system draws it in the real app.
5. **Rollover preserves the bucket.** An unfinished Now returns as Now with a carry dot.
   The mockup's A2 does not state this either way.

## Screens deliberately left out of the roadmap

`C4 Create account` and `C4 Sign in` already exist as hand rolled forms over Better
Auth, at `packages/ui/src/routes/SignInRoute.tsx` and `SignUpRoute.tsx`. They are not a
hosted component: Clerk was removed in 0.3.0. Styling them to match the mockup is
ordinary form work and can be folded into step 11.
