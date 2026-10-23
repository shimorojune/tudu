# Chunk 16 · Tudu in the background

Status: designed, not built (23 Oct 2026). Approved: the Dock icon only while the window is open (choice 1), Show
Tudu in the Dock with two options, Open at login in Settings only with no menu bar entry (choice 3). Drawn on the
canvas, page 13, boards K-Login and K-Login-Dark (Settings › You › This Mac) and K-MenuBar (the count beside the
tick). Branch `claude/project-thread-3ozkfl` once building starts. Depends on chunk 11; chunk 20 (the today sheet,
on master) already assumes it.

The ask: close Tudu completely and have it keep running, without a Dock icon sitting there all day.

## Where the app stands today (chunk 11, on master)

Most of the plumbing is already there. Closing the window (the red light, ⌘W) only hides it; the process keeps
running, and with it everything that lives in the main window's page: the outbox, the live stream (SSE), the update
check every four hours, the dock badge. The floating Quick Add and ⌘⇧N are registered in Rust and work with the
window hidden. The ink tick in the menu bar opens the today sheet (chunk 20, on master): Open Tudu, New task, and a
⋯ with Send feedback… and Quit Tudu. ⌘Q and the sheet's Quit end the process.

What is missing:

1. **The Dock icon never goes away.** Tudu is a regular macOS app, so it sits in the Dock and in ⌘Tab even with no
   window. This is the actual complaint.
2. **Nothing keeps a hidden Tudu awake.** With no window on screen, macOS App Nap coalesces its timers and network,
   and WebKit throttles the hidden page's timers. The SSE socket survives, but outbox retries and the update check
   can run late by minutes. Chunk 14 already promised "the app keeps it alive if macOS would rather it slept"; it
   is not built.
3. **Nothing starts Tudu with the Mac.** After a restart there is no Tudu until you open it. Chunk 14 planned "Open
   Tudu at login" (a switch in Settings › Notifications, off by default); it is not built either.

## Scope

- **Close drops the Dock icon.** When the main window hides, Tudu switches to an accessory app (no Dock icon, not in
  ⌘Tab, the tray stays). When the window shows again (the today sheet's Open Tudu, opening Tudu from Finder, Spotlight or
  Launchpad, a notification click later), it switches back to a regular app first and then brings the window
  forward, so the Dock icon, ⌘Tab and the app menu (and with it ⌘C, ⌘V, ⌘Z in the page) are there while you work.
  The floating Quick Add never changes the policy: summoning it from the menu bar state leaves no Dock icon behind.
- **Quit is quit.** ⌘Q and Quit Tudu in the today sheet's ⋯ end the process. Close is the only way into the background.
- **Kept awake while hidden.** While the window is hidden Tudu holds a macOS activity that opts it out of App Nap
  but still lets the Mac sleep (`NSProcessInfo` `beginActivity`, user-initiated, idle system sleep allowed), and the
  webviews are set to keep running when not visible (WebKit's inactive scheduling policy set to none, macOS 14+,
  which is the app's minimum). The activity ends when the window shows. Energy: one idle SSE socket and a timer
  every few seconds at most; Activity Monitor is the check.
- **Open at login.** Registered with macOS as the app itself (`SMAppService.mainApp`, macOS 13+), so it shows in
  System Settings › General › Login Items under Tudu and you can switch it off there too. Off until you turn it on.
  A launch at login starts straight into the menu bar state: no window, no Dock icon. A launch you make yourself
  opens the window as today.
- **The menu bar stays the way back in.** With no Dock icon, the ink tick is the one always-visible handle. Left
  and right click both open the today sheet (no native menu, decided 23 Oct 2026 with the menu bar design); its
  Open Tudu brings the window back, and its ⋯ holds Send feedback… and Quit Tudu. Signed out, the sheet says "Sign
  in to see your day." with Open Tudu, and its ⋯ holds Quit Tudu. Opening Tudu again from Finder or Spotlight also
  brings the window back (macOS sends the running app a reopen). The sheet is a webview created hidden at launch,
  so it is kept awake with the rest.
- **Data.** None. No migration, no API change. The login item lives with macOS, not on the server.

Out of scope: push while Tudu is quit (later.md); a Windows or Linux build; the menu bar's content (the menu bar
thread, now chunk 20); notifications themselves (chunk 14).

## Choices

