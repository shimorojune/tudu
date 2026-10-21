# Chunk 09 · Settings

Status: approved 21 Oct 2026 as proposed.

Boards: 10 Settings + spaces (Settings on desktop as a dialog, desktop dark, tablet, phone list, a phone section,
phone dark Members, Members with the role menu, asking first, the avatar menu, States and States dark, Motion).
The parts are the design system's Settings, SettingsNav, SettingsSection, SettingRow, ThemePick, Switch,
ColorPick, MemberRow (with its role menu) and ConfirmDialog (with type-to-confirm); the styles are already in the
vendored stylesheet (Phase 10). Create a space and the Members card shipped with chunk 08 and are reused as they
are.

## Scope

- **Where it opens.** The avatar menu's Settings (desktop and tablet) opens a large dialog over the page you were
  on: the section list on the left ("Settings", then You and the space's own group), the section on the right with
  its title and line, × to close. Esc (out of a field first) or a click on the veil closes it and you are where you
  were. The tablet dialog is nearly full width. On phones Settings is a page: More › Settings or a tap on your
  avatar; the list is the page (your mark, name and email on top), and a section pushes in with ‹ Settings.
- **The list.** You: Account (your email under it), Appearance (Light, Dark or System), Notifications. Then the
  space you are in, under its tile and name: in Personal just Space ("Just you"); in a team space Space ("Name,
  colour, leaving"), Members (the count; "Just you" or "19 people") and Apps ("None yet" or "Jira"). Picking a row
  gives it the accent fill and the section rises in; the list and the title row never move.
- **Account.** Photo (your mark with Change: pick an image, it uploads and shows wherever people see you; Remove
  puts the initials back), Name (saves when you leave the field, no Save button; the mark's initials follow),
  Email with Change (see choice 5), then Signing out with Sign out ("Of Tudu on this computer. Your spaces and
  tasks stay as they are."). Phones finally get Sign out here.
- **Appearance.** Theme as the three cards (Light, Dark, System), the same choice the avatar menu has, repainting
  with the one soft cross-fade. Motion: Less motion ("Day turns, slides and sparkles become simple fades. Tudu
  also follows your computer's Reduce motion setting."). Both are remembered per browser ("How Tudu looks on this
  computer.").
- **Personal › Space.** "Yours alone. Nothing here is shared.": the Personal tile and line, then Working with
  others with Create a space (opens the chunk 08 dialog). Then Projects (choice 4).
- **A team space › Space.** Name and colour: the tile follows the name and the eight swatches as you type and pick,
  the name saves when you leave the field and the switcher, sidebar and tile follow for everyone live. Admins
  change the name and colour; members see them as they are. Projects
  (choice 4). Leaving: Leave Northwind ("What you shared stays with the space. You'll need an invite to come
  back.") and, for admins, Delete Northwind ("Removes it, and everything in it, for all 19 people. This can't be
  undone.").
- **Members.** The chunk 08 card grows into the section as drawn: Invite people (the chip field, Invite, Sending…
  then Sent), Invited with when, Resend and Cancel (Undo), Members with the count, Find someone past eight people
  ("No one called “zed” in Northwind."). Each member's role is a menu for admins: Admin, Member, then Remove from
  Northwind (the menu opens upward near the bottom). Members see roles as words. You can't demote or remove
  yourself here (that is Leave), and the last admin can't be made a member.
- **Asking first.** Leave asks once ("Leave Northwind?", the ink button says Leave Northwind, nothing red); you fade
  into Personal's Today with a toast. Delete asks you to type the name and its button wakes when it matches;
  everyone in the space lands on Personal with "Northwind was deleted by Rohit." Remove asks once ("Remove
  Meera?"), then a toast with Undo; Meera's open Tudu leaves the space the same way. On phones the asks rise as
  sheets.
- **Apps and Notifications** (choice 3).
- **More on phones** gains Settings (and the avatar in the header opens it).
- **Live.** A rename, a recolour, a role change, a removal, a leave and a delete reach every member's open Tudu
  without a reload (members.changed and a new space.changed; space.gone sends anyone still inside to Personal).
- **States**, as drawn: every section, a bad address in the invite field (the chip, edge and line turn red;
  Invite waits), no one by that name, Personal's Space, nothing connected, the three asks, Delete waiting for the
  name, saving a name offline ("Saves when you're back." and it sends from the outbox), a photo that failed to
  upload.
- **Data.** Migration 0007 (as built): `space_slugs` (every slug a space has had, so old links still land),
  `former_members` (who left or was removed, how, by whom, and what leaving changed, so Undo can put it back),
  `detached` on projects (the tasks a delete took it off, for Undo), `email_changes` (person, new address, hashed
  code, tries, expires). New sync mutations: me.rename, space.update (name, colour) and project.restore; projects
  keep chunk 04's project.update and project.delete. New calls (online, like chunk 08's): `POST /api/me/photo`,
  `DELETE /api/me/photo`, `GET /api/people/:id/photo/:v`, `POST /api/me/email` and `POST /api/me/email/confirm`,
  `PATCH /api/spaces/:id/members/:userId` (role), `DELETE /api/spaces/:id/members/:userId` (remove) and `POST
…/restore`, `POST /api/spaces/:id/leave`, `DELETE /api/spaces/:id`, and `?counts=1` on the projects read.
  Live events: space.changed to the space, space.gone to each person who loses it.

Out of scope: connecting Jira (10); "A new version is ready" and its notification (11); Getting started (12); OS
notifications (later.md); deleting your account (not drawn); moving a space's tasks to another space (not
drawn).

## Choices

1. **Settings is in the address.** Desktop and tablet open the dialog with `?settings=members` on the page you are
   on, so a reload, Back and a link keep it, and Back closes it. Phones use pages, `/northwind/settings` and
   `/northwind/settings/members`, so ‹ Settings is a real Back. The space part always follows the space you are
   in. The alternative keeps the dialog out of the address (it closes on reload).
2. **A rename moves the slug, the prefix stays.** Renaming Northwind to Northwind Labs moves its pages to
   `/northwind-labs/...` and every old slug keeps landing (it redirects). Task IDs keep "NW-12" for good, so links
   and Jira mentions never break. The alternatives keep the slug as it was made, or let a rename change the
   prefix and renumber.
3. **Notifications and Apps wait for what they control.** Nothing in Tudu notifies yet (OS notifications are in
   later.md) and Jira arrives in chunk 10, so this chunk leaves both rows out of the list rather than drawing
   switches that do nothing and a Connect that goes nowhere. Apps (with Jira's Connect and Disconnect) comes with
   chunk 10; Notifications comes with the notifications work, its five switches stored per person then. The
   alternative builds both sections now: the switches save to the server and wait, and Apps shows Jira with
   Connect saying "Coming with Jira" until chunk 10.
4. **Projects live in Settings › Space (not drawn).** Chunk 04 promised renaming, recolouring and deleting
   projects here. Space gets a Projects block after Name and colour: each project's dot (a swatch menu), its name
   (saves when you leave it), how many open tasks it has, and Delete, which takes the dot off its tasks and offers
   Undo; New project at the foot. In a team space any member may change projects, like writing tasks. The
   alternative leaves projects managed only from the Quick Add picker and drops the promise.
5. **Changing your email asks the new address for a code.** Change opens the email field and Send code; a 6-digit
   code goes to the new address (the sign-in code form, as drawn on board 11); once it matches the address
   changes, your sessions stay signed in and the old address gets a note that it changed. An address someone else
   uses is refused. The alternative leaves Email read-only until it is needed.
6. **Leaving and removing.** What a person shared stays in the space, owned by them, and shows on People's
   Everyone under their name marked "Left"; their Only-me tasks in that space are deleted with them; requests
   waiting in their Inbox go back to the sender's Sent as declined ("Meera left Northwind."). Joining again
   brings their tasks back to their own lists. The last admin can't leave while others remain until they make
   someone else an admin (the ask says so); the last person in a space can only Delete it. Delete removes every
   task, comment, file, invite and request in the space, files in storage included. The alternative hands a
   leaver's open tasks to an admin's Backlog.

## Test plan

Unit (`packages/ui`, `packages/core`, `apps/web`):

| ID      | Component     | Case                                                                                                                                                                                                                                                                    |
| ------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C09-U01 | core          | A slug from a name with clashes and old slugs; who may change roles, remove, leave and delete (the last admin, the last person, yourself); the members line ("Just you", "19 people · You're an admin") and the delete line for one and for many                        |
| C09-U02 | Settings      | The list for Personal and for a team space with the subs and the Members count; picking reports and fills the row; the title and line per section; × and Esc close; the dialog, tablet and phone layouts; the phone list with your mark and a section with ‹ Settings   |
| C09-U03 | Account       | Photo Change reports a file, Remove shows the initials; Name saves on blur and not on every key; Email Change opens the field, Send code, then the code form; a wrong code says so; Sign out reports                                                                    |
| C09-U04 | Appearance    | The three theme cards report the choice and paint it; Less motion sets `data-motion="less"` and is read back per browser; the computer's Reduce motion still counts with the switch off                                                                                 |
| C09-U05 | Space         | Personal: the line and Create a space; a team space: the tile follows the name and the swatch, the name saves on blur, Leave and Delete for an admin, Leave only for a member; the delete line's count                                                                  |
| C09-U06 | Projects      | Each project's dot, name and open count; the swatch menu reports the colour; a rename saves on blur; Delete reports and Undo restores; New project; nothing yet reads so                                                                                                |
| C09-U07 | MembersBody   | Invite, Invited with Resend and Cancel, Members with count; Find someone appears past eight and narrows, the no-match line; an admin's role menu (Admin, Member, Remove) and a member's plain role word; no menu on your own row; the last admin can't be made a member |
| C09-U08 | ConfirmDialog | Leave, Remove and Delete with their words; Delete's button wakes only on the exact name; the last-admin Leave says to make someone admin first; the sheet form on phones                                                                                                |
| C09-U09 | web           | `?settings=section` opens the dialog on the page and Back closes it; the phone routes and ‹ Settings; an old slug redirects to the new one; space.gone sends you to Personal with the toast; More lists Settings                                                        |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C09-A01 | me.rename changes the name for `/api/me`, members and People; a blank name is refused; the photo upload takes an image (not other files, not over the size cap), `/api/me` and members carry it, Remove clears it                                                  |
| C09-A02 | Email change: a code goes to the new address only; a wrong or expired code is refused; the right code changes the address and keeps the session; the old address gets a note; an address in use is 409; the new address signs in to the same person                |
| C09-A03 | space.rename and space.recolour: an admin may, a member is refused; the slug moves and the old slug resolves; the prefix stays; Personal can't be renamed; space.changed reaches every member                                                                      |
| C09-A04 | Projects: rename, recolour, delete (tasks lose the project, the project leaves the picker) and restore (they get it back); a non-member is refused; the same mutation id twice is one change                                                                       |
| C09-A05 | Roles: an admin makes a member admin and back; a member can't; the last admin can't be made a member; members.changed is sent                                                                                                                                      |
| C09-A06 | Remove: an admin removes a member; their shared tasks stay owned and show on People marked Left, Only-me ones are gone, waiting requests to them turn declined for the sender; Restore puts them back as they were; space.gone reaches them; a member can't remove |
| C09-A07 | Leave: a member leaves with the same effects as Remove; the last admin with others is refused; the last person is refused (Delete instead); joining again by a new invite brings their tasks back                                                                  |
| C09-A08 | Delete: only an admin; every task, comment, file (storage included), invite, request and inbox item in the space is gone; Personal can't be deleted; space.gone reaches every member; their `/api/me` no longer lists it                                           |

End-to-end, group `settings`:

| ID      | Case                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C09-E01 | Open Settings from the avatar menu over Today; the list for Personal; pick each section; the address carries the section; a reload keeps it; Esc closes and Today is as it was                           |
| C09-E02 | Account: change the name, leave the field; the avatar's initials and the Members card follow; upload a photo and see it on the avatar; Remove brings the initials back                                   |
| C09-E03 | Email: Change, a new address, the code from the test outbox, the address changes; signing out and in with the new address works                                                                          |
| C09-E04 | Appearance: Dark from Settings paints the page and the avatar menu agrees; Less motion survives a reload                                                                                                 |
| C09-E05 | Space: rename Northwind, the tile, the sidebar and the address follow; the old address lands on the new one; a colleague's open Tudu shows the new name without a reload; the task IDs keep their prefix |
| C09-E06 | Projects: rename and recolour a project; its tasks show the new name and dot; Delete takes the dot off, Undo brings it back                                                                              |
| C09-E07 | Roles: make Meera an admin, she sees the role menus; make her a member again; the last admin's own row has no way to drop admin                                                                          |
| C09-E08 | Remove Meera with Undo, then for real: her open Tudu lands on Personal with the toast; her shared task shows on People marked Left; a request waiting for her is declined in the sender's Sent           |
| C09-E09 | Leave: a member leaves, lands on Personal; the space is gone from their switcher; the last admin is told to make someone admin first                                                                     |
| C09-E10 | Delete: type the wrong name, the button stays off; the right name deletes; every member lands on Personal; the old address goes home                                                                     |
| C09-E11 | Phone: avatar opens the Settings page, a section pushes in, ‹ Settings back; More lists Settings; the desk's `?settings=` turns into the page; Sign out from Account (phone)                             |
| C09-E12 | Tablet: the dialog nearly full width from the rail's avatar; Members find past eight people (tablet)                                                                                                     |
| C09-E13 | Offline: rename the space and a project offline, "Saves when you're back.", they land when online; dark mode: E01 and E07 again in dark                                                                  |

Not automated: the dialog's rise and sink, the section rising in, the theme cross-fade, the switch knob, the tile
recolouring, the page fade on leaving; you judge those on staging.

## Done when

- The tests above pass three runs in a row locally and on CI.
- Staging lets you open Settings from the avatar and from More, change your name, photo and email, the theme and
  Less motion, rename and recolour a space and its projects, change roles, remove with Undo, leave and delete,
  with every other member's Tudu following live, on the desk, a tablet and a phone, light and dark.
- Settings matches the 10 boards (dialog, tablet, phone, Members, asking first, States) light and dark, except
  what choice 3 leaves out.
