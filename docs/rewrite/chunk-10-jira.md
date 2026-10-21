# Chunk 10 · Jira

Status: approved 22 Oct 2026 as proposed; built 22 Oct 2026 on rewrite/10-jira.

Boards: 04 Jira panel (desktop with the prototype, desktop dark on a preview, tablet at 460px, phone with the Jira
tab, phone dark with a sheet open, Jira not connected on the desk and on a phone, Adding Jira on the web frame by
frame, Connecting Jira with every refusal and an expiry, the panel in twelve states light and dark, Motion), plus
Settings › Apps on board 10. The parts are the design system's JiraPanel (its connect form, the issue preview, the
linked-task chip, the day picker), AppsPanel, JiraMark (shipped in chunk 00), the top bar's Jira button and the
sidebar's Apps section (chunk 01, waiting for a connection), the phone tab's Jira icon, the row's Jira signal (chunk 02) and the task panel's Jira fact. The styles are in the vendored stylesheet (Phase 04).

## Scope

- **Jira is optional.** Tudu starts with no apps: no Jira in the sidebar, the top bar or the phone's tabs. The
  sidebar's Apps section holds one quiet "Add an app", which opens Apps (a 480px panel: "Bring work from the tools
  you use next to your day. Everything here is optional; Tudu works fine on its own.", the Jira row with one line
  on what it does and Connect, "More apps will show up here."). On phones Apps is a row in More; Connect pushes the
  form in inside More, with ‹ Apps back.