1. **The Dock icon shows only while the window does.** The Dropbox and Docker pattern: in the Dock while you work in
   it, gone when you close it. The alternative, a menu-bar-only app that is never in the Dock, loses ⌘Tab to the
   window and the app menu, and without the app menu macOS gives the page no Edit shortcuts (copy, paste, undo
   break in the editor) unless the app builds its own key handling. Approved 23 Oct 2026 as the default, and on
   your ask the same day Settings › This Mac gains "Show Tudu in the Dock": While the window is open (default),
   Always (today's behaviour, badge included). No Never option (your call, 23 Oct 2026). Drawn on K-Login.
2. **The Inbox count moves to the menu bar while the Dock icon is gone.** Today the count is the Dock badge (chunk
   11, choice 3); with no Dock icon it would vanish exactly when you are not looking. The count beside the tick
   (the tray's title, in the menu bar's own font) keeps it, and only while the Dock icon is hidden; with Show Tudu
   in the Dock on Always the badge stays and the tick has no count. Drawn on K-MenuBar; chunk 20 left building it
   to this chunk.
3. **Open at login lives in Settings only.** A switch in a new Settings section, You › This Mac ("How Tudu runs
   on this Mac.", Mac app only), next to Show Tudu in the Dock. No entry in the menu bar's menus (your call, 23 Oct
   2026). States: off (the default), on, macOS waiting for your OK (with Open Login Items) and macOS refused. Drawn
   on the canvas, page 13, K-Login and K-Login-Dark. Chunk 14's
   Notifications section, when it lands, points to This Mac instead of a second switch.
4. **⌘Q quits.** The macOS convention, and the only way to really stop it besides the today sheet's Quit Tudu. The alternative makes ⌘Q
   hide too (as some chat apps do), which leaves no keyboard way to quit and surprises people.

## Risks I cannot settle from here

- **Ad hoc signing and the login item.** `SMAppService` wants a signed app. Ad hoc signing usually registers, but
  macOS may show "Tudu" from an unidentified developer in Login Items, or refuse after an update replaces the bundle.
  Only your Mac can tell; if it refuses, the fallback is a LaunchAgent plist (what `tauri-plugin-autostart` does),
  which shows under "Allow in the Background" instead.
- **Policy switching quirks.** Going from accessory back to regular needs an explicit activate, or the window comes
  up behind the frontmost app; that is a known Tauri and AppKit wrinkle and the D-tests below cover it.
- **WebKit's inactive policy** is set through the webview's configuration with objc2; Tauri does not expose it. If
  it ever misbehaves, App Nap opt-out alone still keeps timers within seconds.

## Changes to earlier chunks

- Chunk 11: "Closing the window hides it; Tudu stays in the dock and the menu bar" becomes "Tudu stays in the menu
  bar". The dock badge shows while the Dock icon does. C11-D02 is rewritten (below).
- Chunk 14: "The window closed" and choice 7 point here; Settings' switch drives the same login item.
- Chunk 20: nothing changes in the sheet; C20-D02 (tick a task with the window hidden) starts passing for real once
  the window can hide without a Dock icon.
- design-deviations.md: the Desktop register lines and a Chunk 16 history block, in the same PR.

## Test plan

Unit (`apps/desktop`, Rust): C16-U01 the policy for each state (window shown, hidden, floating shown with the window
hidden, launched at login); C16-U02 the tray has no native menu (left and right click both open the today sheet) and its tooltip per track; C16-U03
a launch is "at login" only when macOS says so.

Desktop, group `desktop` (Tudu Test over the control channel, which learns to report the activation policy, the
App Nap activity, the tray's title and the login item's status):

| ID      | Case                                                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C16-D01 | Close the window: hidden, policy accessory, the process stays, the activity is held; Open Tudu from the today sheet: regular, the window is in front and focused, the activity is gone                |
| C16-D02 | Hidden for a while: a task sent by a second person reaches the hidden page within seconds (the badge count in the tray's title rises); an outbox write made just before closing reaches the API |
| C16-D03 | The summon with the window hidden: the floating bar shows and adds; the policy stays accessory before, during and after                                                                        |
| C16-D04 | Reopen: launching the bundle again while hidden brings the window back as a regular app                                                                                                       |
| C16-D05 | Settings › This Mac › Open at login: switching it on registers the login item (macOS's answer read back), off unregisters, it survives a relaunch; a launch at login starts hidden, accessory |
| C16-D07 | Settings › This Mac › Show Tudu in the Dock: Always keeps the Dock icon and badge after close; While the window is open drops it; the change applies at once and survives a relaunch |
| C16-D06 | Quit Tudu from the sheet's ⋯ (signed in and signed out) and ⌘Q end the process cleanly from both the shown and the hidden state                                                                                                     |
| C11-D02 | Rewritten: closing hides the window and drops the Dock icon; the today sheet's Open Tudu and the reopen bring it back                                                                                            |

Not automated: how it feels over a working day, energy use in Activity Monitor, and Login Items after a real Mac
restart with an ad hoc signed Tudu Staging. You judge those on Tudu Staging.

## Done when

- The cases above pass three runs in a row locally and on the macOS runner, with `pnpm verify` green.
- On Tudu Staging: close the window, the Dock icon goes, a task sent from your phone an hour later shows in the
  menu bar count and in the window when you open it; with Open at login on, a Mac restart brings Tudu Staging back
  to the menu bar with no window.
