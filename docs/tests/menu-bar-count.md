# The number beside the tick · test cases

The plan is [docs/plans/menu-bar-count.md](../plans/menu-bar-count.md). These ids (`MC-…`) come from that plan, not a
chunk, so `pnpm test:status` does not list them in STATUS.md; the test names carry them for `-g`.

## Unit (vitest)

| ID     | Where                                                       | Case                                                                                                                             |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| MC-U01 | `packages/core/src/menubar.test.ts`                         | `todayLeft`: open tasks out of all the gathered ones; someone else's never counts; all done 0; no groups 0                       |
| MC-U02 | `packages/ui/src/components/MenuBarSheet.test.tsx`          | The Inbox line: collapsed, inert and hidden at 0; "2 new in your Inbox" opens the Inbox once; over an empty day                  |
| MC-U03 | `packages/ui/src/components/MenuBarSheet.test.tsx`          | The line grows 0fr→1fr in 200 ms; with Reduce motion it only fades                                                               |
| MC-U04 | `apps/web/src/app/DesktopHost.test.tsx`, `desktop.test.tsx` | Nothing until every space answers; then left and planned; a tick counts down; the same numbers once; the bridge calls `set_tick` |
| MC-U05 | `apps/web/src/app/DesktopHost.test.tsx`                     | A space that fails still lets the others count                                                                                   |
| MC-U06 | `apps/web/src/routes/menubar/MenuBarPage.test.tsx`          | New in the Inbox: the line opens the desk on `/inbox` and nothing else; nothing new, no line                                     |

## Unit (`apps/desktop/src-tauri`, Rust, on a Mac: `cargo test --features control`)

| ID     | Case                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| MC-R01 | Today's count beside the tick with or without a Dock icon; the Inbox on the badge only with one; the dot   |
| MC-R02 | Only the tick is capped (99+); the Dock badge keeps 150                                                    |
| MC-R03 | The tooltip: left today, All done, Nothing planned, the name alone, the Inbox part only when something new |

## Script (`apps/desktop/test`, vitest)

| ID     | Case                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| MC-S01 | `tray-dot.svg/png`: the same tick masked by a clear ring around one dot; the dot inked; below it, the same tick |

## Web E2E (`packages/e2e/tests/menubar`)

| ID     | Case                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| MC-E01 | A request sent to you: the sheet's Inbox line shows and asks the app for `/inbox`; before it, no line |

## Mac E2E (`packages/e2e/mac/tests/desktop.spec.ts`, on Rohit's Mac or the macOS runner)

| ID                | Case                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| MC-D01            | Window closed, 3 today → "3", tooltip "… 3 left today"; a tick in the sheet → "2"; the rest ticked elsewhere → bare, "All done" |
| MC-D02            | Window open, 2 today → "2" beside the tick, no Dock badge (the Inbox is empty)                                                  |
| MC-D03            | A request while hidden → the dot, tooltip "… Nothing planned today · 1 new in your Inbox"; the sheet's line opens `/inbox`      |
| MC-D05            | Signed out: no number, no dot, tooltip "Tudu Test"                                                                              |
| C16-D02 (updated) | Hidden 15 s: the request shows as the dot, today's one task as "1"; reopen: badge "1", "1" still beside the tick                |
| C16-D07 (updated) | Always: badge and dot after close; back to While open: the badge goes, the dot stays                                            |
| MB-D03 (updated)  | `set_tick` 120 → "99+" in both policies; the Dock badge keeps the Inbox's 150                                                   |
| MB-D04 (updated)  | The tick hidden: the Dock icon carries the Inbox count; the tick keeps "2" and its dot                                          |

MC-D04 (a tick on another device moves the number with the window closed) is folded into MC-D01's last step.

## Manual on Rohit's Mac (before merge, results in the PR)

| ID     | Case                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------- |
| MC-M01 | The dot reads clearly on a light, a dark and a tinted-wallpaper menu bar, idle and pressed, with a number |
| MC-M02 | Hover the tick: the tooltip reads as drawn, for 3 left + new, all done, and signed out                    |
| MC-M03 | Tick a task on the phone: the Mac's number drops within a few seconds with the window closed              |
| MC-M04 | The sheet's Inbox line slides in and out without the rows jumping                                         |
