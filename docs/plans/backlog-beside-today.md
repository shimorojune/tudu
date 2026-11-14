# The Backlog beside Today (#102)

Status: approved by Rohit on 14 Nov 2026 and built (see "As built" at the end). Canvas approved by Rohit on 14 Nov (Today page, boards `T-Backlog`, `T-Backlog-Dark`,
`T-BacklogStates`, `T-BacklogStates-Dark`, `T-BacklogMotion`, sticky `p01-backlog-draft`, canvas Version 234).

Issue #102 (0.41.1, Mac, Today): "We need a way to open the backlog alongside today such that we can quickly move items
in and out of backlog". Week already has a Backlog tile; Today has no way to show it.

## 1. What the person gets

- On the desk (Mac app, and a browser at desktop width), Today's switch reads **Backlog · Day · 2 days**.
- **Backlog** opens the Backlog as a sheet on the **left** of the day. It slides out from behind the day and pushes the
  day to the right: the mirror of 2 days, same move (`--dur-spread` 240ms, `--ease-settle`). **Day** folds it back.
- Between **2 days** and **Backlog**, the open sheet folds back behind the day first, then the other slides out on its
  side (two moves, 260ms apart). The switch shows the new choice at once. The day never stretches.
- The choice is remembered per computer, like 2 days is today (`tudu.view`).
- Tasks move between the two sheets:
  - **Drag**, either way. Same flight as dropping on another day (#77): the card glides in, the old gap folds.
  - **Click**: a Backlog row's calendar button (Today, Tomorrow, a date), or a day row's day menu (Backlog). The row
    folds away, the other sheet opens a gap with the wash, and a toast offers Undo. This already exists in `TaskList`;
    it only needs the other sheet to be on screen.
- The Backlog sheet is lean: eyebrow "No day", title Backlog, the count ("5 tasks", "Nothing waiting"), the open tasks
  and "Add to the Backlog…". No project filter and no Crossed off view: those stay on the Backlog page (a filtered list
  can't take drops). Crossing a task off there folds it away with Undo, as on the Backlog page.
- Turning the day (arrows, calendar, sidebar week) keeps the Backlog beside.
- Tablet and phone: no change (2 days is desk only too). They keep More › Backlog.
- **All spaces**: not in this change. Its Today keeps **Day · 2 days**; the Backlog choice is hidden there. If Rohit
  wants it, it is a follow-up with its own canvas draft (space pills, gathered Backlog, moves keep the task's space).

## 2. States (from `T-BacklogStates`, light and dark)

| State          | What shows                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading        | The Backlog header at once (no count yet), its list as `TaskListSkeleton` (4 rows). It takes no drops until loaded (a drop goes back home).                             |
| Empty          | Count "Nothing waiting", the "Nothing waiting." words (no logo, no button), and the writing line. The whole sheet still takes a drop.                                   |
| Error          | `EmptyState tone="error"`: "The Backlog didn't load." / "Check your connection. Your day is still here." / Try again (spinner while it retries). The day keeps working. |
| Offline        | Today's one offline banner over both sheets. Moves happen at once and sync later (the outbox, as today).                                                                |
| A long Backlog | The Backlog sheet is as tall as the window and scrolls on its own; the day never moves.                                                                                 |

## 3. Motion (from `T-BacklogMotion`)

| Part                                   | Motion                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Day ↔ Backlog                          | `Spread` on its start side: `--dur-spread` 240ms, `--ease-settle`                                                  |
| 2 days ↔ Backlog                       | Fold the open one (240ms), then open the other; 260ms apart                                                        |
| Drag across                            | The #77 flight: lift `--dur-arrive`, glide + fold `--dur-fold` 300ms                                               |
| Move with a click                      | `closeRow` 300ms, `openRow` `--dur-row-open` 360ms, wash 1.2s, toast 200ms                                         |
| The Backlog's count words              | When the words change, they rise 3px and fade in (`tp-label-in`, `--dur-menu` 160ms) (new)                         |
| "Nothing waiting." with the first task | Folds away (height and fade, 300ms) under the first task; comes back only after the last task's gap has shut (new) |
| Less motion                            | Every move is a 120ms fade; the card drops in place; the count swaps at once                                       |

## 4. How it is built

### 4.1 Design system (`packages/ui`)

- **`Spread` gets `side?: 'end' | 'start'`** (default `'end'`, today's behaviour). With `'start'` the second page sits
  before the first: `.tp-spread-start` reverses the row, the page's margin moves to its right, its inner sheet is
  anchored left so it comes out from behind the day, and the clip during the move is on the day's side. A `Spread`
  nested in the first page of another keeps its full width while the outer one is closed (the canvas used helmet CSS for
  this; it moves into `components.css`).
- **`DayHeader`**: when `date` changes after the first paint, the date words get `tp-label-in` (the due-words turn,
  #58). Nothing moves on first paint. Under less motion they swap.
- **`EmptyState`** gets `folding` (or the Backlog sheet wraps it with the `closeRow`/`openRow` helpers, whichever is
  smaller once in the code): the words fold away as the first task lands and return after the last gap shuts. Same rule
  `WeekDay` already follows for its empty line.
- Exports, the Kit page (`routes/kit/Controls.tsx` shows the three-choice switch) and the design system bundle follow.

### 4.2 The app (`apps/web`)

- `app/dayView.ts`: `DayView = 'one' | 'two' | 'backlog'`; `readView()` accepts `'backlog'`. Anything else still reads
  as `'one'`.
- `app/AppShell.tsx`: the switch's items become Backlog · Day · 2 days (Backlog only for a space, not All spaces);
  `onChange` stores the choice as is.
- `routes/today/TodayPage.tsx`: on the desk the day sits in two nested spreads: the outer one (`side="start"`, open for
  Backlog) holds the Backlog sheet; the inner one (open for 2 days) holds the second day, as today. A small
  `useShownView()` hook lags the layout by 260ms only when going between 2 days and Backlog, so one closes before the
  other opens. The day's list joins the `days` drop group whenever a second sheet is open.
- `routes/backlog/BacklogPage.tsx`: `BacklogSheet` gets a `beside` mode (or a small `BacklogBeside` next to it sharing
  its query and handlers): no filter, no view switch, eyebrow "No day", `group="days"`, `onReceive` →
  `taskStore.place(key, null, at)`, empty words + writing line, the error state above. The query is the same
  `taskStore.backlogQuery`, so the Backlog page, the Week tile and this sheet stay in step.
- `app/quickAdd.tsx`: with the Backlog beside, a task added with no day is "in view": it flashes in the Backlog sheet
  instead of toasting "Added to the Backlog · Show".
- The task panel opened from the Backlog sheet says "Backlog" in its back line, as on the Backlog page.

No server, database or API change. No migration. No new tokens.

### 4.3 Canvas and design system after merge

- Design system: Spread `side`, DayHeader date turn, the empty fold; the Today docs and the Motion page get the Backlog
  choice.
- Canvas: the switch gains Backlog on `T-Desktop` (+Dark) and `T-Motion` gets the cards; `A-Desktop` stays Day · 2 days
  (All spaces is out). The five draft boards are retitled from Draft to built and move to the canvas's helper-free
  version (the Spread `side` from the bundle instead of board CSS).

## 5. Test scenarios

All of it runs on the PR's CI, not on Rohit's Mac (since 10 Nov the app tests don't run locally).

### New

| ID      | Where                                 | Scenario                                                                                                                                                                                              |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C02-U42 | ui `Spread.test.tsx`                  | `side="start"`: the second page renders before the first visually (`tp-spread-start`), mounts at zero width, gets `tp-on` after two frames, unmounts `SPREAD_MS` after closing; same timings as `end` |
| C02-U43 | ui `Spread.test.tsx`                  | Nested: an inner Spread in the first page of a closed start-side Spread keeps the full width class; opening the outer one doesn't open the inner                                                      |
| C02-U44 | ui `DayHeader.test.tsx`               | `date` change after mount adds the turn class to the date words once; first render has none; under `data-motion='less'` it never does                                                                 |
| C06-U10 | ui `EmptyState` / Backlog beside test | The empty words stay mounted while folding as a task arrives, then unmount; they come back only after a removed last row has folded                                                                   |
| C02-U45 | web `dayView` test                    | `tudu.view = 'backlog'` reads back as `'backlog'`; unknown values read as `'one'`; `setDayView('backlog')` stores it                                                                                  |
| C02-U46 | web `TodayPage` hook test             | `useShownView`: one → backlog and backlog → one switch at once; two → backlog shows `one` for 260ms then `backlog`; a quick second pick cancels the first timer                                       |
| C04-U   | web `quickAdd` test                   | With the Backlog beside on the desk, an undated task added from Quick Add flashes in place and shows no toast; on a phone it still toasts (next free C04 U number at build time)                      |
| C02-E18 | e2e web `today.spec.ts`               | The switch reads Backlog · Day · 2 days at 1440; pick Backlog: the Backlog sheet's box is left of the day's; reload: still open; pick Day: the Backlog sheet is gone                                  |
| C02-E19 | e2e web `today.spec.ts`               | Drag a task from today onto the Backlog sheet, then another from the Backlog onto today; each lands, both counts follow ("6 tasks", ring), and the server agrees (`day` null / today)                 |
| C02-E20 | e2e web `today.spec.ts`               | Click: a Backlog row's calendar button → Today moves it onto the day with a toast; Undo puts it back. A day row's day menu → Backlog moves it into the Backlog sheet                                  |
| C02-E21 | e2e web `today.spec.ts`               | 2 days → Backlog: sampled per frame, the second day's sheet is gone (width 0) before the Backlog sheet starts growing; the day's width never exceeds its one-day width                                |
| C02-E22 | e2e web `today.spec.ts`               | States: an empty Backlog shows "Nothing waiting" and still takes a drop (the words fold away); the Backlog request failing shows the error with Try again while the day works; Try again loads it     |
| C02-E23 | e2e web `today.spec.ts`               | Offline (route blocked): moving a task into the Backlog sheet works at once and syncs when back                                                                                                       |
| C02-E24 | e2e web `today.spec.ts`               | Turning the day with the arrows keeps the Backlog beside; the moved task lands on the shown day                                                                                                       |
| C02-E25 | e2e web `today.spec.ts`               | At 834 and 390 wide there is no Backlog choice; at 1440 in All spaces the switch is Day · 2 days                                                                                                      |
| C02-D02 | mac `desktop.spec.ts`                 | In the real WKWebView: pick Backlog, drag a task across both ways, quit and relaunch: Backlog is still beside                                                                                         |

If a number is taken at build time (other threads number tests too), the next free one is used and `docs/tests` says
which.

### Updated

| ID / file                                                                                                  | Change                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ui `TopBar.test.tsx`, `Segmented.test.tsx`                                                                 | Three items; picking each calls `onChange` with its value                                                       |
| e2e `fixtures/today.ts`, `today.spec`, `detail.spec`, `quick-add.spec`, mac `desktop.spec` (2 days clicks) | The group name stays "Days to show"; clicks find "2 days" by name, so only checks that count the choices change |
| `docs/tests/chunk-02.md`, `chunk-06.md`, `chunk-04.md`                                                     | The new rows                                                                                                    |

### Manual (can't be scripted)

- MC-B01: on the Mac app, light and dark, at the 1200×800 window: open the Backlog, drag both ways, flip 2 days ↔
  Backlog. It should feel like the canvas prototype.
- MC-B02: with a trackpad, drag from the Backlog onto the day and immediately start another drag: nothing sticks.

## 6. Risks

- **The two-step switch.** A pick during the 260ms gap must not leave both sheets half open: the hook keeps only the
  last pick (C02-U46).
- **Width at 1200.** Two sheets at 1200 with the sidebar open are 447px each; the canvas checked this. The sidebar fold
  still works as today.
- **One query, three places.** The Backlog page, the Week tile and this sheet share `backlogQuery`; a move from here
  updates all three. Existing Backlog and Week tests guard their side.
- **Remembered value read by an older build.** An older app reading `tudu.view = 'backlog'` falls back to Day. Fine.

## 7. Release

UI only. No migration, no settings, no flag. Ships with the next normal release; the design system and canvas sync in
4.3 happens right after merge, before the thread closes.

## 8. As built

- The empty words fold with a small `FoldAway` wrapper in the design system (not an `EmptyState` prop).
- The Quick Add check (C04 above) is a browser test, C04-E23, not a unit test: the toast-or-wash choice lives in the
  Quick Add host, which has no unit harness.
- A day row has no day menu of its own unless it was carried over; C02-E20 sends a day's task to the Backlog from its
  panel (Planned › Backlog), the click path every day row has.
- Older 2 days tests now aim at the second day's page by `SECOND_DAY_PAGE` (`fixtures/today.ts`), since the Backlog's
  page is a `.tp-spread-second` too.
