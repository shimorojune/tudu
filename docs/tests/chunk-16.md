# Chunk 16 · Tudu in the background · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project web`, `cargo test --features control` in `apps/desktop/src-tauri` (on a Mac),
`pnpm e2e desktop` and, on the macOS runner, the desktop group in `packages/e2e/mac`.

## Unit (`packages/ui`, `apps/web`, `apps/desktop`)

| ID      | Component | Case                                                                                                                      |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| C16-U01 | desktop   | Rust: the policy for the desk open or closed under each Dock choice; the Inbox count on the Dock or beside the tick       |
| C16-U02 | desktop   | Rust: the Dock choice is kept on this Mac; an empty, old ("never") or torn file reads as While the window is open         |
| C16-U03 | desktop   | Rust: the login item reads as macOS reports it: not registered and not found are off, enabled on, requires approval waits |
| C16-U04 | Settings  | This Mac is listed under You only in the app; Open at login off, on, waiting with Open Login Items, refused; the Dock     |
| C16-U05 | web       | The bridge's four commands and their arguments; `?settings=mac` only in the app; Settings reads the app as it opens       |

## End-to-end (`packages/e2e/tests/desktop`, desktop size, against the fake app)

| ID      | Case                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| C16-E01 | No This Mac on the web; in the app Open at login asks the app, waits for macOS with Open Login Items, is refused |
| C16-E02 | Show Tudu in the Dock: Always goes to the app at once and is read back when Settings opens again                 |

## Desktop (`packages/e2e/mac`, Tudu Test on the macOS runner)

| ID      | Case                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C16-D01 | Close: hidden, accessory, still running, awake, every page's scheduling policy none; Open Tudu from the sheet: regular, front                                                             |
| C16-D02 | Hidden 15 seconds: a request sent to you shows as the tick's dot (today's count beside it, MC), a write made just before closing reached the API; reopen puts the Inbox count on the Dock |
| C16-D03 | The summon with the window hidden shows the floating bar and adds; the policy stays accessory throughout                                                                                  |
| C16-D04 | Reopen while hidden brings the window back focused as a regular app                                                                                                                       |
| C16-D05 | Open at login: on registers (on or waiting), off unregisters, Settings reads macOS across a relaunch; a launch at login starts hidden, accessory                                          |
| C16-D06 | ⌘Q from the shown and the hidden state, and ⋯ › Quit in the sheet while hidden, end the process                                                                                           |
| C16-D07 | Always keeps the Dock icon and the badge after close and holds across a relaunch; While the window is open applies at once                                                                |
| C11-D02 | Rewritten: closing hides the window and drops the Dock icon; the sheet's Open Tudu and the reopen bring it back as a regular app                                                          |
