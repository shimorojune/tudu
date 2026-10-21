# Chunk 08 · Spaces, People and the Inbox

Status: proposed 21 Oct 2026. Awaiting your approval of the scope, the choices and the test plan.

Boards: 09 Team space (Northwind, Switching, Phone, the phone sheet, People, People › Meera, People on the phone,
New task for Meera, New task for Me, Inbox › Sent), 08 Inbox (desktop panes, dark, tablet, phone, states, motion),
10 Settings › Members (the invite list only), 11 Join Northwind (desktop and phone), 03 Quick Add (the top line).
The parts are the design system's SpaceSwitch, People, Inbox, the Quick Add top line and the join card; the styles
are already in the vendored stylesheet.

## Scope

- **Spaces are separate Tudus.** Personal is yours alone. A team space has its own Today, Week, Backlog, Search,
  Inbox and People, and nothing mixes between them. Inside a team space every page shows your own tasks; what
  others wrote lives on People. A task you write there is visible to everyone unless "Only me"; others open it to
  read and comment, never to change it. Task IDs carry the space's prefix ("NW-12"), given from its name.
- **Switching.** The space's name at the top of the sidebar (the rail's tile on tablets, the name in the phone's
  header) opens the list of spaces: a tile and name each, "5 new" when that space's Inbox has something for you,
  a tick on the one you are in, and Create a space at the foot. A small dot by the name means something is new
  elsewhere. Switching keeps you on the same view and fades the page in; the last space is remembered per
  browser, so a reload comes back to it. On phones the list rises as a sheet. The space is not in the address.
- **Create a space.** One dialog (a sheet on phones): the name, a colour (the tile follows as you type and pick),
  people to invite by email (optional), Create space with Creating… and Created. You land on the new space's
  Today with the welcome ("Welcome to Northwind. It's just you for now. Invite the people you work with, or write
  the first thing for the team.") and Invite people. A toast says "Northwind is ready. Invites sent to 2 people."
- **Invites.** Invite people opens the Members card (the same card Settings hosts in chunk 09): you and the people
  in the space with their role, an email line with Invite, then the pending invites with when they were sent and a
  Cancel each (Undo). The email carries a join link. Join Northwind, as drawn: the card names the space and who
  asked; Sign in to join (the sign-in flow with the invite remembered), or Join Northwind when you are already
  signed in; you land on its Today. An invite to an address already in the space just says so. Roles: whoever
  creates the space is an admin; changing roles, Remove, Leave and Delete wait for Settings (chunk 09).
- **People** (team spaces only; the sidebar's People view, the rail's icon, More › People on phones). One page like
  mail: on the left "People · 19 in Northwind", Find someone, Everyone, then every member with how many tasks they
  share this week (fifty fit before the list scrolls). On the right: Everyone's shared tasks (Today | This week,
  By day | By person), or one person: their name, email and "Send Meera a task", their week day by day, then "You
  sent Meera" with where each stands. Picking only turns the right side; phones push the person in with ‹ People.
  Their tasks open in the task panel to read and comment, with "Mon 19 Oct · Meera's" at the top and nothing to
  edit; a task marked Only me never appears. Find someone narrows the list by name and email; "No one called
  “…” in Northwind." when nobody matches.
- **Visible to.** The task panel's fact gains the space: "Everyone in Northwind" (the default there) or "Only you".
  Personal keeps its one-item menu.
- **Send someone a task.** One composer for everything: Quick Add's top line reads "In Northwind for Me" and both
  halves are menus, the spaces you are in and the people in the chosen space (with Find). With Me it adds to your
  list as before. Pick a person and the planned chip reads "Asks for Tue", the button reads Send, and the task
  goes to their Inbox in that space as a request; a toast says "Sent to Meera. It's in Sent until Meera answers."
  with Show. It can send into another space without leaving this one ("Sent to Meera in Northwind."). Files
  attached travel with it. The person menu is not there in Personal.
