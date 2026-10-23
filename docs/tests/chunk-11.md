# Chunk 11 · Desktop and release tracks · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project core --project web --project server`, `cargo test --manifest-path
apps/desktop/src-tauri/Cargo.toml --features control`, `pnpm e2e desktop --project=desktop` and `pnpm e2e:mac`.

The web app's side of the macOS app runs in Chromium against a fake of the app (`window.__tuduDesktopFake`, installed
before the page loads by `packages/e2e/fixtures/desktop.ts`), which answers what the app would and records every call.
The update feed is tested against a fake GitHub under TEST_ROUTES (`/__test/github`: `POST /release`, `POST /down`,
`DELETE /releases`; `POST /__test/updates/reset` clears the feed's five-minute cache).

The desktop group runs the real app. `pnpm e2e:mac` makes a throwaway updater key and builds Tudu Test twice with it
(this version and one patch up, `.local/mac-run`), starts the API (its feed on the fake GitHub) and the web app, and
launches Tudu Test once per test from a copy of its bundle on a fresh folder (the webview's own data store follows the
folder, so nothing is remembered from another test), with its own fresh user. The tests read the app's state and act
on it over the control channel (`apps/desktop/src-tauri/src/control.rs`) and drive the page with scripts run in the
real WKWebView. They wait on state, never sleep. On a failure the app's log, its last state and a capture of the
screen are kept with the results. Tudu Test hands outside links to its record instead of a browser.

## Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/server`, `apps/desktop`)