- **Connecting.** Connect opens the Jira panel on its form: the mark, "Your Jira issues, next to your day", the
  Jira address, the personal access token (hidden, with Show), the fine print ("Make one in Jira under your profile
  → Personal access tokens. A read-only token is enough. Tudu keeps it encrypted on its servers and uses it only to
  read your issues.") and Connect Jira. Connect says "Checking…" and locks the fields while Jira answers; a yes
  draws the tick ("Connected") for under a second, then the skeleton rows, then the list, "Synced just now". Jira
  fades into the sidebar (with its count) and the top bar at that moment; on phones a Jira tab appears and comes
  forward. ‹ Apps leaves without saving anything. Jira's no comes back under the field it is about, in plain words,
  and clears as soon as you edit the field: a token Jira refuses, an address that can't be reached ("Check it, or
  that you're on your company network."), a token that can't read issues, and not an address (checked before
  anything is sent).
- **The panel.** Opens from the top bar's button or the sidebar's Jira, 560px at the right of the page (460 on
  tablets), no veil: the day beside it stays live and never moves, and Jira stays open while you work and turn
  days. The header: the mark, "Jira", "jira.northwind.io · Synced 12 min ago", Refresh (spins while syncing,
  "Syncing…"), More (Disconnect Jira) and ×. Under it the view chip and the search box, then one plain list in the
  order Jira returns: the summary, then the byline (key · status · "Due Thu" or "Overdue since Mon" · the linked
  task). The panel shows only what every Jira has: key, summary, status name, due date; no type icons, no grouping.
- **Views.** The chip opens Views: "Assigned to me" (assignee = currentUser() AND resolution = Unresolved ORDER BY
  updated DESC), your saved views, then "Custom JQL…". Custom JQL opens a small editor under the chip (Run, Cancel;
  Enter runs). A query Jira can't run shows Jira's own reason right under it ("Jira couldn't run this. Field “stauts”
  does not exist…") and the list stays as it was. A query that ran gets "Save as a view": name it, Save view, and
  it joins the Views menu with a toast ("Saved “My open bugs” to your views"). Views are yours, per space.
- **Search.** The box searches across all of Jira (keys and summaries), a moment after you stop typing, with "N
  issues across Jira" above the results and "No issues in Jira match “…”." when nothing does; Clear search goes back
  to the view.
- **Adding to a day.** Each row's quiet calendar button opens the day picker: Today first, then Tomorrow and
  Backlog, then the month. Picking spins the button, then the task's ID and day appear at the end of the byline
  ("↳ ME-120 · Today") with a tick and a soft wash, and the task opens its gap on the day in view. The button's slot
  stays, so nothing in the row moves. The task is the issue's summary, linked to its key, with "Created from
  TUDU-212" in its history. An issue with a task has no calendar button; a second task for the same issue is made
  from the task panel, not the list.
- **The linked task.** Clicking "ME-52 · Today" keeps Jira open, turns the day to the task's day, scrolls to it and
  flashes it with the wash and ring, so you can go issue after issue; a task in the Backlog opens the Backlog page
  on it (on phones the Today or Backlog tab comes forward). A crossed-off task shows crossed off in the chip and
  "Its Tudu task is done." in the preview.
- **The preview.** Clicking a row slides the issue over the list, inside the panel (a sheet with a veil on phones):
  "‹ All issues", the key, Open in Jira; the type, the summary, the facts (Status, Assignee, Priority, Due, Updated),
  Description, In Tudu (its linked tasks, each a button that shows the task), Comments (the last three, "Show N
  earlier comments", "Reply in Jira") and the foot: "Add to a day" or the linked task with Show. Esc steps back:
  the preview first, then the panel.
- **The count.** The top bar's button, the sidebar's Jira and the phone tab carry the number of issues assigned to
  you that have no open task in Tudu yet ("5 assigned to you, not in Tudu yet"). It drops as you add them.
- **Refresh and errors.** Refresh re-asks Jira. If Jira can't be reached with nothing loaded yet: "Couldn't reach
  Jira" with Try again ("Your day isn't affected."). With issues loaded: the last issues stay, slightly faded, under
  a calm banner ("Couldn't refresh." "Showing issues from 12 min ago.", Try again). A token that stopped working:
  "Your Jira token has expired." with Add a new token, which opens the form with the address filled in and only the
  token asked for (Reconnect, Not now); your views and linked tasks stay. Offline: "You're offline." "Showing
  issues from 12 min ago. Linked tasks you add now sync when you're back." and adding still works.
- **Disconnect.** More › Disconnect Jira (a plain item, never red). Jira leaves the sidebar, the top bar and the
  tabs; the panel closes; "Jira disconnected. Your tasks keep their Jira keys." Your saved views go with it.
- **The task panel's Jira fact.** "Link a Jira issue": paste the key, Enter, and the task carries it (the key and
  its status, as drawn). A linked task's fact opens a menu: "Open TUDU-212 in Jira ↗" and "Unlink the issue"
  (toast "Unlinked TUDU-212"). The row's byline shows the key with the Jira mark (chunk 02's signal); the signal
  opens the issue in Jira when Jira is connected and does nothing otherwise.
- **Search joins up** (left out of chunk 07): a Jira key typed in full is the top hit, keys match as words, the
  hit's byline shows the key with the mark, and the hint reads "Search your tasks by title, task ID, Jira key or
  note."
- **Settings › Apps** (left out of chunk 09): the row "Apps" with "None yet" or "Jira" joins the space's group; the
  section says "What you've connected in Northwind. Each person connects their own.", the Jira row ("Bring your
  Jira issues next to your day. Connect with a personal access token." with Connect, or "As rohit@… on
  jira.northwind.io. Only you see your issues." with Disconnect) and "More apps are on the way. Everything here is
  optional; Tudu works fine on its own."
- **States**, as drawn: the form and every refusal, Checking…, Connected, loading, adding, custom JQL with nothing
  found, search with no matches, a JQL Jira couldn't run, saving a view, couldn't reach Jira with nothing to show,
  couldn't refresh with the last issues kept, token expired, offline.
- **Data.** Migration 0008: `jira_connections` (person, space, site, the token encrypted, who the token is in Jira,
  connected at, last checked, state ok or expired, last synced at; one per person per space), `jira_views` (the
  connection, name, JQL, order), and `jira_key` on tasks. task.create takes an optional `jira` key; a new sync
  mutation `task.jira` (key or null) links and unlinks. History events: `created` with source `jira` and the key,
  `jira.linked`, `jira.unlinked`. Online calls (like connecting a space): `POST /api/spaces/:id/jira` (connect and
  reconnect), `DELETE /api/spaces/:id/jira`, `GET …/jira` (the connection, its views and the count), `GET
…/jira/issues?view=` or `?jql=`, `GET …/jira/issues/:key` (the preview), `GET …/jira/search?q=`, `GET …/jira/links`
  (which issues have tasks, from Tudu's own database), `POST …/jira/views`, `DELETE …/jira/views/:id`. The server
  talks to Jira over its REST API (version 2, a Bearer token): `myself` to check the token, `search` for the lists,
  the issue with its rendered fields and comments for the preview. Rendered HTML from Jira goes through the same
  cleaner the notes use.

Out of scope: Jira in the Inbox's Updates ("Jira gives you a new issue", board 08's notifications list; it waits
for the notifications work with Settings › Notifications); the macOS app opening Jira links and the global summon
(11); Getting started's Jira tick (12); Jira Cloud (later.md); creating or changing issues in Jira (the decisions:
read only); components, presets beyond JQL and a Jira field in Quick Add (dropped, 20 Oct 2026).

## Choices

1. **A connection is yours, per space.** Northwind's Jira and Personal's Jira are connected separately, each with
   your own token; a colleague connects their own. This follows the canvas ("each team space has its own … Jira",
   "Each person connects their own") and lets two spaces point at two Jiras. The alternative is one connection per
   person that every space shares.
2. **The panel is in the address.** `?jira` on the page you are on (desk and tablet) keeps the panel through a
   reload and Back closes it, as `?settings=` does; `?jira=TUDU-212` keeps the preview open. On phones Jira is a
   tab and a page, `/northwind/jira`, with `?issue=TUDU-212` for the sheet. The chosen view and a draft JQL are
   kept per browser and space, not in the address. The alternative keeps the panel out of the address (it closes
   on reload).
3. **Tudu asks Jira when you look, never in the background.** The list is fetched when the panel opens, on
   Refresh, and again when it is older than five minutes and the panel is in view; the count is fetched with the
   shell and every fifteen minutes while the app is open. No job polls Jira for you, so a token is only ever used
   while you are there. "Synced 12 min ago" is the last answer's time. The alternative syncs every few minutes on
   the server so the count is always fresh.
4. **The token is encrypted with a key derived from AUTH_SECRET.** AES-256-GCM, the key derived from the secret
   the server already has, so staging and production need no new setting. Tokens never reach the browser after
   Connect, never appear in logs, and are deleted with the connection. The alternative is a separate TOKEN_KEY
   setting, which would also have to be added to both Dokploy environments.
5. **The server reaches Jira, not the browser.** Jira Data Center does not answer cross-origin calls, so every
   request goes through the API with the stored token. In production only https addresses are accepted and
   private or loopback addresses are refused with "Couldn't reach Jira at this address"; requests time out after
   ten seconds. This means the Dokploy host has to reach your Jira (see the open question). The alternative, the
   browser calling Jira directly, needs a CORS allowance in Jira's admin and would put the token in the browser.
6. **Linked state comes from Tudu, not Jira.** The issues list from Jira and "which issues have tasks" are two
   reads; the second comes from Tudu's own database and refreshes with every task change (yours or live from a
   colleague), so a task added from the panel shows its chip at once without asking Jira again. Only your own
   tasks count as links; a colleague's task for the same issue is theirs.
