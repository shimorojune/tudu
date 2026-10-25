# Chunk 02 · Today · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project client --project core --project server` and `pnpm e2e today`.
End-to-end tests fix the clock at Sunday 18 October 2026, 10:00, and wait on `window.__tudu.idle()` (the outbox is
empty) before reading the server.

## Unit (`packages/ui`, `packages/client`, `packages/core`)

| ID      | What it checks              | Scenario                                                                                                                                 |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C02-U01 | The row                     | Checkbox, title and the byline with the ID last ("From Sat · ME-41"); a task not numbered yet with nothing else to say has no byline     |
| C02-U02 | Crossing off                | aria-checked, the strike fades in 120ms after the tick, the sparkle once; uncrossing plays nothing                                       |
| C02-U03 | Opening the row             | A click anywhere on the row opens it, and Enter on the title; the checkbox and byline items keep their own job                           |
| C02-U04 | Copying the link            | With a link, the ID writes the task link, lights up with a tick (the words never change), "Link copied"; the row does not open           |
| C02-U05 | The carried pill            | "From Sat", red when slipping; its picker keeps it (Today, the day it is on) or moves it (Tomorrow); crossed off, it opens nothing       |
| C02-U06 | Long titles                 | Two lines (three on phones), full text in the title attribute                                                                            |
| C02-U07 | Order and the keyboard      | Rows in order; Alt with an arrow key moves the focused row, keeps focus and says "Moved to place 2 of 3"                                 |
| C02-U08 | Dragging with a pointer     | Starts after 4px, lifts the row on the slip, the others glide apart, the drop reports the new order, the click that ends it is swallowed |
| C02-U09 | Dragging on touch           | A quick swipe does not lift a row; a 320ms press and hold does                                                                           |
| C02-U10 | Writing on the last line    | The new row opens its gap with the wash; the line stays open and empty for the next                                                      |
| C02-U11 | The "+" between rows        | Writes a task in that slot and keeps the line open under it; waits 120ms on hover; hidden while dragging, on phones and when filtered    |
| C02-U12 | Two lists in a group        | A row dragged over the other list washes it with an ink line where it lands; the drop reports the row and its place                      |
| C02-U13 | flashKey and locateKey      | A row added from outside gets the new-task wash; locate flashes a row and focuses its title                                              |
| C02-U14 | The writing line            | Serif until the first keystroke; Enter adds and keeps writing; Esc stops; blank adds nothing; clicking away keeps what was written       |
| C02-U15 | The date pop                | Beside its pill, flips up near the bottom, hangs left with align end; eases out on Esc (focus back to the pill), a click away, a scroll  |
| C02-U16 | Two days (Spread)           | The second page mounts first, both move in one step, unmount after closing; reduced motion fades; it settles even when frames never run  |
| C02-U17 | The day's ring              | Counts the list's crossed-off rows; the reward plays once when the last is crossed off; uncrossing plays nothing                         |
| C02-U18 | The after-midnight banner   | "It’s 00:40 on Monday. You’re still on Sunday’s list. Nothing has moved." with Start Monday (primary), Stay on Sunday and ×              |
| C02-U19 | Changes apply at once       | Create, cross off, rename, reorder and move show before the server answers; the number lands with the save; a refused change rolls back  |
| C02-U20 | Live events                 | An event for a day refreshes that day only; this tab's own events and other kinds refresh nothing                                        |
| C02-U21 | Positions                   | Between, first, last, alone; renumbering the whole list when two neighbours get too close                                                |
| C02-U22 | Carried labels              | "From Sat" within a week, "From 4 Oct" further back, slipping after two days; "Moved to Tomorrow" words                                  |
| C02-U23 | The working day after 00:00 | The list stays and the page asks once in the small hours; from 04:00, or after more than a day, it moves on by itself                    |
| C02-U24 | No link                     | Without a link (the kit pages) the ID copies itself, "Copied ME-58"                                                                      |
| C02-U25 | Copy refused                | The clipboard says no: nothing lights up, "Couldn’t copy the link. Try again."                                                           |
| C02-U26 | What the chip says          | Named "Copy link to ME-58", tooltip "Copy link"; link mark and tick hidden from readers; the resting chip is no wider                    |
| C02-U27 | Links for a list            | `linkFor` reaches every row: each ID copies its task’s page                                                                              |
| C02-U28 | copyText                    | True once the clipboard has it; false when it refuses, throws or is missing                                                              |