- **The Inbox**, one per space, no bell. On the left the list: "To answer" (tasks people sent you, with the
  sender, their note, the day they asked for and the project), then "Updates" (a comment on a task of yours; your
  request accepted onto a day or declined with the reason), newest first, an ink dot while new, "Mark all as
  read". On the right the picked item in full; the list keeps its place. The header counts "2 to answer · 3 new"
  or says "All caught up". A search line narrows the open view as you type (names, titles, notes, comments); × or
  Esc clears it; "Nothing in the Inbox matches “…”. Try a name or a task title." with Clear search. Inbox |
  Answered | Sent turns the list like a page.
- **Answering.** Accept opens the day picker under the button: Today first, Tomorrow, the month, or the Backlog,
  with the day they asked for preselected. The task lands on that day as yours (the request's note becomes its
  notes, its files its attachments, "Sent by Meera, accepted" in its history), the request folds out of the list
  into Answered ("You accepted it onto Fri 16 Oct") and a toast says "Accepted onto Fri 16 Oct. It's in Answered."
  with Show. Decline opens a field for the reason the sender will see; Send stays off until there is one; the
  request moves to Answered ("You declined: …") and the sender gets an update. Answers queue offline like any
  change.
- **A comment update** shows the whole comment, a reply field (your reply goes onto the task as your comment) and
  Open task. Open task slides the task panel in over the Inbox, right where you are; its top bar has "Go to Fri 16
  Oct" (or "Go to Backlog"): the panel closes, the page turns to that day and the row glows. Closing lands back on
  the same item.
- **Sent** lives in the Inbox: everything you sent in this space, newest first, each with who, when, the day you
  asked for and where it stands (Waiting, "Seen 1h ago" once they opened it, Accepted onto Mon 19 Oct, Declined
  with the reason). A waiting or declined one offers Take it back (it lands on your Backlog, with Undo) and Do it
  myself (the day picker; "On Today now. You've got it."). An accepted one opens their task to read.
- **Counts.** The sidebar's Inbox carries to-answer plus new; the phone's header shows the inbox icon with the
  same count in ink; the switcher shows "N new" per space; the sign-in-time `/api/me` carries them and a live
  event keeps them current. Reading an item clears its dot; requests stay counted until answered.
- **Phones.** The inbox icon sits in the header beside your avatar on every page and pushes the Inbox in from the
  right with ‹ Today (or wherever you came from); an item is its own page with ‹ Inbox. More gains People (team
  spaces) under Backlog; the space's name in the header opens the switcher sheet.