7. **A saved view can be removed** from the Custom JQL editor when that view is open ("Remove view", quiet, with
   Undo), not drawn. The alternative leaves saved views in the menu for good.
8. **"Open in Jira" needs a connection.** A task whose key came from before a Disconnect keeps the key in its
   byline and fact as words; the opening link and the status come back when Jira is connected again. The
   alternative stores the site on the task so the link survives a Disconnect.

Open question for you: does the Dokploy host (dokploy.mcp.egainqa.cloud) reach your Jira (beetle.egain.com)? If
not, staging can only be reviewed against the test Jira, and production needs a route (an allow-list or a VPN)
before the real one works.

## Test plan

A fake Jira for the tests: under TEST_ROUTES the API serves `/__test/jira` with the three endpoints the server
uses, a small JQL reader (assignee = currentUser(), issuetype, project, text ~, key =, ORDER BY updated), Jira's
own error for a field that does not exist or an unclosed quote, a token that can't read issues, and a switch that
makes a token expire. End-to-end tests type `http://localhost:<api>/__test/jira` as the address.

Unit (`packages/ui`, `packages/core`, `apps/web`, `apps/server`):

| ID      | Component   | Case                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-U01 | core        | A Jira key is recognised in full and uppercased; the count words; the byline's due words (Due today, Due Thu, Overdue since Mon); the linked chip's words (ME-52 · Today, · Backlog, crossed off); `task.jira` and `task.create` with a key parse; the history lines                                                                                        |
| C10-U02 | JiraPanel   | The header with site and synced, Refresh spins, More › Disconnect reports, Close; the view chip lists the presets, saved views and Custom JQL; the list rows with their bylines; a row's calendar button opens the picker and Today, Tomorrow, Backlog and a day report                                                                                     |
| C10-U03 | JiraPanel   | Adding: busy spins the button, done shows the chip with the tick, a failure toasts and frees the button; a linked issue has no button; the chip reports the task; search filters the view, or asks across Jira and shows the count; no-match and clear                                                                                                      |
| C10-U04 | JiraPanel   | The twelve states: connect, token refused, loading, adding, custom JQL nothing found, search no matches, JQL Jira couldn't run (the list stays), saving a view, couldn't reach Jira, couldn't refresh (issues faded under the banner), expired, offline                                                                                                     |
| C10-U05 | JPConnect   | Not an address and an empty token are caught before sending; Connect reports site and token, says Checking… and locks the fields; a refusal lands under its field and clears on edit; a yes draws Connected then reports; Reconnect keeps the site and asks the token only                                                                                  |
| C10-U06 | JiraPreview | Key, Open in Jira, type, summary, the facts, Description (or none), In Tudu with the linked tasks reporting, Comments with Show earlier and Reply in Jira; the foot's Add to a day or the linked task; ‹ All issues and Esc go back; the sheet form on phones                                                                                               |
| C10-U07 | AppsPanel   | The lead, the Jira row with Connect reporting, Connected with the site and Open, the foot; Settings › Apps with Connect and Disconnect and its lines                                                                                                                                                                                                        |
| C10-U08 | TaskDetail  | The Jira fact: Link a Jira issue takes a key on Enter (lowercase uppercased, a bad key refused), a linked task shows the key and status, the menu's Open in Jira and Unlink report; the row's signal opens the issue only when connected                                                                                                                    |
| C10-U09 | web         | `?jira` and `?jira=KEY` read and written in the address; the phone's Jira and Apps pages and which tab is lit; the panel's state from the reads (connect, reconnect, expired, offline, error, loading); the view picked per space, a removed one falls back to Assigned to me; More and Settings list Apps; a row carries its linked tasks, open ones first |
| C10-U10 | server      | The Jira client: a token refused, an address that can't be reached, a token that can't read issues, Jira's JQL error passed through, an expired token, a timeout; issues and the preview mapped from Jira's answers; rendered HTML cleaned; private and http addresses refused in production                                                                |
| C10-U11 | client      | The links read follows your changes at once: a linked create, a link and an unlink, a move, a cross-off, a delete and its Undo; another space's create is left alone                                                                                                                                                                                        |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-A01 | Connect: a good address and token store an encrypted token (never returned, never in the row as typed), who you are in Jira and the site; each refusal is its own error with the field; a second Connect replaces the token; a non-member of the space is refused; staging's demo Jira answers at /demo-jira only when DEMO_JIRA is on |
| C10-A02 | The connection read: site, synced, who, the views and the count (assigned and unresolved minus your open linked tasks); nothing connected reads so; a colleague's connection is invisible to you and yours to them; Personal and a team space connect separately                                                                       |
| C10-A03 | Issues: the assigned view and a custom JQL return the mapped issues in Jira's order; Jira's error for a bad JQL comes back as its message; an expired token flips the connection to expired and says so; Jira unreachable is a 502 the client keeps its last list on                                                                   |
| C10-A04 | The preview: facts, description as cleaned HTML, comments newest last; search across Jira matches keys and summaries; an unknown key is 404                                                                                                                                                                                            |
| C10-A05 | Links: tasks with a key owned by the caller in the space, with day, title and done; a colleague's task for the same key is not yours; task.changed refreshes the read                                                                                                                                                                  |
| C10-A06 | task.create with a key makes the task with "Created from KEY" in its history; task.jira links and unlinks with their events; the same mutation id twice is one change; a key on a colleague's task is refused; a malformed key is refused                                                                                              |
| C10-A07 | Views: save, list in order, remove; a name twice is refused; views belong to the connection and go with it                                                                                                                                                                                                                             |
| C10-A08 | Disconnect: the connection and its views are gone, tasks keep their keys, the read says not connected; reconnecting after an expiry keeps the views and the state goes back to ok                                                                                                                                                      |

