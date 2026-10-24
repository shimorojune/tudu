# Menu bar tick · test cases

The plan is [docs/plans/menu-bar-tick.md](../plans/menu-bar-tick.md). These ids (`MB-…`) come from that plan, not a
chunk, so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`.

## Unit (`apps/desktop/src-tauri`, Rust, on a Mac: `cargo test --features control`)

| ID     | Case                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------- |
| MB-U01 | The count beside the tick: none or 0 shows nothing; 7 and 99 as they are; 100 and more read 99+          |
| MB-U02 | Only the tick is capped: with a Dock icon the badge keeps 150                                            |
| MB-U03 | The tick's place is seeded only when macOS has none; any saved place (yours, or an earlier seed) is kept |
| MB-U04 | A hidden tick keeps the Dock icon with the window closed; Always and an open window are regular anyway   |

## Script (`apps/desktop/test`, vitest: `pnpm test -- --project desktop`)

| ID     | Case                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| MB-S01 | `icons/tray.svg` is the bare ink tick: one path with `INK_SHAPE`, no box, black on clear, 36×36     |
| MB-S02 | `icons/tray.png` is that tick: 36×36 RGBA, inked in the middle, clear where the old box's edges ran |

## Desktop (`packages/e2e/mac`, Tudu Test on the macOS runner: `pnpm e2e:mac -g MB-D`)

| ID     | Case                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| MB-D01 | No saved place: a launch seeds it (20) under the status item's own autosave name, `Item-0`                         |
| MB-D02 | A saved place (400, as a ⌘-drag leaves it) is kept at launch and across a relaunch                                 |
| MB-D03 | Window closed, 120 in the Inbox: 99+ beside the tick, no badge; 99 reads 99; reopened: the badge reads 120         |
| MB-D04 | macOS hides the tick (faked over the control channel): the Dock icon and badge stay; shown again: back to the tick |
| MB-D05 | C16-D01, C16-D02, C20-D01 and C20-D04 still pass (the policy is set only when it changes)                          |

## Manual (Rohit's Mac, before merge; results in the PR)

| ID     | Case                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------- |
| MB-M01 | Delete Tudu Staging's saved place, launch: the tick sits at the right end of the apps' icons              |
| MB-M02 | ⌘-drag it elsewhere, quit, relaunch: it stays where dragged                                               |
| MB-M03 | Crowd the bar (an app with many menus, on the notched screen): other apps' icons go first, the tick stays |
| MB-M04 | Force the tick hidden: the Dock icon appears; make room: it leaves again with the window closed           |
| MB-M05 | The bare tick reads right in light, dark and a tinted bar, idle and pressed, with a count                 |