- **States**, as drawn: reading a request, declining, a comment answered here, Answered, searching, nothing
  matches, all caught up ("Tasks people send you and updates on your tasks land here." with "See what you
  answered"), nothing answered yet, nothing sent, loading (skeleton rows on the left, the pane empty), offline
  ("Your answers send when you're back."), the welcome on a new space, People with nobody found, a person with
  nothing shared.
- **Data.** Migration 0005: `owner_id` on tasks (filled from `created_by`); `space_invites` (space, email, role,
  token, who invited, sent, accepted, cancelled); `requests` (space, from, to, title, note, asked day, due,
  project, files, state waiting | accepted | declined | withdrawn, the reason, seen at, the task it became);
  `inbox_items` (person, space, kind request | comment | answer, what it points at, read at, answered at); a
  colour per person, given at first sign-in. New sync mutations: request.send, request.accept, request.decline,
  request.withdraw (with an optional day), inbox.read, inbox.readAll. New reads: `GET /api/spaces/:id/people`
  (shared tasks for a range, by member), `GET /api/spaces/:id/people/:userId`, `GET /api/spaces/:id/inbox?view=&q=`,
  `GET /api/spaces/:id/members`; `POST /api/spaces`, `POST /api/spaces/:id/invites`, `DELETE
/api/invites/:id`, `GET /api/join/:token`, `POST /api/join/:token`. Day, week, Backlog, marks and search answer
  with your own tasks in a team space; another member's task read is read-only unless you own it, and a comment is
  the one write anyone may make. Live events: inbox.changed to the person it concerns, members.changed to the
  space.

Out of scope: Settings and its Members section proper, roles, Remove, Leave and Delete (09); Jira updates and Jira
keys in the Inbox search (10); "A new version is ready" and Restart to update (11); Getting started for people who
join (12); push or email for Inbox items (never, by the decisions log); Only-me tasks on People (never).

## Choices

1. **Two PRs, one chunk file.** The first (`rewrite/08-spaces`) brings spaces, switching, Create a space, invites
   and joining, People, Visible to and reading others' tasks. The second (`rewrite/08-inbox`) brings sending, the
   Inbox, answering, Sent and the counts. Each is reviewed on staging on its own, since together they are the
   size of two earlier chunks. The alternative is one PR with everything, reviewed once.
2. **The space is remembered, not in the address.** Like the day and the week, the space you are in is kept per
   browser and a reload returns to it; `/t/NW-12` finds the task across your spaces by its prefix and switches.
   The alternative puts the space in the address (`/northwind/today`), which gives shareable links to a space's
   pages at the cost of every route moving.
3. **Invites live in the Members card now, inside Settings later.** The card (people, roles shown, the email line,
   pending invites with Cancel) opens from the welcome, from People and from the switcher's Create a space, so a
   team can be assembled before Settings exists. Chunk 09 hosts the same card and adds roles, Remove, Leave and
   Delete. The alternative waits for Settings and leaves Create a space's invite field as the only way in.
4. **Your own tasks on every page of a team space.** Today, Week, Backlog and Search in Northwind show the tasks
   you own there; People shows everyone's, grouped by day or by person. This is how the boards read (each member
   has their own week; the People page is where they meet) and it keeps Today one calm page. The alternative
   shows every shared task on Today with the owner's dot, which is the old Tudu's model.
5. **Sending goes through the outbox like any change.** A request is a mutation with a client id, so Send,
   Accept, Decline and Take it back work offline and never double on a retry; Accept creates the task with a
   client-made id, so it is on the day at once. Creating a space, inviting and joining stay online calls, like
   sign-in. The alternative posts requests straight to the server and greys the buttons offline.
6. **A request is its own row until accepted.** It is not a task in anyone's list while it waits; accepting makes
   the task (owned by you, with the sender in its history), declining makes none, and Take it back makes one on
   the sender's Backlog or day. The alternative creates the task at send time with a "waiting" flag, which puts
   half-tasks in Search and the counts.

## Test plan

Unit (`packages/ui`, `packages/core`, `apps/web`):

