# Design deviations

Where the code departs from the canvas or the design system, and why. Written so each entry can be pasted into
the "Build log" sticky on the canvas's Build plan page. The canvas and the design system cannot be edited from
the coding session, so this file is the record and the canvas gets a copy by hand.

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
