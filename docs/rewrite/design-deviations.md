# Design deviations

Where the code departs from the canvas or the design system, and why. Written so each entry can be pasted into
the "Build log" sticky on the canvas's Build plan page. The canvas and the design system cannot be edited from
the coding session, so this file is the record and the canvas gets a copy by hand.

## Chunk 00 · Foundations · PR #12 · 20 Oct 2026

- Built as drawn: theme, tokens, the four fonts, 25 primitives, the kit page at `/kit` with light and dark side by side.
- Motion carried over from the Tudu Paper stylesheet verbatim.
- Deviations in the look: none.
- For the Today chunk: the checkbox has no separate 44px hit area in the design (the row is the target). Decide when the row is built.

## Chunk 01 · Sign in and the shell · 20 Oct 2026

- Sign in built as drawn: email, the 6-digit code, every state on the states board, the picture of the day on the desk.
- The sign-in copy says "we" ("We’ll send you a code", "We sent a 6-digit code to …") as drawn on the canvas, although the design system's content rules say the app never says "we". Kept as drawn; a wording decision for the canvas.
- Invites ("Join Northwind") are left for the spaces chunk.
- The fifth wrong code locks it (the states board shows "Too many tries" with the boxes empty and at rest); codes work for ten minutes; at most five codes to one address in ten minutes.
- The shell is built as drawn: sidebar that folds to the rail, the rail on tablets, tabs and the round New task button on phones, the avatar menu with the theme switch. Jira stays out of the bar, sidebar and tabs until it is connected.
- The desktop and tablet avatar menu signs out; phones sign out from Settings, which arrives with chunk 09 (the design puts Settings behind the phone's avatar).
- Today shows the day header and the empty state only; tasks arrive with chunk 02.