| ID      | Component   | Case                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C08-U01 | core        | A space's prefix from its name (Northwind → NW, two words → initials, a clash gets a letter); a task ref parses to prefix and number; the Inbox count line ("2 to answer · 3 new", "All caught up", "4 answered", "3 sent · 1 waiting")                                                                                                                                    |
| C08-U02 | SpaceSwitch | The name opens the list; tiles, "N new", the tick, Create a space; the dot by the name when another space has news; the rail form; the sheet form; picking reports and closes; Esc closes                                                                                                                                                                                  |
| C08-U03 | CreateSpace | The tile follows the name and the colour; emails are taken on Enter, comma and blur, a bad address is marked, a duplicate ignored; Create space is off without a name; Creating… then Created; the sheet form                                                                                                                                                              |
| C08-U04 | MembersCard | People with roles, the email line with Invite, pending invites with when and Cancel; invite reports the addresses; cancel reports; nothing pending reads so                                                                                                                                                                                                                |
| C08-U05 | JoinCard    | The space and who asked; Sign in to join against Join Northwind when signed in; the expired and already-a-member states                                                                                                                                                                                                                                                    |
| C08-U06 | People      | The list with counts, Everyone first, Find someone narrows by name and email with the empty line; Everyone's groups By day and By person, Today and This week; one person's days and "You sent …"; picking turns only the right side; the phone's push and ‹ People                                                                                                        |
| C08-U07 | TaskDetail  | Visible to with "Everyone in Northwind" and "Only you"; another person's task: the owner line, nothing editable, the comment box there, the ⋯ menu without Delete; "Go to Fri 16 Oct" in the top bar reports                                                                                                                                                               |
| C08-U08 | QuickAdd    | The top line "In Northwind for Me"; the space menu lists your spaces and the person menu the members with Find; with a person the chip reads "Asks for Tue" and the button Send; the result carries space and person; no person menu in Personal                                                                                                                           |
| C08-U09 | Inbox       | To answer then Updates, newest first, dots, Mark all as read; the header count; the picked item in the pane; Inbox, Answered, Sent turn with the direction; the search line narrows and clears, the no-match line with Clear search; the empty, loading and offline states                                                                                                 |
| C08-U10 | InboxItem   | A request: sender, note, the asked day, project; Accept opens the picker with the asked day preselected and reports the day or the Backlog; Decline opens the reason, Send off until there is one, reports; a comment: the whole comment, the reply reports, Open task; an answer update; a sent row with Waiting, Seen, Accepted, Declined, Take it back and Do it myself |
| C08-U11 | web         | The space remembered per browser and dropped when it is gone; `/t/NW-12` picks the space; the phone's header icon and count; where the Inbox goes back to; More lists People in a team space only                                                                                                                                                                          |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C08-A01 | Create a space: the maker is its admin, the prefix comes from the name, `/api/me` lists it with the role; a blank name is 400; invites in the same call send one mail each with a join link                                                                                                                     |
| C08-A02 | Invites: an admin or member may invite; a pending list; cancel; an address already in the space is told so; `GET /join/:token` names the space and the inviter; `POST /join/:token` adds the member and spends the token; a cancelled or spent token is 410; joining with another email than invited is refused |
| C08-A03 | Ownership: a task written in a team space is owned by its writer; the day, week, Backlog, marks and search answer with the caller's own tasks; the migration fills `owner_id` from `created_by`                                                                                                                 |
| C08-A04 | Reading others' tasks: a member reads a shared task of another member with its comments; an Only-me task of another member is 404; every edit mutation on another member's task is refused and nothing changes; a comment is accepted and reaches the owner's Inbox                                             |
| C08-A05 | People: `?from=&to=` groups shared open and crossed-off tasks by member within the range, Only-me left out, with each member's week count; `/people/:userId` for one person, 404 for a stranger to the space                                                                                                    |
| C08-A06 | Send: request.send makes a request in the space with the note, the asked day and the files, and an Inbox item for the receiver; a receiver outside the space is 400; a person cannot send to themself; the same mutation id twice makes one request                                                             |
| C08-A07 | Accept: the task is created on the picked day (or the Backlog) owned by the receiver with the notes, the files and the history line; the request reads accepted; the sender gets an answer update; accepting twice is one task; declining needs a reason and makes an answer update with it                     |
| C08-A08 | Withdraw: Take it back on a waiting or declined request makes the task on the sender's Backlog or the picked day and removes the receiver's item; on an accepted one it is refused; Seen is set when the receiver opens the item                                                                                |
| C08-A09 | The Inbox read: `view=inbox` lists To answer and Updates newest first with read flags, `answered` what was answered with the outcome, `sent` what you sent with the state; `q=` narrows each by name, title, note and comment; a stranger is 403                                                                |
| C08-A10 | Counts and events: `/api/me` carries to-answer and unread per space; inbox.read and inbox.readAll clear dots; every request, answer, comment and read publishes inbox.changed to the one person it concerns; creating, inviting and joining publish members.changed to the space                                |

End-to-end, groups `spaces` (E01 to E09) and `inbox` (E10 to E20):