## API (`apps/server`)

| ID      | What it checks        | Scenario                                                                                                                                               |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C02-A01 | Create                | A task lands on its day with the next number (ME-1, ME-2) and its place at the end                                                                     |
| C02-A02 | Idempotent sync       | The same mutation twice applies once; a replayed older rename does not win                                                                             |
| C02-A03 | Last write wins       | Two renames with different clocks keep the later one in either arrival order; fields are separate (a cross off does not undo a rename)                 |
| C02-A04 | Cross off and uncross | Set and clear the time; the day's counts follow                                                                                                        |
| C02-A05 | Reorder               | The day comes back in the new order                                                                                                                    |
| C02-A06 | Move                  | To another day or to the Backlog, at the end there when no position is given                                                                           |
| C02-A07 | Delete                | Soft: gone from the day after a reload; a later change to it is refused (410); numbers are never reused                                                |
| C02-A08 | Carrying forward      | Asking for today moves open tasks from earlier days to the top of today, once, oldest first, with where they came from; keep and move clear the marker |
| C02-A09 | Someone else's space  | Every change is refused with 403 and nothing changes; reading the day is 403 too                                                                       |
| C02-A10 | Live events           | Each accepted change tells the space's people which days changed; a refused one says nothing; strangers hear nothing                                   |
| C02-A11 | Reading a day         | The tasks with their IDs and the counts for the ring; the calendar's dots per day; a day that does not exist is 400                                    |
| C02-A12 | Numbers under load    | Sixteen creates at once from two clients get 1 to 16 with no repeats                                                                                   |

## End-to-end (`packages/e2e/tests/today`, group `today`)

| ID      | What it checks           | Scenario                                                                                                             |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| C02-E01 | Writing                  | Three tasks on the last line, in order with ME-1 to ME-3; a reload shows them                                        |
| C02-E02 | Crossing one off         | Struck through in place, "1 of 3 crossed off", still crossed off after a reload; uncross it                          |
| C02-E03 | Finishing the day        | "All crossed off · That’s the day" ("All done" on phones)                                                            |
| C02-E04 | Reorder by drag          | The third task dragged to the top; the order survives a reload                                                       |
| C02-E05 | The "+" slot             | A task written between two others (desktop)                                                                          |
| C02-E06 | Turning the day          | Arrows and the calendar; each day keeps its tasks; Back to today                                                     |
| C02-E07 | Two days                 | Open the second sheet, drag a task onto Monday, it is there after a reload; back to one day (desktop)                |
| C02-E08 | Carried over             | Saturday's open tasks show on Sunday with "From Sat" (the crossed-off one stays); keep one; move another to tomorrow |
| C02-E09 | Copying the link         | The row’s ID says "Link copied", the clipboard holds `<origin>/t/ME-1` and that address opens the task               |
| C02-E10 | Offline                  | The banner shows; add and cross off still work; back online, the server has both with their numbers                  |
| C02-E11 | Live                     | A task added and one crossed off in a second tab show in the first without a reload                                  |
| C02-E12 | Phone                    | Write, cross off, swipe to the next day and back (phone)                                                             |
| C02-E13 | Loading and error states | A slow day shows the skeleton under the header; a failed day says "This day didn’t load." and Try again recovers     |
| C02-E14 | Dark mode                | Write and cross off in the dark theme; it survives a reload                                                          |

Not automated: the feel of the drag, the sparkle and the reward. Judge those on the day page and the kit.
