# Design deviations

Where the code departs from the canvas or the design system, and why. The app is the source of truth: when they
differ, the canvas is redrawn to match the app (decided 22 Oct 2026). The first part is the register, the state of
things today grouped by canvas page; the second is the history, one block per chunk as it was built. A chunk's PR
updates both, and the canvas's Build log sticky on the Build plan page points here.

## Register: what the canvas must show, by page

Each line is true of the app on master. A line leaves the register once the canvas draws it.

### Every page (the shell)

- The Inbox count is what's to answer plus unread, plus the macOS app's new version in team spaces. Personal's Inbox
  address goes back to Today. Jira shows in the sidebar, top bar and phone tabs only while it is connected.
- The space is in the address (`/northwind/week`, `/me/today`); the open task is too (`?task=ME-52`, `/t/ME-52`).

### 00 Foundations

- The checkbox keeps its 19px look and takes a quiet 44px target on touch screens.
- Less motion is a switch (Settings › Appearance), so the reduced-motion rules also apply under
  `:root[data-motion='less']`.

### 01 Today

- Alt with the up or down arrow moves the focused row; a screen reader hears "Moved to place 2 of 3".
- After midnight the list stays and the banner asks until 04:00; from 04:00 the app moves to the new day itself.
- Undo after moving a carried task puts it back without the "From" pill. Only the click that ends a drag is
  swallowed.

### 02 Task detail

- The ⋯ menus (panel and comment) are floating menus. Posting a comment keeps the caret in the box.
- Planned's clear label is "Move to the Backlog". Notes save on leaving the field, closing or stepping.
- Someone else's task reads as text: plain title, facts as words, Comments open.

### 03 Quick Add

- "New project…" is the project picker's last line and asks for a name on the spot; the colour is the next swatch.
- File chips show their upload as a fill and read "failed" when it fails; offline, the attach button says so. Files
  join the task as chips at the end of its notes; there is no Files section.
- "Looks like a task you have" (or "Looks like tasks you have") lists close matches by meaning.
- Personal alone gets the plain bar; a team space adds "In Northwind for Me" and Send.

### 04 Jira

- Apps and Settings › Apps are in Personal too; Personal's line leaves out "Each person connects their own."
- Custom JQL on a saved view has a quiet "Remove view" beside Cancel, with Undo.
- The Apps panel's line: "Your Jira issues beside your day. Add one to a day and it becomes a linked task."
- The phone's Jira tab reads its count as "7 new".

### 05 Week

- On phones a Backlog row has the quiet calendar button; the scroll keeps 150px free above the New task button.
- The panel's back label reads "Week" or "Backlog" when opened from the week. Past days take no drops.

### 06 Backlog

- Crossed off has its own counts: "3 crossed off", "1 crossed off in Home", "Nothing crossed off".
- The phone's More page (`/more`): Backlog, Inbox, People (team), Settings, spaces and apps. No board draws it.

### 07 Search

- Close matches come from every space you are in; a row from another space carries that space's tile and name
  before where it lives. Word matches stay in the space and include others' shared tasks.
- "Couldn’t search right now." with Try again when the search cannot run.
- The hint reads "Search your tasks by title, task ID or note." until Jira is connected.

### 08 Inbox

- Update lines are plain words ("accepted your task onto Fri 16 Oct", "declined your task: the reason").
- The address names the view and the picked item (`?view=sent`). The reading pane is blank paper until a pick.
- The macOS app's new version is an Updates item in every team space (see Desktop).

### 09 Team space

- The Members card says "Invited 18:02" (or "Just now", "Thu 10:12"), with Resend beside Cancel.
- Task prefixes: NW, PF, HM; a clash grows a letter, then a number.
- A person who left shows on People marked Left while they have shared tasks; an account without a name shows its
  email. The join page signed in with another address says so and offers the way back.

### 10 Settings

