# Chunk 14 · Notifications

Status: proposed 22 Oct 2026, revised the same day after your first read (the window closed, Tudu quit, what the
mac tests prove). Awaiting your approval. Branch `rewrite/14-notifications` once approved.

Boards: 10 Settings (G-States "Notifications": "Everything lands in the Inbox either way. These only decide what also
notifies you. Jira starts off."; G-Motion: a switch's knob slides and the track fills with ink), 08 Inbox (the
decisions log: "One Inbox, no bell"; the update item's "What's new" and "Restart to update"). The part is the design
system's Settings › Notifications section: the sidebar row (`Notifications`, the bell, "What tells you"), the title
"Everything lands in your Inbox. This decides what also tells you.", the heading `Tell me when` and five switches.
Chunk 09's choice 3 left the row out "until there is something for it to control"; chunk 11 left "A new version of
Tudu" to this work. This chunk is what the switches control: your computer telling you, while you are not looking at
Tudu.

## Scope

- **Settings › Notifications.** The row joins You, after Appearance, on the desk, the tablet and the phone
  (`?settings=notifications`, `/space/settings/notifications`). The section as drawn: `Tell me when`, then
  1. **Someone sends you a task** · Waits in your Inbox until you accept or decline it.
  2. **Someone answers a task you sent** · Accepted, or declined with their reason.
  3. **Comments on your tasks** · Only on tasks you own or follow.
  4. **Jira gives you a new issue** · Assigned to you, not in Tudu yet.
  5. **A new version of Tudu** · With Restart to update.
     All on but Jira, saved per person on the server, so they follow you to every computer. Under the switches, not
     drawn, one block says where this computer stands: in the Mac app, "Tudu asks macOS once; after that System
     Settings › Notifications decides." In a browser, a row **This browser** with Allow (the browser asks), then
     "Allowed" or "Blocked in the browser's site settings." On a phone the same, with "Tudu tells you only while it is
     open."
- **What tells you.** While a Tudu of yours is open but not looked at (the Mac app's windows are not in front, or
  the browser tab is hidden or its window not focused), a new Inbox item for a switched-on kind shows a system
  notification: "Meera sent you a task" over the task's title; "Meera accepted your task" or "Meera declined your
  task" over the title (the reason under it when there is one); "Meera commented on Renew passport" over the
  comment's first line; "Tudu is ready: version 0.38.0" over "Restart to update from the Inbox" (the Mac app only).
  Several at once: the first three show, the rest wait in the Inbox. While you are looking at Tudu nothing shows;
  the Inbox count rises as it does today. Reading the item anywhere clears nothing on the screen: notifications
  are not retracted.
- **Jira gives you a new issue.** With the switch on and Jira connected in a space, Tudu asks Jira every fifteen
  minutes while it is open for issues assigned to you that are not in Tudu yet, and tells you of a new one:
  "Jira gave you a new issue" over "TUDU-219 · Fix the gutter". The notification opens the Jira panel on that
  issue. Nothing lands in the Inbox (the Inbox boards draw no Jira item), and nothing is asked while the switch is
  off, as chunk 10 promised.
- **A click.** Opens Tudu where the item is: the Mac app comes forward and shows the space's Inbox with the item
  (a comment opens the task), the Jira panel for an issue, the update item for a new version; a browser tab is
  focused and goes there.
- **Mac app.** Tudu asks macOS for permission once, the first time it is signed in after this version (the system
  dialog, nothing of Tudu's own); after that System Settings decides. The dock badge keeps its Inbox count.
- **The window closed.** Closing Tudu's window hides it and Tudu stays running in the dock and the menu bar (chunk
  11), so you are told exactly as when the window is behind another app: the live stream stays open in the hidden
  window, and the app keeps it alive if macOS would rather it slept. A click brings the window back on the item.
- **Tudu quit.** After ⌘Q nothing of Tudu runs, so nothing can tell you until it opens again; what arrived waits in
  the Inbox and the badge shows it at the next launch. So that this is rare, Settings › Notifications in the Mac
  app gains **Open Tudu at login** (a switch, off until you turn it on, the helper "So it can tell you from the
  menu bar."), kept by macOS as a login item. Not drawn (choice 7). Chunk 16 built that switch in Settings › This
  Mac; this section points there instead of a second switch, and C14-D11 is covered by C16-D05.
- **Phones.** No push (decided 20 Oct), so a phone is told only while Tudu is open in the browser and the tab is
  hidden; the Settings line says so.
- **Data.** Migration 0012 (0011 went to chunk 19's feedback) adds `user.notify` (jsonb: `sent`, `answered`, `comments`, `jira`, `version`, each
  true or false, missing means the default). `GET /api/me` gains `notify`; one new request,
  `POST /api/me/notify` with the switches, idempotent. One new read, `GET /api/spaces/:id/jira/assigned?since=`,
  for issues assigned to you created since a time, through chunk 10's proxy. The Inbox read gains the sender's
  name and the task title on each item where it lacks them, so the notification needs no second request.
- **Everywhere else.** Nothing else changes. The kit gains the Notifications section light and dark.

Out of scope: push to closed phones and browsers, and to a Mac where Tudu is quit (needs a push service and a server
that sends; [later.md](later.md));
sounds and quiet hours (not drawn: the system's own Focus modes apply); notifying on a task's due date (no time of
day in Tudu); an Inbox item for a Jira issue (not drawn); Windows and Linux (no build).

## Choices

1. **No server push: the open app notifies.** Every Tudu of yours already holds the live stream (SSE); on an
   `inbox.changed` it rereads the Inbox and tells you about the items it has not seen on this computer (the newest
   seen is remembered per browser). No push service, no keys, no table of devices. The cost: a closed Tudu says
   nothing, and the Mac app and a browser tab on the same computer, both open and both hidden, each tell you once.
   The alternative is Web Push with a service worker and a `push_subscriptions` table: closed browsers hear, at
   the cost of the push keys, a worker, and the PWA shell this rewrite kept minimal.
2. **The Mac app uses macOS's own notifications, not the Tauri plugin.** The UserNotifications framework through
   objc2 (the app already uses objc2 for the floating panel), with a delegate so a click says which item was
   clicked and the app opens it. The alternative, tauri-plugin-notification, posts the banner but on the desk a click
   only brings the app forward; the right page would be guesswork.
3. **The switches are per person; permission is per computer.** The five switches save to the server so they
   follow you. Whether this computer may show them is the system's: macOS's one-time ask, the browser's Allow. The
   alternative stores the switches per browser like Appearance, which forgets them on every new computer.
4. **Looking means focused.** In a browser, a hidden tab or an unfocused window counts as not looking; in the Mac
   app, Tudu not being the front app, or its windows hidden. A visible but unfocused Tudu beside your editor is
   told, which is the point. The alternative notifies only hidden tabs, and a Tudu beside your work stays quiet.
5. **Jira is asked only with the switch on, every fifteen minutes, while open.** One JQL per connected space
   (`assignee = currentUser() and created >= -16m`, then Tudu drops the keys it already has). Chunk 10's promise of
   no background sync holds: the switch is the person asking for it, and it starts off. The alternative asks on
   every Inbox open, which misses what you would want told.
6. **Three at a time.** More than three new items at once show three banners and the rest wait in the Inbox, so a
   burst (a space of twenty people answering) never floods the screen. The alternative collapses them into one
   "5 new in your Inbox", which is less to read but hides who.
7. **Open at login is a switch, off by default.** It is the honest answer to "tell me even when Tudu is closed"
   without push: a Tudu that opens with your Mac and lives in the menu bar is always listening. It is yours to turn
   on, as macOS login items should be. The alternative turns it on at install, which surprises people who did not
   ask for a menu bar app.
8. **The mac tests prove delivery, not just posting.** Tudu Test's control channel can read back what macOS holds in
   Notification Center for the app (the delivered list, by identifier), so a test asserts that a banner was
   accepted and delivered by the system, in each state the window can be in. Posting alone is what the app did;
   delivery is what you would see. Permission is the one thing a test cannot grant: on your Mac you allow Tudu Test
   once and the suite fails loudly if it is not allowed; on the GitHub macOS runner the build tries to pre-grant it
   (the notification centre's preferences file, then its daemon restarted) and, if macOS refuses, the delivered
   checks report "not checked here" rather than pass, so CI never claims what it could not see.

## Test plan

Unit (`packages/core`, `packages/ui`, `apps/web`):

| ID      | Component | Case                                                                                                                                                                                |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C14-U01 | core      | The decider: which items notify given the five switches, the defaults (Jira off), looking or not, items seen before; at most three; the update only in the app                      |
| C14-U02 | core      | The words: sent, accepted, declined (with and without a reason), a comment's first line, a Jira issue, a version, each with its title and body and where a click goes               |
| C14-U03 | Settings  | The Notifications row in You; the section with `Tell me when`, five switches and their helpers, the per-computer block for the app, a browser (Allow, Allowed, Blocked) and a phone |
| C14-U04 | web       | The seen mark per browser and space: newest item remembered, nothing twice, a fresh browser is told only of what arrives after it opened                                            |
| C14-U05 | web       | Looking: hidden tab, unfocused window, the app's `focused` from the bridge; a change while hidden is told, the same change while looking is not                                     |
| C14-U06 | web       | The Jira ask runs only with the switch on and a connection, every fifteen minutes while open, keys already in Tudu dropped, the newest seen remembered                              |
| C14-U07 | web       | The browser's permission: Allow asks once, "default" shows Allow, "denied" shows the blocked line, nothing is asked on load                                                         |

API (`apps/server`):

| ID      | Case                                                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C14-A01 | `GET /api/me` carries `notify` with the defaults; `POST /api/me/notify` saves and is idempotent; a bad body is 400; one person's switches never show on another's      |
| C14-A02 | Inbox items carry the sender's name and the task's title; a deleted task's item still reads                                                                            |
| C14-A03 | `jira/assigned?since=` returns issues assigned to you created since then, without keys already in Tudu, through the fake Jira; no connection is 409; a stranger is 403 |
| C14-A04 | Migration 0012 applies on a database at 0011 and `notify` starts null for everyone                                                                                     |

End-to-end, group `notifications` (desktop unless said; a fake `Notification` installed before the page loads
records every banner and its click; looking is faked through the page's visibility and focus; the fake desktop
bridge records `notify` calls):

| ID      | Case                                                                                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C14-E01 | Settings › Notifications on the desk: the row, the section, the switches on but Jira; a switch off survives a reload and a second browser context of the same person                                                    |
| C14-E02 | A task sent (second person) while this tab is hidden: one banner with "Meera sent you a task" and the title; the click focuses the tab on that Inbox item; the same while looking: none                                 |
| C14-E03 | Accepted and declined with a reason: the banners read as written; the switch off: none                                                                                                                                  |
| C14-E04 | A comment on your task while hidden: the banner with the first line; the click opens the task                                                                                                                           |
| C14-E05 | Four items at once: three banners; the Inbox lists four                                                                                                                                                                 |
| C14-E06 | Allow in a browser: the fake's permission goes from default to granted and the block reads Allowed; denied reads blocked and no banner is attempted                                                                     |
| C14-E07 | Jira: the switch on, the fake Jira gets a new assigned issue; after the tick (the test moves the clock) the banner reads "Jira gave you a new issue"; the click opens the panel on it; a key already in Tudu is skipped |
| C14-E08 | Desktop (fake bridge): the same send reaches the bridge's `notify` with the item; `update:ready` while unfocused reads "Tudu is ready: version …"; the fake's click opens the update item                               |
| C14-E09 | Phone: the section as a page with the "only while it is open" line; a hidden tab is told (phone)                                                                                                                        |
| C14-E10 | Tablet: E01 in the dialog (tablet)                                                                                                                                                                                      |
| C14-E11 | Dark: E01 and E02 again in dark                                                                                                                                                                                         |
| C14-E12 | The kit shows Settings › Notifications light and dark and no section overflows at phone width                                                                                                                           |

Desktop, group `desktop` (Tudu Test over its control channel, added to chunk 11's mac suite; a second person acts
through the API; "delivered" means the control channel read the notification back from macOS's Notification Center
by its identifier, "posted" means the app asked for it):

| ID      | Case                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C14-D01 | Permission: the first signed-in launch asks macOS once (the control channel records the ask and the answer); the next launch does not ask; the Settings block reads the state                                                                                                   |
| C14-D02 | Window in front: a task sent posts nothing; the badge rises; the Inbox lists it                                                                                                                                                                                                 |
| C14-D03 | Window behind another app (the harness activates TextEdit): a task sent is posted and delivered with "Meera sent you a task" and the title; the badge rises                                                                                                                     |
| C14-D04 | Window closed (hidden, Tudu in the menu bar): a task sent is posted and delivered; the stream was still open (no reload, the item is there within two seconds); the badge rises                                                                                                 |
| C14-D05 | Window closed for ten minutes (the harness moves the app's clock and lets the window idle): a task sent is still delivered, so a sleeping webview does not lose the stream                                                                                                      |
| C14-D06 | Each kind: accepted, declined with a reason, a comment, a Jira issue (the fake Jira, the switch on, the clock moved fifteen minutes) and `update:ready` are each delivered with the agreed words                                                                                |
| C14-D07 | A switch off (set from a second browser context as the same person): the same send delivers nothing here; on again, it does                                                                                                                                                     |
| C14-D08 | Four at once: three delivered, the Inbox lists four                                                                                                                                                                                                                             |
| C14-D09 | A click: the control channel presses the delivered notification's action (the app's own delegate path, the same code a real click runs); the window comes to the front on that Inbox item; for a comment, the task; for a Jira issue, the panel; for an update, the update item |
| C14-D10 | Quit (⌘Q) while a task is sent: nothing is delivered; on the next launch the badge shows one and the Inbox lists it, with no banner for it                                                                                                                                      |
| C14-D11 | Open Tudu at login: the switch registers the login item (the control channel reads macOS's answer) and unregisters it; the setting survives a relaunch                                                                                                                          |
| C14-D12 | Permission refused (the harness sets it denied): nothing is posted, the Settings block says so, nothing crashes                                                                                                                                                                 |

Not automated: a finger on a real banner (D09 runs the delegate path a click runs; you press one on staging); the
Mac asleep (what arrives while asleep is told on waking, as the stream reconnects; judge it on your Mac); the
browser's real permission dialog (the fake stands in).

## Done when

- The tests above pass three runs in a row locally and in CI, the mac suite included.
- On staging, Tudu Staging on your Mac tells you of a task sent from a phone while you are in another app and
  while its window is closed, the click opens it, and a browser tab does the same after Allow; the switches off go
  quiet; with Open at login on, a restart of the Mac brings Tudu Staging back to the menu bar.
- The section matches the G-States board light and dark.

Open item for you (nothing blocks the build): none. Permission to notify is asked of macOS at run time, not of
Dokploy.
