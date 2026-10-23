# Chunk 11 · Desktop and release tracks

Status: approved 22 Oct 2026 as proposed (all eight choices); building on branch `rewrite/11-desktop`.

Boards: 03 Quick Add (the floating bar, light and dark: "summoned over whatever you are doing (the desktop app's
Quick Add window)"; Motion: "the global summon"), 08 Inbox (the Updates item for a new version: "Tudu downloads
new versions by itself; the item says so and offers What's new and Restart to update. Restarting shows its
progress on the button."), 00 Layout ("The window is the desk"), the Logo board (the stacked ink tick, for the app
and tray icons). The design system's InboxItem already draws the `app` kind (the mark as the avatar, "Tudu is
ready: version 2.5", the notes as the quote, What's new, Restart to update with "Restarting…", "See what's new" in
the list). No board draws the window, the tray, installing, or Tudu Staging; those are choices below.

The old app on `legacy` had all of this (Tauri 2, a Quick Add window, ⌘⇧N, a tray, the updater fed from GitHub
releases through the API, semantic-release). Nothing of its code carries over, but what worked there (the
updater's signing key, the release flow, the cookie set-up for the app's origin) shapes the choices.

## Scope

- **The app.** `apps/desktop` is the Tauri 2 shell around Tudu on the web, built twice: Tudu (identifier
  `net.ezdev.tudu`, https://tudu.ezdev.net) and Tudu Staging (`net.ezdev.tudu.staging`, https://staging.tudu.ezdev.net).
  Its windows open the deployed web app through a small bundled loader page, which says "You're offline." with Try
  again when the site can't be reached (see Changed during the build). Both can
  be installed side by side. The main window opens on the last space's Today, 1200×800 by default, no smaller
  than 900×600 (under 1024px the app shows the tablet rail, as the web does). Closing the window hides it; Tudu
  stays in the dock and the menu bar, and the dock icon, the tray's "Open Tudu" or the summon bring it back.
  (Chunk 16: closing now also drops the Dock icon unless Settings › This Mac keeps it, and C11-D02 checks that.)
  ⌘Q quits. The app menu is macOS's: About Tudu shows the version and the track.
- **The window is the desk.** No title bar: the traffic lights sit over the sidebar's top, the top bar is the
  drag region, and the desk runs to the window's edge (choice 1). Everything else looks exactly as it does in the
  browser.
- **The tray.** The ink tick as a template icon in the menu bar. Click: a menu with "Open Tudu", "New task"
  with its shortcut, a line, "Quit Tudu". Tudu Staging says "Open Tudu Staging" and "Quit Tudu Staging".
- **The floating Quick Add.** The summon (⌘⇧N, as in the old app; choice 2) opens a borderless, always-on-top
  window over whatever you are doing, top centre of the screen the pointer is on, holding the floating bar from
  chunk 04 (`/quick-add`). The line is ready to write in. Add task spins, ticks and the window is gone 650ms
  later; the task lands on Today in the space you were last in (the main window shows it live). Esc (a picker
  first), the summon again or a click outside the bar hide it; the draft is still there next time. The main
  window never comes forward for it. Not signed in: the summon opens the main window on Sign in instead.
- **Updates.** The app checks the API on launch and every four hours while it runs (`GET /updates/latest.json`
  on its own track's API), downloads a newer version quietly and verifies the signature. Once it is on disk an
  item appears in Updates in every space's Inbox: the mark, "Tudu is ready: version 0.38.0", the release notes,
  "What's new" (opens the item) and "Restart to update". Restart says "Restarting…", the app relaunches on the
  new version and the item is gone. It counts in the sidebar's Inbox count and the phone-style dot until opened;
  read or not is remembered per version on the Mac. A check or download that fails shows nothing and is tried
  again at the next check. "Couldn't restart. Quit and open Tudu again to finish." if the relaunch fails.
- **Two tracks.** Every merge to master already deploys staging; it now also builds Tudu Staging on a GitHub
  macOS runner, signed with the updater key, and attaches it to the rolling `staging` pre-release (version
  `<next patch>-staging.<run>`, so each build is newer than the last and older than the next release). Tudu
  Staging updates itself from it, so two merges in a row prove the whole path. A release (manual: the Release
  workflow, semantic-release from the conventional commits, tag `tudu-0.37.0` and up, the changelog) builds Tudu
  against the production API, attaches the dmg, the updater bundle and its signature to the GitHub release, then
  deploys production (choice 5). Versions continue from 0.37, as decided.
- **The update feed.** The API serves `GET /updates/latest.json` (Tauri's manifest: version, notes, date, the
  bundle's signature and download address) and `GET /updates/download/Tudu.app.tar.gz` from the GitHub release
  of its own track (staging: the `staging` pre-release; production: the latest release), read with a token since
  the repository is private, cached for five minutes. New settings: `UPDATES_TRACK` (staging or production) and
  `UPDATES_GITHUB_TOKEN`; without a token the feed answers 503 and the app shows nothing.
- **Sign in from the app.** The window is Tudu on the web, so the page and the API share a site and the session
  cookie works exactly as in a browser. The app's commands are granted to that address only. Everything else (the
  code, the outbox, live updates over SSE, photos and files) is the web app as it is.
- **Links and files in the app.** Open in Jira, the join link in an invite, Reply in Jira and any other outside
  link open in your default browser. An attachment chip saves the file to Downloads and says "Saved to
  Downloads." (choice 4), since the browser has no session for the file's address.
- **Dock badge.** The dock icon carries the Inbox count (to answer plus new) across your spaces (choice 3).
- **Build and run.** `pnpm desktop:dev` runs Tudu against your local API; `pnpm desktop:build --track staging`
  makes the Tudu Staging bundle. A third track, `test`, builds "Tudu Test" (identifier `net.ezdev.tudu.test`,
  the local API, its own data folder) with the control channel below compiled in; the other two tracks do not
  contain it. CI gains a macOS job that builds Tudu Test, runs the desktop group against it, and on master also
  builds Tudu Staging for the pre-release. The macOS runner is the only GitHub-hosted cost this chunk adds.
- **Testable for real.** Tudu Test opens a control channel on a loopback port the test harness picks
  (`TUDU_TEST_PORT`, the port written to the app's data folder). It reports the app's state (track, version,
  each window's visibility, focus, position, size and always-on-top, the tray's tooltip and menu items, the
  registered shortcut, the dock badge, the updater's last check, download and error, and every outside link or
  file the app was asked to open), performs what a person would do outside the web page (the summon, a tray
  item, the dock icon, closing a window, an update check) and runs a script in a window's real WKWebView so the
  tests drive the page the way Playwright does. The updater's address and public key are build inputs, so the
  tests run a signed update round trip against a local feed. This is how the desktop layer is tested to the same
  standard as the web (choice 8).
- **States**, from the boards: the floating bar in chunk 04's seven states; the Updates item new, read, in the
  reading pane, Restarting…, and the restart that failed.
- **Data.** No migration. No new sync mutations. The ready version and whether its item was read live on the
  Mac, never on the server.

Out of scope: OS notifications and Settings › Notifications' "A new version of Tudu" switch (later.md, with the
notifications work); the `tudu://` deep link (nothing needs it: sign in is a code, invites are web links); a
Windows or Linux build; Getting started's desktop tick (12); the web app's own refresh when a new build is
deployed (chunk 01's PWA shell); the staging compose and CI runner (unchanged).

## Choices

1. **No title bar; the traffic lights sit over the sidebar.** "The window is the desk" and no board draws a
   title bar. The app sets macOS's overlay title bar with the title hidden, the sidebar's head leaves 28px for
   the lights (only in the app; the web is untouched) and the top bar drags the window. The alternative is a
   plain titled window, which puts a grey strip above the desk.
2. **The summon is ⌘⇧N and is not changeable yet.** The old app's shortcut, kept so your hands know it; the tray
   menu shows it. The decisions log says no keyboard shortcuts for now, and no Settings row is drawn for one. The
   alternative adds a Desktop row to Settings › Appearance to record a shortcut, which is a look to invent.
3. **The dock badge shows the Inbox count.** A macOS convention, not a Tudu design: the same number the sidebar
   shows, summed over your spaces, cleared when the Inbox is caught up. The alternative is no badge.
4. **Attachments save to Downloads in the app.** The file address needs the session, which your browser does
   not have; saving to Downloads with a toast is the smallest honest thing. The alternative opens the file in a
   second app window, which needs a look for that window.
5. **0.37.0 ships at the end of this chunk.** You said the timing is mine to pick for testing the pipeline, so
   the real release is the last step of the review: the Release workflow (semantic-release, the changelog, the
   signed Tudu with its updater bundle and signature on the GitHub release, the production images, the Dokploy
   deploy of a new `tudu-production-app` compose from `infra/production/compose.yaml`) runs for real once Tudu
   Staging has proved the update path. Before that, the same workflow is proved in rehearsal (an input that does
   everything but publish and deploy) on the pull request. The first release replaces the old Tudu at
   tudu.ezdev.net and starts from an empty database, as decided on 20 Oct.
6. **Tudu Staging looks like Tudu.** The same icon; the name under it, the window, the tray and About tell them
   apart. The alternative tints the staging icon, which is a mark the logo board does not draw.
7. **Signed as before.** You have no Apple Developer ID, so the apps are signed ad hoc, as the old app was: the
   first open of a downloaded Tudu needs right-click › Open (on macOS 15, System Settings › Privacy & Security ›
   Open Anyway once), and the updater installs later versions by itself. The update bundles are signed with the
   updater key already in the repository's secrets.
8. **The control channel exists only in Tudu Test.** It is compiled in behind a Cargo feature the test track
   turns on, so Tudu and Tudu Staging never carry it and no setting can switch it on in them. The alternative, a
   runtime switch in every build, leaves a door in the shipped app.

Open item for you (nothing blocks the build): a GitHub token for the API to read releases, a fine-grained token
on eGainDev/tudu with Contents: read, set as `UPDATES_GITHUB_TOKEN` on the staging compose and, before the
release, the production one. I cannot make one from here. The production compose's other settings (database,
storage, mail, auth secret) I set from the Dokploy state as for staging.

## Test plan

Four levels. The web app's desktop behaviour runs in Chromium against a fake bridge (what the app would answer to
invoke, the updater, the opener and relaunch), installed before the page loads and recorded on
`window.__tudu.desktop`, so every path through the page is covered on every project. The API's update feed is
tested against a fake GitHub under TEST_ROUTES. The Rust side's pure parts run under `cargo test`. And the
desktop group, a new level `Cnn-Dxx`, runs the real app: a Playwright project without a browser
(`packages/e2e/mac`, `pnpm e2e:mac`) that launches Tudu Test from its bundle, once per test, on a fresh data
folder (nothing remembered from another test), with its own fresh user on a throwaway database, and drives it
over the control channel. It waits on the app's state and the page, never sleeps, and runs on your Mac and on
the macOS runner; on a failure it keeps the app's log and a capture of the screen. The same rules as the web
group: no shared fixtures, no ordering, three green runs before it counts. `pnpm test:status` learns the new
level. The harness builds Tudu Test once per run (the Rust build is cached), with a throwaway updater key made
for the run, and a second bundle one version up signed with the same key, so the update tests install a real
update.

Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/server`, `apps/desktop`):

| ID      | Component | Case                                                                                                                                                                                                                                                                                                              |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-U01 | core      | Versions: "Tudu is ready: version 0.38.0"; staging versions order (0.36.1-staging.130 < 0.36.1-staging.131 < 0.37.0 < 0.37.1-staging.132); release notes to clean paragraphs and lists; the track's names (Tudu, Tudu Staging) and identifiers                                                                    |
| C11-U02 | InboxItem | The app kind: the mark as the avatar, "Tudu is ready: version …", the notes as the quote, "See what's new" in the list; the reading pane's What's new reports and Restart to update reports once, says "Restarting…" and stays busy; unread dot and read                                                          |
| C11-U03 | web       | The bridge: the app is detected from the Tauri internals, never on the web; the fake bridge; outside links go through the opener in the app and stay plain links on the web; an attachment chip saves and toasts "Saved to Downloads." in the app and opens in a tab on the web                                   |
| C11-U04 | web       | Updates: a check on launch and every four hours, never two at once; a newer version downloads at once and the item appears in every space's Updates with the count; read is remembered per version; a failed check or download shows nothing and is tried next time; Restart relaunches; a failed relaunch toasts |
| C11-U05 | web       | The floating window: Add task hides the window 650ms after the tick; Esc closes a picker, then hides; a click outside the bar hides; the draft survives a hide; the task goes to the last space's Today; with no session the main window is asked to show Sign in and the window hides                            |
| C11-U06 | web       | The chrome in the app: the sidebar's head leaves room for the lights and the top bar is the drag region, only in the app; the dock badge follows the Inbox count across spaces and clears at zero                                                                                                                 |
| C11-U07 | server    | The manifest from a release: version from the tag, notes, date, the platform entry with the signature and the download address on the API's own origin; staging reads the `staging` pre-release and production the latest release; a release without the bundle or signature is 404; the five-minute cache        |
| C11-U08 | desktop   | Rust: the summon's accelerator; the floating window's place on the screen with the pointer; the track from the build (name, identifier, endpoint); the menu's items per track                                                                                                                                     |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-A01 | `GET /updates/latest.json` answers the manifest for the track from the fake GitHub; 503 with no token; 502 when GitHub fails (and the cache is cleared); the answer is cached five minutes and `POST /__test/updates/reset` clears it |
| C11-A02 | `GET /updates/download/Tudu.app.tar.gz` streams the release asset with its size and type; any other name is 404; the signature is only ever in the manifest                                                                           |
| C11-A03 | The feed needs no session (the updater is not a web page) and the GitHub token is never in an answer or a header; the fake GitHub refuses a read without a token                                                                      |

End-to-end, group `desktop` (the fake bridge; desktop project only unless said):

| ID      | Case                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-E01 | In the app: the sidebar's head leaves room for the lights and the top bar is the drag region; the same page on the web has neither                                                                                                                     |
| C11-E02 | A new version: the bridge reports 0.38.0 with notes; the sidebar's Inbox count rises by one; Updates shows "Tudu is ready: version 0.38.0" with the dot; opening it shows the notes and the two buttons and the dot goes; a reload keeps the item read |
| C11-E03 | Restart to update says Restarting… and the bridge's relaunch is called once; with the bridge refusing, "Couldn't restart…" toasts and the button frees                                                                                                 |
| C11-E04 | The floating page in the app: write and Add task; the tick, then the bridge's hide; the task is on Today in another tab without a reload; Esc hides and the draft is there next time; a click outside the bar hides                                    |
| C11-E05 | Not signed in: the floating page asks the main window to show Sign in and hides itself; after signing in there, the bar works                                                                                                                          |
| C11-E06 | Links in the app: Open in Jira goes through the opener; an attachment chip saves through the bridge and toasts "Saved to Downloads."; the dock badge follows the Inbox count                                                                           |
| C11-E07 | Two spaces: the version item is in both Inboxes and counted once in the dock badge; reading it in one reads it in the other                                                                                                                            |
| C11-E08 | Dark: E02 and E04 again in dark                                                                                                                                                                                                                        |

Desktop, group `desktop` (`packages/e2e/mac`, Tudu Test on a Mac):

| ID      | Case                                                                                                                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-D01 | Launch: Tudu Test opens on Sign in; the code from the outbox, typed in the real webview, lands on Today; the state reads the test track and version, ⌘⇧N registered, the tray's tooltip and its three items, no badge                                                              |
| C11-D02 | The window: no title bar and the sidebar's head leaves room for the lights; closing it hides it and the process stays; the tray's Open Tudu brings it back focused; the dock icon (reopen) brings it back; Quit from the tray ends the process cleanly                             |
| C11-D03 | The summon: the floating window shows, always on top, focused, top centre of the main window's screen, 640 wide; the main window stays as it was (hidden stays hidden, visible stays visible and unfocused); the summon again hides it; Esc hides it                               |
| C11-D04 | Add from the floating bar: a title and Enter; the tick, then the window hides within a second; the task is on the server and on the main window's Today without a reload; the draft typed and left is there on the next summon                                                     |
| C11-D05 | Not signed in: on a fresh folder the summon shows the main window on Sign in and keeps the floating window hidden; after signing in the summon works                                                                                                                               |
| C11-D06 | An update is ready: the feed serves the bundle one version up; the app checks on launch, downloads and verifies it; the sidebar's Inbox count rises by one; Updates shows "Tudu is ready: version …" with the dot, its notes and the two buttons; read is kept after hide and show |
| C11-D07 | Restart to update: Restarting…; the app relaunches on the new version (the channel comes back and says so); the item is gone; you are still signed in on the same Today                                                                                                            |
| C11-D08 | Update failures: a bundle whose signature does not match is refused and nothing is shown (the state records the refusal); the feed down shows nothing; the next check with a good bundle shows the item                                                                            |
| C11-D09 | The dock badge: a task sent by a second person makes it "1"; a comment on your task "2"; opening them in the Inbox clears it; it is one count across two spaces                                                                                                                    |
| C11-D10 | Links and files: Open in Jira (the fake Jira) and a link in a comment are handed to the system opener, never loaded in the window; an attachment chip lands in Downloads with its name and "Saved to Downloads." toasts                                                            |
| C11-D11 | Across launches: quit and launch again on the same folder and you are still signed in, the theme you picked holds, the floating draft holds; a second launch on a fresh folder starts clean                                                                                        |
| C11-D12 | Two spaces in the app: the version item is in both Inboxes, read together; the dock badge counts both spaces once                                                                                                                                                                  |

Not automated: Gatekeeper on the first open of a downloaded dmg, About Tudu, the look of the window and the bar
over other apps, and the real feeds over the internet, which the staging pre-release and the 0.37.0 release
exercise themselves. You judge those with Tudu Staging from the `staging` pre-release.

## Changed during the build

- **The windows open the web site.** WKWebView blocks the session cookie from the bundled page's origin
  (`tauri://localhost`) to the API: it is a third party there, and sign in answered 200 but every read after it 401
  (tried for real on 22 Oct). Your call that day: the windows open https://tudu.ezdev.net (Tudu Staging:
  staging.tudu.ezdev.net; Tudu Test: the harness's local web app) through a bundled loader page that shows "You're
  offline." with Try again when the site can't be reached, and the app's commands are allowed for that address only.
  No `tauri://localhost` in CORS, no cross-site cookie settings, no bearer tokens. A03 tests the feed's privacy
  instead. A side effect: the web inside the app is always the deployed one; the app's own updates carry the shell
  (windows, tray, summon, updater) only.
- **The floating draft is kept on the Mac** (D11 says it holds across launches; the bar only kept it while the window
  lived). A kept day that has gone by becomes today.
- **A finished download tells the page at once** (`update:ready`), whoever asked for the check, and checks run one
  after another instead of a second one answering early. Both came out of D08.
- **The test track's feed address is read at launch** (the API's port changes per run); its updater key is a build
  input, as planned.
- **Found and fixed on the way:** the notes editor took a stored attachment chip for a plain link (the link mark's
  rule won the tie), losing its name and size; the chip's rule now goes first (C11-U03 covers it).
- **D10:** an invite's join link appears only in email, so the outside link is a link in a comment (links in the
  notes editor are for editing, on the web too).

## Done when

- The unit, API, end-to-end and desktop groups above pass three runs in a row locally and on CI (the desktop
  group on the macOS runner); the Release workflow's rehearsal is green on the pull request.
- Tudu Staging, from the `staging` pre-release, signs in to staging, summons the floating bar over another app,
  adds a task that appears live in the main window, and updates itself to the next master build from the Inbox.
- 0.37.0 is released: Tudu installs from the GitHub release, signs in to production, and the next release after
  it arrives in its Inbox.