- Sections: Account, Appearance; then Space, Members (team), Apps. No Notifications row yet (chunk 14).
- Members read "Its name and colour are kept by its admins."
- Email has Change: the new address, Send code, the code field. Photo has Remove once there is one.
- The last admin's Leave asks "Make someone admin first" with Go to Members; the last person's Leave says to Delete.
- Settings is in the address: `?settings=members` on the desk and tablets, `/northwind/settings/members` on phones.

### 11 Sign in and the first run

- Sign in keeps "we" as drawn ("We’ll send you a code", "We sent a 6-digit code to …").
- On phones Getting started hides on Settings, Jira, Apps and an open task.
- An invited newcomer gets "Welcome to Northwind" over who is there, naming who sent the invite.

### Desktop (macOS app, no page yet)

- No title bar: the traffic lights sit over the sidebar's head and the top bar drags the window.
- The tray: the ink tick; "Open Tudu", "New task ⌘⇧N", a line, "Quit Tudu" ("Tudu Staging" on staging).
- ⌘⇧N summons the floating bar over any app, top centre of the pointer's screen; it hides 650ms after Added.
- The dock badge carries the Inbox count across spaces. Attachments save to Downloads: "Saved to Downloads."
- The window loads the site through a loader page that says "You're offline." with Try again.
- Updates: "Tudu is ready: version 0.38.0", What's new, Restart to update, "Restarting…", and "Couldn't restart.
  Quit and open Tudu again to finish."

### 13 Next (designed, not built)

Page 13 draws four pieces the app does not have yet. These lines are the other way round from the rest: the canvas
is ahead, and each leaves when its chunk ships (or is redrawn to what shipped).

- Quick Add always shows "In … for Me", the floating bar included; Personal alone reads "In Personal for Me" with
  plain chips (today: the plain bar until a team space, and the floating bar never has the line).
- "Edit projects…" ends every project picker and the Backlog filter and opens Settings › Space on Projects.
- Send feedback: the avatar menu, More and the menu bar's ⋯; Something’s wrong | An idea, one screenshot, app
  details. Where reports go is not decided.
- The menu bar: a left click opens today across your spaces with the real checkbox, New task, Open Tudu and ⋯; a
  right click keeps the Mac's menu (adds Open at Login and Send feedback…); the Inbox count beside the tick while
  the Dock icon is gone (the background-running chunk).

# History

## Chunk 00 · Foundations · PR #12 · 20 Oct 2026

- Built as drawn: theme, tokens, the four fonts, 25 primitives, the kit page at `/kit` with light and dark side by side.
- Motion carried over from the Tudu Paper stylesheet verbatim.
- Deviations in the look: none.
- For the Today chunk: the checkbox has no separate 44px hit area in the design (the row is the target). Decide when the row is built.

## Chunk 01 · Sign in and the shell · 20 Oct 2026