End-to-end, group `jira`:

| ID      | Case                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C10-E01 | No apps: no Jira in the sidebar or the top bar; Add an app opens Apps; Connect opens the form; ‹ Apps goes back with nothing saved                                                                                                                                 |
| C10-E02 | Connect: a short token, a wrong address and a no-read token each say so under their field and the message clears on edit; the right ones say Checking…, Connected, then the list; Jira appears in the sidebar and the top bar with the count; Apps shows Connected |
| C10-E03 | The panel beside Today: turn the day with it open, it stays; Refresh says Syncing… then Synced just now; × closes; a reload with `?jira` brings it back; Esc closes it                                                                                             |
| C10-E04 | Add to a day: Today from the picker; the row appears on the sheet with the wash, the byline shows the key, the chip reads ME-n · Today with the tick, the count drops by one, the task's history reads Created from KEY                                            |
| C10-E05 | Add to another day and to the Backlog: the chip says the day; Show turns the day and glows the row; a Backlog chip opens the Backlog on the row; crossing the task off marks the chip                                                                              |
| C10-E06 | Preview: open an issue, the facts, description, comments and In Tudu; Add to a day from the foot; the linked task's Show; ‹ All issues; Esc steps back to the list, then closes the panel                                                                          |
| C10-E07 | Views and JQL: Custom JQL with a typo shows Jira's reason and keeps the list; a good query turns the list; Save as a view names it and it is in the menu with a toast; the view survives a reload; Remove view with Undo                                           |
| C10-E08 | Search across Jira: a key finds the issue, a word finds summaries, "N issues across Jira", no match says so, Clear search goes back to the view                                                                                                                    |
| C10-E09 | Expired and unreachable: the token expires, the next Refresh shows the banner over the faded list; Add a new token keeps the address and reconnects; Jira unreachable shows Couldn't refresh with Try again                                                        |
| C10-E10 | Task panel: Link a Jira issue by key, the fact and the row's byline show it; search finds the task by its key; Unlink clears it; Disconnect Jira from More: Jira leaves the sidebar and the top bar, the task keeps its key                                        |
| C10-E11 | Phone: More › Apps › Connect pushes the form in, ‹ Apps goes back; connected, the Jira tab appears with its count and the list; an issue opens as a sheet; Add to Today; the chip's Show brings the Today tab forward on the row                                   |
| C10-E12 | Tablet: the panel at 460px from the rail's Jira; the preview inside it; add from the preview (tablet)                                                                                                                                                              |
| C10-E13 | Offline and dark: offline the panel shows "You're offline." with the last issues and Add to Today still works, the task syncs when back; in dark the panel, the form, the preview and the banner paint on the dark surfaces                                        |

Not automated: the panel's slide, the tick drawing on Connect, Jira fading into the sidebar and top bar, the wash
on the chip, the preview's slide, the refresh spin; you judge those on staging.

## Done when

- The tests above pass three runs in a row locally and on CI.
- Staging lets you connect the test Jira (and yours, if the host reaches it), see your issues beside Today, add
  them to days, save a view, search across Jira, preview an issue, reconnect after an expiry and disconnect, on the
  desk, a tablet and a phone, light and dark.
- Jira matches the twelve boards light and dark, and Settings › Apps matches board 10.