| ID      | Case                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C08-E01 | Create a space from the switcher: name, colour, Create; Today with the welcome; the switcher lists both with the tick; the toast                                                                                                            |
| C08-E02 | Switch: a task written in Northwind is not on Personal's Today and the other way round; switching keeps the view (Week stays Week); a reload comes back to the last space; the prefix on the byline                                         |
| C08-E03 | Invite and join: Invite people, an email, Invite, the pending row; the join link from the test outbox in a second browser; Sign in to join; the newcomer lands on Northwind's Today; the member list                                        |
| C08-E04 | A cancelled invite's link says so; a second invite to the same address is told it is already in the space (after joining)                                                                                                                   |
| C08-E05 | People: two members write tasks; Everyone shows both by day and by person with counts, This week; a person's page shows their days and the week count; Find someone narrows and empties                                                     |
| C08-E06 | Read-only: open a colleague's task from People, nothing editable, post a comment; they see it on the task; an Only-me task is absent from People                                                                                            |
| C08-E07 | Visible to: Only me on a task in Northwind hides it from the colleague's People; back to Everyone shows it                                                                                                                                  |
| C08-E08 | Phone: the name in the header opens the sheet, switch; More › People, a person pushes in and ‹ People back (phone)                                                                                                                          |
| C08-E09 | Tablet: the rail's tile opens the switcher; People from the rail (tablet)                                                                                                                                                                   |
| C08-E10 | Send: New task, pick Meera, the chip reads "Asks for …", Send; the toast with Show lands on Sent with Waiting; Meera's Inbox has it in To answer with the count on the sidebar                                                              |
| C08-E11 | Accept: Meera reads the request (the sender's Sent shows Seen), Accept with the asked day preselected, picks Tomorrow; the task is on her Tomorrow with the note; the request in Answered; the sender's Updates says accepted onto that day |
| C08-E12 | Decline: Send off until a reason, Send; Answered with the reason; the sender's Updates carries it; Take it back puts it on the sender's Backlog with Undo                                                                                   |
| C08-E13 | Do it myself from a waiting request: the picker, Today; the task on the sender's Today; the receiver's item is gone                                                                                                                         |
| C08-E14 | A comment update: a colleague comments on your task; the Inbox shows it with the dot and the count; the pane shows the comment; a reply lands on the task; Open task, then "Go to …" turns the page with the glow                           |
| C08-E15 | Mark all as read clears the dots and the count; a read item keeps its place; a request stays counted until answered                                                                                                                         |
| C08-E16 | Search in the Inbox narrows by the sender's name and by a word in the note; nothing matches with Clear search; the switch to Answered still works                                                                                           |
| C08-E17 | Send into another space from Personal: the top line picks Northwind and Meera; the toast names the space; it is in Northwind's Sent and Meera's Inbox; Personal's Today has nothing new                                                     |
| C08-E18 | Live: with two tabs open, a request sent in one shows in the other's Inbox and its count without a reload; the switcher's "1 new" on the other space                                                                                        |
| C08-E19 | Phone: the header's inbox icon with the count opens the Inbox with ‹ Today; an item is its own page with ‹ Inbox; Accept there (phone)                                                                                                      |
| C08-E20 | Offline: Accept while offline queues, the item folds away, "Your answers send when you're back."; back online it lands on the day and the sender hears; dark mode: E10 and E14 again in dark                                                |

Not automated: the page fade on switching, the list turning between Inbox and Answered, the fold on answering,
the pane's lift; you judge those on staging.

## Done when

- The tests above pass three runs in a row locally and on the Dokploy runner, for each PR in turn.
- Staging lets two people create a space, invite, join, switch, read each other's tasks on People, send a task,
  accept, decline, take one back, and see comments arrive in the Inbox, on the desk, a tablet and a phone, light
  and dark.
- The switcher, People, the composer's top line and the Inbox match the 08 and 09 boards and the states board.