- Sign in built as drawn: email, the 6-digit code, every state on the states board, the picture of the day on the desk.
- The sign-in copy says "we" ("We’ll send you a code", "We sent a 6-digit code to …") as drawn on the canvas, although the design system's content rules say the app never says "we". Kept as drawn; a wording decision for the canvas.
- Invites ("Join Northwind") are left for the spaces chunk.
- The fifth wrong code locks it (the states board shows "Too many tries" with the boxes empty and at rest); codes work for ten minutes; at most five codes to one address in ten minutes.
- The shell is built as drawn: sidebar that folds to the rail, the rail on tablets, tabs and the round New task button on phones, the avatar menu with the theme switch. Jira stays out of the bar, sidebar and tabs until it is connected.
- The desktop and tablet avatar menu signs out; phones sign out from Settings, which arrives with chunk 09 (the design puts Settings behind the phone's avatar).
- Today shows the day header and the empty state only; tasks arrive with chunk 02.

## Chunk 02 · Today · 20 Oct 2026

- Built as drawn: the row and its byline ("→ From Sat · ME-41"), the plain list, the writing line, the "+" between
  rows, dragging (grip, the lifted slip, rows gliding apart, the settle and wash, press and hold on phones), the page
  turn, the calendar and the sidebar's week with dots, two days side by side with dragging between them, the carried
  pill and its picker, the ring and its reward, and every state on the states boards.
- Until the task detail arrives (chunk 03), clicking a row writes its title in place: a field the size of the title on
  the accent wash the design gives a subtask being written. Enter or clicking away saves, Esc puts the old words back.
- The checkbox keeps its 19px look but takes a quiet 44px target on touch screens, since a tap on the row opens it.
- Not in the design, for the keyboard: Alt with the up or down arrow moves the focused row, and a screen reader hears
  "Moved to place 2 of 3".
- Carrying forward: open tasks from earlier days go to the top of today, oldest day first, and the pill keeps the first
  day a task came from. After midnight the list stays put and the banner asks until 04:00; from 04:00 the app moves to
  the new day by itself. Undo after moving a carried task puts it back without the "From" pill.
- The day being shown is not in the address: a reload goes back to today.
- After a drop only the click that ends the drag is swallowed (the design swallows every click for 60ms).
- Wording kept from the canvas: "Changes are saved here and sync when you’re back." and "Nothing you wrote is lost."

## Chunk 03 · Task detail · 20 Oct 2026

- Built as drawn: the paper panel over the page with the veil (460px on tablets, a full page with ‹ Today on
  phones), the ID and arrows at the top, the title written in place, the facts with their pickers under them,
  Notes on Tiptap with the rising toolbar, Subtasks in the panel and folded under the row, History folded with its
  count, Comments as a conversation with the box pinned to the foot, the ⋯ menu with Delete and Undo, and the four
  states on the states board.
- The row no longer edits its title in place (chunk 02's stop-gap); a click opens the panel, as the canvas draws.
- Project and Jira facts are not in the panel until chunks 04 and 10 bring their data; "Visible to" reads "Only
  you" with a one-item menu until chunk 08. "Attach a file" is not in the toolbar until chunk 04 brings uploads.
- The Planned picker has "Move to the Backlog" as its clear label (the state exists since chunk 02; its page is
  chunk 06).
- The open task is in the address (`/?task=ME-52`), and `/t/ME-52` opens it on its day. The day itself stays out
  of the address, as chunk 02 decided.
- Notes save when you leave the field, and when the panel closes or steps to another task with words unsaved.
  No autosave while typing.
- The ⋯ menus (the panel's and each comment's) are Radix menus, so they float and never clip, rather than the
  design's own absolutely placed pop.
- Posting a comment keeps the caret in the box, ready for the next one.
- The design's "Send to someone", "Go to its day" and the owner's read-only view wait for chunk 08.

## Chunk 04 · Quick Add · 21 Oct 2026

- Built as drawn: the bar over the desk and tablets with the veil, the sheet above the keyboard on phones, the
  title line with the logo mark, Planned, Due and Project chips with their pickers (upward on phones), the note
  line, file chips with drop and paste, the foot ("Lands on Today · Platform · due Thu 22 Oct"), Adding then
  Added, the wash on the day in view, "Added to Tomorrow" with Show, and the seven states on the states board.
- "New project…" is the picker's last line and asks for a name on the spot (not drawn); the colour is the next
  of the design's muted palette. Renaming, recolouring and deleting wait for Settings (chunk 09).
- Files upload the moment they are added and need a connection; offline, the attach button says so and the rest
  of the bar keeps working. A failed upload reads "failed" on its chip and can be removed.
- Files added in the bar join the task as attachment chips at the end of its notes, the same chips the editor's
  "Attach a file" inserts. There is no separate Files section.
- A failed save never shows "Couldn’t add the task" in practice: adding is local-first, so the task shows at once
  and the outbox keeps trying. The message stays for the one case the store refuses outright.
- The draft is kept in memory for the visit, per browser.
- Planned defaults to the day you are looking at; in two-day view a task landing on the second sheet washes there
  and shows no toast.
- The floating bar's page is `/quick-add` on the web; the macOS window and the global summon arrive with chunk 11.
- "Looks like a task you have" waits for Search (chunk 07).

## Chunk 05 · Week · 21 Oct 2026

- Built as drawn: the plain sheet on the desk with the bare header, the tiles four across (two on a narrow
  window), the Backlog tile last; on tablets and phones one sheet of days that fold with the one-line preview; the
  WeekPicker from the title; drag between tiles and in and out of the Backlog; the week ring with "That's the
  week".
- One week read (`GET /api/spaces/:id/weeks/:monday`) fills the eight lists; the tiles never ask for a day on
  their own. The live stream refreshes a tile the way it refreshes a day. The Backlog is cached as the day
  `null`, so a move in or out of it shows in both lists at once.
- The shown week stays out of the address, as the day does; the open task is in it (`/week?task=ME-52`).
- Folded days are remembered per browser (local storage). The first time, today is open in this week and the
  first day in any other; the Backlog starts shut. A task that lands in a folded day opens it.
- Past days take no drops and do not tint; the row's date pill and the panel's Planned picker still take any
  day. Past tiles show only what was crossed off there.
- A plain row has no date pill, so on phones a task without a due or carried marker moves from the panel's
  Planned fact or, in the Backlog, from the row's quiet calendar button.
- New task from the week lands on today in this week and on the Monday of a later week; a task for a day
  outside the shown week toasts "Added to Tomorrow" and Show turns the week to it.
- The panel's back label reads "Week" (or "Backlog") on phones when opened from the week.
- On phones the scroll under the sheet keeps 150px free at the foot, so the last row (the Backlog's, with its
  calendar button) can always scroll clear of the round New task button.
- A drag between tiles starts on a move in any direction (4px), not only a vertical one as a reorder within a
  list does, since the tiles sit side by side.
- Toasts never left in the running app: the host cleared its record inside a state updater, and React's
  StrictMode (the app runs in it) runs updaters twice, so the second run kept the toast. The take-down is pure
  now (C05-U15, and C05-E07 waits for the toast to go).

## Chunk 06 · Backlog · 21 Oct 2026

- Built as drawn: one sheet like Today with "Backlog" and the count, the project filter on the left and To do |
  Crossed off on the right, the same rows as Today in your own order, the writing line "Add to the Backlog…", the
  quiet calendar button that gives a task a day (the row folds away, with Undo), crossing off that waits a beat
  then folds the row into Crossed off (with Undo), unticking there that sends it back, and every state on the
  states board.
- No new endpoint: the Backlog read from chunk 05 carries the crossed-off tasks too, and the page splits, filters
  and counts in the client. Turning the view or the filter never asks the server.
- Crossed off is newest first and not draggable (no grip). When two tasks were crossed off at the same moment, the
  one changed last comes first, then the newer task.
- The filter is remembered per browser and space (local storage); a filter for a project that no longer exists is
  dropped. The view starts at To do on every visit.
- The count follows the view: "4 tasks", "2 tasks in Platform", "Nothing waiting"; "3 crossed off", "1 crossed
  off in Home", "Nothing crossed off". The design's states board shows only the To do counts.
- "Add a task" in the empty state opens Quick Add (planned for the Backlog), as the design's on-action says; the
  writing line is there as soon as the list has a row.
- The phone's More tab is a page of its own at `/more`, drawn in the app's own words (the design has no More
  board): a short list with Backlog on it now; Inbox, Settings, spaces and apps join it with their chunks. The
  Backlog keeps More lit in the tab bar.
- `/t/ME-52` for a task with no day opens the Backlog with the panel, rather than Today.
- From Today, "Added to Backlog" now offers Show, which opens the Backlog on the row (chunk 04's test C04-E03
  follows). The kit's Backlog sheets shrink with a narrow window so the kit page keeps no sideways scroll.
- A task given a day from the panel leaves the list at once rather than folding away: the list cannot animate a
  removal it did not start. The same holds on the week's tiles.
- Undo after crossing off or giving a day puts the row back at the index it had by queueing the reverse change;
  the server never sees a special undo.
- Two fixes in the store found by the tests: `idle()` could say the outbox was empty while the last change was
  still in flight (tests read the server too early), and a change written to disk between the outbox's last look
  and its sweep could lose its overlay. Both are closed; chunk 06's tests cover the Backlog, the earlier chunks'
  tests still pass.

## Chunk 07 · Search · 21 Oct 2026

- Built as drawn: the panel from the top bar's icon (the Search tab's sheet on phones), recent searches and recently
  opened before you type, results on every key with the matched words washed in ink, the note line cut around the
  word, best match first with the canvas's tie order, Create “…” when nothing matches, the pick that turns the page
  and glows the row, the last search back and selected on reopening, "Looks like a task you have" in Quick Add,
  and the states on the states board.
- The search runs on the server: one request a moment after each key (80ms), the previous rows kept while the next
  answer comes, so nothing flickers. The design's prototype searched a list in the page.
- A plain-text copy of the notes (`notes_text`, migration 0004, backfilled once) is what the words are matched
  against, so markup, link addresses and tag names never match.
- (Superseded by chunk 13.) Close matches by meaning are not there (vector search is in later.md): no "Close matches" heading, no "Looking
  for tasks like this…", and the "Close matches aren’t available" line is not drawn. "Looks like a task you have"
  matches by shared words meanwhile, the same rule as the design's stand-in: open tasks sharing two or more of the
  title's words (one for a one- or two-word title), at most three.
- Jira keys are not searched or shown in the rows until chunk 10 brings them; the hint reads "Search your tasks by
  title, task ID or note." rather than naming the Jira key.
- Not drawn: a search that could not run (offline, the server away) shows one quiet line under the box,
  "Couldn’t search right now.", with Try again; the recents still show with an empty box.
- Recent searches and recently opened are kept per browser and space (local storage), five each; a task opened from
  its panel joins recently opened too, not only one picked in Search. The last search lives in the panel for the
  visit.
- A pick scrolls the row into the middle and glows it for the list's locate beat; the list's wait now survives the
  page settling after a turn (it was cancelled by any re-render within 240ms, so a pick on the day already in view
  never glowed). The glow's focus yields when a dialog or the search panel is open by the time it lands.
- No keyboard shortcut opens search, per the canvas; inside the panel the arrows, Enter and Esc work as drawn.
- A fix found on the way (C03-E06, the comment's Undo): a real click on a toast's Undo while the task panel was open
  counted as a click outside the panel and closed it a beat after restoring the comment. The panel and the dialog
  now leave a click on the toast alone.
- A fix found on the way (C03-E07's phone flake): the outbox's sweep could drop a change written to disk while the
  sweep was reading it, so `idle()` said the change had landed before it was sent. The sweep now only lets go of
  what it saw stored before its read, and IndexedDB writes settle on commit.

## Chunk 08 · Spaces and People (the first PR) · 21 Oct 2026

- Built as drawn: the space's tile and name at the top of the sidebar (the tile alone on the rail, the name in the
  phone's header) opening the list of spaces with "Just you" or "N people" under each, the tick and Create a space;
  Create a space as one dialog (a sheet on phones) with the tile that follows the name and the colour, the eight
  swatches and people to invite; the welcome on a new space's Today with Invite people; the Members card; Join
  Northwind as drawn, with Sign in to join under the card and the invited address locked; People as one page like
  mail with Find someone, Everyone (Today | This week, By day | By person) and one person's week; a colleague's
  task in the panel to read and comment, with "Mon 19 Oct · Meera's" at the top; Visible to with "Everyone in
  Northwind" and "Only you".
- The space is in the address, against the canvas's note that the day and the week are not: `/me/today` is Personal,
  `/northwind/week` a team space's week. A reload and a shared link keep the space; `/` opens the last space you
  were in (remembered per browser); the old `/week`, `/backlog` and `/inbox` go to the same view in the last space.
  Decided 21 Oct 2026 for shareable links.
- "N new" on another space and the dot by the name wait for the Inbox (the second PR), as does Quick Add's top line
  ("In Northwind for Me") and "Send Meera a task" on a person's page.
- Roles show as a quiet word on the Members card; changing them, Remove, Leave and Delete wait for Settings (09).
  Resend sits beside Cancel on a pending invite (the design's MemberRow has it), and a cancelled invite's Undo
  restores the same link rather than sending a new mail.
- The Members card says "Invited 18:02" (or "Just now", "Thu 10:12") with the same words the history uses, rather
  than "Invited 2 days ago".
- A task prefix is the first letter and the letter past the middle of a one-word name (Northwind → NW, Platform →
  PF, Home → HM, the design's own examples), the initials of two words; a clash within your spaces grows a letter
  from the name, then a number. The address is the name's slug; a clash gets -2.
- People's week is the week that holds today (Monday to Sunday); the count beside each person is their shared tasks
  in it. An account without a name shows its email where the design shows a name.
- The join page, signed in with another address than the invite's, says so and offers the way back; it never joins
  with the wrong account.

## Chunk 08 · Sending and the Inbox (the second PR) · 21 Oct 2026

- Built as drawn: Quick Add's top line "In Northwind for Me" with the space and person menus, the chip that reads
  "Asks for Tue" and the Send button with "Goes to Meera's Inbox"; the Inbox like mail (To answer, Updates with Mark
  all as read, the picked item in full, Inbox | Answered | Sent turning the list, the search line); Accept with the
  day picker and the asked day preselected; Decline with the reason the sender sees; Answered; a comment with reply
  and Open task; Open task over the Inbox with "Go to Fri 16 Oct"; Sent with Waiting, seen, Take it back, Do it
  myself and Open task; the counts on the sidebar, the rail, the switcher and the phone's header; "Your answers send
  when you're back." offline; "You sent Meera" and "Send Meera a task" on a person's page.
- A request is its own row until accepted (migration 0006: `requests`, `inbox_items`); accepting makes the task
  with a client-made id, so it is on the day at once and never doubles. Send, Accept, Decline and Take it back go
  through the outbox; creating a space, inviting and joining stay online calls.
- Take it back's Undo deletes the task it made and sends the request again (a fresh request, so the receiver sees
  it as new); the design's Undo is not more specific than that.
- The design's Sent row also offers "See Meera's week" once accepted; it opens her page on People.
- The switcher's "N new" and the dot by the name count what waits for you in that space (to answer plus unread),
  the same number the sidebar carries.
- The Inbox's address may name the view (`?view=sent`), which is how Show on "Sent to Meera" lands there; the
  picked item is in the address on every size, so a reload keeps it.
- The reading pane stays blank paper until an item is picked; the design's "the pane keeps what you were reading"
  holds while the search narrows the list.
- An update's words are plain ("accepted your task onto Fri 16 Oct", "declined your task: the reason") rather than
  the design's bolded title line, since the request's title sits on its own line below.
- Quick Add's top line, the person menu and Send come with a team space; a person with Personal alone gets the
  plain Quick Add, since there is nobody to send to. The phone's send foot keeps to its buttons, as drawn; "Meera
  picks the day" is the desktop and tablet line.
- Personal has no Inbox, so `/me/inbox` goes back to Today, as `/me/people` does; switching from a team space's
  Inbox to Personal lands on Today.
- The sidebar's counts (the Inbox, the members) follow the `me` query live rather than the route's context, so a
  request that arrives shows on the sidebar and the switcher without a navigation.

## Chunk 09 · Settings · 21 Oct 2026

- Built as drawn: the large dialog over the page (the section list on the left under You and the space's tile,
  the section on the right with its serif title and line, ×), nearly full width on tablets; on phones a page with
  your mark and the list, a section pushing in; Account (photo, name, email, Sign out), Appearance (the three
  theme cards and Less motion), Personal › Space with Create a space, a team space's Name and colour and Leaving,
  Members with the role menu and Find someone past eight; the asks (Leave once, Remove once, Delete by typing the
  name) and their sheets on phones.
- Notifications and Apps are left out of the list until there is something for them to control (OS notifications
  are in later.md; Jira's Connect comes with chunk 10).
- Settings › Space gains a Projects block after Name and colour, not drawn: each project's dot opens the swatches
  under its row, the name saves when you leave it, its open-task count, Delete with Undo, and New project. Any
  member may change projects; only admins see Name and colour (members read "Its name and colour are kept by its
  admins.") and Delete.
- Email has Change, not drawn beyond the button: the new address, Send code, then the sign-in board's code field;
  the old address gets a note once it changes.
- Photo's Change picks an image, shrinks it to a 256px square in the browser and uploads it; Remove (not drawn)
  shows once there is a photo. A photo fills the round mark wherever people see you.
- Less motion is a switch in Tudu, so the stylesheets' reduced-motion rules are repeated under
  `:root[data-motion='less']` (generated into `less-motion.css` by `scripts/less-motion.mjs`; `pnpm lint` fails when
  it is stale).
- The last admin's Leave asks "Make someone admin first" with Go to Members; the last person's Leave says to Delete
  instead. Neither is drawn.
- A person who left (or was removed) stays on People's list marked Left while they have shared tasks in the range,
  and their page offers no "Send … a task".
- The phone's avatar in the header opens Settings (the design puts it there); More lists Settings last.
- Menus float over dialogs, so the role menu opens above Settings rather than under it.
- Settings is in the address: `?settings=members` on the desk and tablets, `/northwind/settings/members` on
  phones; a renamed space's old address lands on the new one, and the task prefix never changes.

## Chunk 10 · Jira · 22 Oct 2026

- Built as drawn: Apps (the 480px panel, and a page under More on phones), the Jira panel beside the page (560px,
  460 on tablets, no veil) with its connect form, the view chip and search, the plain list, the day picker, the
  linked chip, the preview over the list (a sheet on phones), the banners and every state on the boards; the top
  bar's button, the sidebar's Jira and the phone's Jira tab with the count; the task panel's Jira fact; Settings ›
  Apps.
- Settings › Apps is in Personal too (the board shows it in team spaces only), because a connection belongs to a
  space and Personal connects its own. Personal's line leaves out "Each person connects their own."
- Settings › Apps › Connect opens the Jira panel on its form beside the page (the Jira page on phones).
- A saved view can be removed: open it, then Custom JQL…, and a quiet "Remove view" sits beside Cancel, with Undo on
  its toast. Not drawn (choice 7).
- The count leaves out issues that have an open task of yours; a task you cross off counts as not in Tudu again.
- Esc in the panel's search box or JQL editor leaves the field, as in every Tudu field; Esc from anywhere else in
  the panel closes the preview first, then the panel.
- The Apps panel's Jira line is Tudu's own words: "Your Jira issues beside your day. Add one to a day and it
  becomes a linked task."
- The phone's Jira tab reads its count as "7 new", as every tab badge does.
- Search across Jira: a key typed in full asks Jira for that issue; words ask Jira's text search, newest change
  first.

## Chunk 11 · Desktop · 22 Oct 2026

- Nothing on the canvas draws the window, the tray, installing or Tudu Staging; the choices are in
  [chunk-11-desktop.md](chunk-11-desktop.md) (all eight approved 22 Oct 2026).
- No title bar: the traffic lights sit over the sidebar's head (28px left for them, only in the app) and the top bar
  is the drag region.
- ⌘⇧N summons the floating bar and cannot be changed yet, although the decisions log says no shortcuts.
- The dock badge shows the Inbox count across spaces. Attachments save to Downloads with "Saved to Downloads.".
- Tudu Staging looks like Tudu: same icon, the name tells them apart.
- The windows open the deployed site through a bundled loader page ("You're offline." with Try again), because
  WKWebView blocked the session cookie from `tauri://localhost`.

## Chunk 12 · First run · 22 Oct 2026

- Built as drawn: Getting started (the ring, the fold, the four rows, ×) in the corner of every page, beside New
  task on phones; the welcome on an empty Today; "Welcome back" and "You joined" toasts.
- Each row's two lines are read as one name with a pause ("Add your name and photo, So people know it’s you"); the
  design system's markup would run them together.
- Phones hide the card on Settings, Jira, Apps and an open task, the pages that cover the tabs.
- Someone who joins a team space by invite and is still new gets "Welcome to Northwind" over who is there; the person
  named is the one who sent the invite.
- A returning person is told apart by the session that made the account, not by times (choice 4 as built).

## Chunk 13 · Close matches · 22 Oct 2026

- Supersedes chunk 07's lines on close matches: the heading, "Looking for tasks like this…" and "Close matches
  aren’t available right now. Word matches still work." are built as drawn.

- Close matches come from every space you are in, where the canvas's search is per space (your decision of 22 Oct
  2026); a row from another space carries that space's tile and name before where it lives, a byline part the
  boards do not draw. Word matches stay in the space you are in.
- The word search now lists other members' shared tasks in a team space (chunk 07 listed only your own), so word
  and meaning searches read through one rule: your own, shared with the space, or an owner who left.
- The floor is 0.3 cosine similarity, not the 0.45 the proposal guessed: against the labelled searches the
  shipped model scores paraphrases between 0.3 and 0.6 and decoys under 0.3 (recall 0.91, precision 1.0 at 0.3;
  recall 0.80 at 0.4). Notes are part of the text embedded, which spreads a title's meaning a little.
- The API image moved from Alpine to Debian slim: the embedding runtime (ONNX) ships glibc builds only.

## Canvas redrawn to the app · 22 Oct 2026

The canvas and the design system now follow the app; these lines left the register because the canvas draws them.

- Shell, on every app board: the space switcher heads the sidebar (no Spaces list); People before the Inbox, and
  only the Inbox counts; Jira's tab before Search; the phone header is the space's name, the Inbox with its count in
  an ink pill, and your avatar; Visible to reads "Everyone in Northwind" and "Only you".
- Motion, checked against the app's code and corrected on every board:
  - The tick is the ink tick wiped in over 300ms (clip-path), not a drawn stroke; the sparkle is #eaa21c light,
    #ffd27a dark, with its glow, full at 35% of 640ms.
  - The day turn is 280ms in after a 110ms leave (it said 520ms); dur-spread 240ms is listed.
  - A space switch fades the page up 6px over 280ms with no out phase; views change in place.
  - Phones: no screen pushes, tabs and pages change at once, the New task button is always shown; an Inbox item
    and a person turn the sheet the way a day does. The phone header's Inbox button has no press tint.
  - Menus close in 130ms (tp-pop-out); press is opacity .86, never a scale; tooltips have no exit.
  - Search hands over to Quick Add after 170ms (240ms on phones). Quick Add's inline bar clears 650ms after Added,
    like the overlay (the design system said 1100ms).
  - The Jira panel floats over the page on the desk and never pushes it.
- The Motion board (00 Foundations) is rebuilt on the real Tudu Paper components, so its cards play the app's own
  timings.
- The design system's `bundle.css` is `components.css` plus a short tail that removes the CSS tooltip's exit, to
  match the app's Radix tooltip. Compare the two without that tail.

## Page 13 designed · 23 Oct 2026

- New page "13 Next: four new pieces" on the canvas: Quick Add's space line everywhere (K-QuickAdd), projects per
  space (K-Projects), Send feedback (K-Feedback), today in the menu bar (K-MenuBar, light and dark). Built from the
  Tudu Paper components; the menu bar sheet, the feedback form's body and the static macOS menu are new markup
  (`k-*` classes on the boards) until the build adds them to the design system.
- Settings › Space › Projects is now drawn as built (dot and swatches, name that saves on leave, open-task count,
  Delete with Undo, New project, the empty line), so its register line left; the app's `tp-sprj-*` rules are copied
  onto the board.
- The Quick Add board mounts the design system's QuickAdd, whose space chip still opens a one-line list with
  Personal alone; the build makes it a plain chip like "Me".
- Open questions are on the page's sticky: where feedback goes and whether anyone replies, which spaces the menu
  bar shows, the Inbox's waiting tasks in it, whether projects need more than the shortcut, and the Personal chip.