| ID      | Component | Case                                                                                                                                                                                                                                                                                                                                               |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-U01 | core      | "Tudu is ready: version 0.38.0" (and Tudu Staging's); staging versions order (0.36.1-staging.130 < 0.36.1-staging.131 < 0.37.0 < 0.37.1-staging.132 < 0.38.0); the version in a tag or release name; the next staging version; release notes to clean paragraphs and lists; the tracks' names and identifiers                                      |
| C11-U02 | InboxItem | The app kind: the mark as the avatar, "Tudu is ready: version …", the notes as the quote (plain in the list), the dot, See what's new when folded; the reading pane's What's new reports and Restart to update reports once, says Restarting… and stays busy; a restart that fails frees the button                                                |
| C11-U03 | web       | The bridge: found from the Tauri internals, never on the web; the commands it calls; the fake; outside links through the opener in the app and a new tab on the web; a chip saves and toasts "Saved to Downloads." in the app, its name without the size; a stored chip opens in the editor as a chip                                              |
| C11-U04 | web       | Updates: a check on launch and every four hours, never two at once; a ready version is kept and unread; a failed check shows nothing and the next one tries again; read is remembered per version and a newer one is new again; the item's entry; Restart relaunches and a failed relaunch toasts                                                  |
| C11-U05 | web       | The floating window: Add task hides it after the tick and goes to the last space's Today; Esc closes a picker, then hides; a click on the clear part hides; the draft stays and the line takes the keyboard on the summon; with no session the desk is asked for Sign in and nothing shows                                                         |
| C11-U06 | web       | The top bar is the drag region only in the app; the dock badge sums the Inbox counts across spaces, adds the version once (only with a team space) and is 0 when caught up; the switcher counts the version in each team space                                                                                                                     |
| C11-U07 | server    | The manifest from a release: version, notes, date, the platform entry with the signature and the download address on the API's own origin; staging reads the `staging` pre-release (version from its name); a release without the bundle or signature is 404; no token 503; GitHub unreachable 502; cached five minutes                            |
| C11-U08 | desktop   | Rust: the summon is ⌘⇧N; the track from the bundle identifier (name, web address, feed); the tray menu per track (removed in chunk 20: the tick has no menu); the floating window's place on the pointer's screen; only Tudu on the web opens in a window; saved files keep their name and never overwrite; each data folder its own webview store |
| C11-U09 | theme     | A theme picked in another window of the same site (a storage event: the desk, while the floating window is open) repaints this one and every useTheme; a cleared storage is System; a page that read the choice earlier takes up the stored one on mount, and the floating window again on the summon                                              |

## API (`apps/server`)

| ID      | Case                                                                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-A01 | `GET /updates/latest.json` answers the manifest from the fake GitHub's latest release; a newer release shows after the reset; GitHub down is 502 and nothing is kept; no token is 503; no track is 404      |
| C11-A02 | `GET /updates/download/Tudu.app.tar.gz` streams the release's bundle with its size and type; any other name (the signature, the dmg) is 404                                                                 |
| C11-A03 | The feed needs no session (the updater is not a web page) and the GitHub token is never in an answer or a header; the fake GitHub refuses a read without a token, as GitHub does for the private repository |

## End-to-end, group `desktop` (the fake app; desktop project)

| ID      | Case                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-E01 | In the app the sidebar's head leaves room for the traffic lights (50px), a strip over the sidebar and the top bar drag the window, and the app hears who is signed in; the same page on the web has none of it                                    |
| C11-E02 | A new version: the sidebar's Inbox count and the dock badge rise by one; Updates shows "Tudu is ready: version 0.38.0" with the dot and its notes; opening it shows the notes and both buttons, the dot and the counts go; a reload keeps it read |
| C11-E03 | Restart to update says Restarting… and the app is asked once; with the app refusing, "Couldn't restart. Quit and open Tudu again to finish." toasts and the button frees                                                                          |
| C11-E04 | The floating page: write and Add task, the tick, then the window goes; the task is on the desk's Today without a reload; Esc hides and the draft is there with the line focused on the next summon; a click outside the bar hides                 |
| C11-E05 | Not signed in: the floating page stays on /quick-add with nothing shown and asks the desk for Sign in on the summon; after signing in there, the bar adds a task                                                                                  |
| C11-E06 | Open in Jira goes to the app's opener, never a new window; an attachment chip is fetched, handed to the app to save and toasts "Saved to Downloads."; a task sent to you puts 1 on the dock                                                       |
| C11-E07 | Two spaces: the version is in both Inboxes and counted once on the dock; reading it in one reads it in the other                                                                                                                                  |
| C11-E08 | Dark: a new version (E02) and the floating page (E04)                                                                                                                                                                                             |
| C11-E09 | The floating page follows the theme picked on the desk: Dark from the avatar menu with the bar open paints it dark; Light picked while it is put away is painted on the next summon                                                               |

## Desktop, group `desktop` (`packages/e2e/mac`, Tudu Test on a Mac)

| ID      | Case                                                                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11-D01 | Launch: the test track and version, ⌘⇧N registered, the tray's tooltip and (since chunk 20) no native menu, no badge; the window opens Tudu on the web on Sign in; the code typed in the real page lands on Today and the app hears you are signed in                               |
| C11-D02 | The window: room for the lights and the drag region; closing it hides it and the process stays; the menu bar sheet's Open Tudu (chunk 20; the tray's Open before it) brings it back focused; the dock icon (reopen) brings it back; Quit from the sheet's ⋯ ends the process with 0 |
| C11-D03 | The summon: the floating window shows always on top, borderless, focused, 640 wide, top centre of its screen, the line focused; the desk stays visible and unfocused; the summon again hides it; a hidden desk stays hidden; Esc hides it                                           |
| C11-D04 | Add from the floating bar: the tick, then the window hides within 1.5 s; the task is on the server and on the desk's Today without a reload; a draft typed and left is there on the next summon                                                                                     |
| C11-D05 | Not signed in: with the desk closed, the summon brings it back focused on Sign in and the floating window stays hidden; after signing in the summon shows the bar                                                                                                                   |
| C11-D06 | An update is ready: the feed serves the next version; the app checks on launch, downloads and verifies it; the sidebar's Inbox count rises by one; Updates shows "Tudu Test is ready: version …" with the dot, its notes and both buttons; read stays read after hide and show      |
| C11-D07 | Restart to update: the app installs the next version over its bundle and relaunches; the channel comes back from a new process on the new version; nothing is ready any more and the item is gone; still signed in, on Today                                                        |
| C11-D08 | Update failures: the next version with a signature that does not match is refused (the state says so) and nothing shows; the feed down shows nothing; the next check with a good bundle downloads it and the item shows                                                             |
| C11-D09 | The dock badge: a task sent by a second person makes it "1", a comment on your task "2", a task sent in a second space "3"; reading the comment and declining both requests in the Inbox clear it                                                                                   |
| C11-D10 | Links and files: Open in Jira (the fake Jira) and a link in a comment are handed to the default browser, and a page sending itself elsewhere too, the window staying put; an attachment chip lands in Downloads and "Saved to Downloads." toasts                                    |
| C11-D11 | Across launches: quit and launch on the same folder and you are still signed in, the dark theme you picked holds, the floating draft holds; a launch on a fresh folder starts on Sign in                                                                                            |
| C11-D12 | Two spaces in the app: the version is in both Inboxes, unread, counted once on the dock; reading it in one reads it in both                                                                                                                                                         |

Not automated: Gatekeeper on the first open of a downloaded dmg, About Tudu, the look of the window and the bar over
other apps, a real key press of ⌘⇧N (the tests press it through the same handler), the default browser actually
opening, and the real feeds over the internet, which the `staging` pre-release and the 0.37.0 release exercise
themselves.
