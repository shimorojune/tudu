# Chunk 12 · First run

Status: approved 22 Oct 2026 as proposed (all seven choices); built on branch `rewrite/12-first-run`.

Boards: 11 Sign in + first run (U-New: "a new person: email, code, then Today with Getting started"; U-Invite: "new
people get Getting started"; U-States: Getting started new, two done, folded, you're set; U-Motion: Getting started,
Folding, You're set, Joining a space). The sign-off sticky: "first run C. New people go straight to Today ("Welcome
to Tudu, Rohit.") with a small Getting started card in the corner. It ticks itself off as you do each thing (your name
and photo, your first task, light or dark, Jira), says "You're set" and leaves. On phones it starts folded beside the
New task button. They start with an empty Personal and no apps." The part is the design system's GettingStarted (the
ring, the fold, the four rows, ×); its styles are in the vendored stylesheet (Phase 11, `tp-gs`). Sign in itself
shipped in chunk 01, Settings › Account and Appearance in 09, Apps and Jira in 10, joining in 08; this chunk only
adds what a new person sees on top of them.

## Scope

- **The card.** A new person lands on Today and, a beat later (400ms, then 320ms in), Getting started rises in the
  bottom-right corner: the ring, "Getting started", "0 of 4", a chevron, × (Hide), and four rows, each a way in:
  1. **Add your name and photo** · So people know it's you → Settings › Account. Done once you have a name.
  2. **Write your first task** · It stays on Today until you cross it off → New task (Quick Add). Done once a task you
     wrote exists, in any space, by any way in (the line, Quick Add, Search, Jira's day picker).
  3. **Pick light or dark** · Or let it follow your computer → Settings › Appearance. Done once you pick Light, Dark or
     System anywhere (Appearance, the avatar menu's switch), on any device.
  4. **Bring your Jira issues** · Optional → Apps (Add an app › Jira). Done once Jira is connected in any space.
     A done row crosses itself off: the circle fills with ink and the tick pops (200ms), the ring fills, the count rises.
     Rows tick at once from what you do in this browser, and `GET /api/me` is the record, so a thing done on your phone
     shows ticked on your Mac at the next load. The card stays on every page of every space (Today, Week, Backlog, Inbox,
     People, Jira) until it is done or hidden; it sits under dialogs, panels and Quick Add.
- **Folding.** The title folds it to one line and back (the list eases its height, 240ms); the fold is remembered per
  browser. Phones start folded, and the card sits beside the New task button (left 10, right 86, bottom 76) on the
  pages with the tabs; it steps aside while a page without tabs is open (Settings, Jira, a task, More › …).
- **You're set.** When the fourth row ticks the title says "You're set", "4 of 4", the ring is full; 1.8s later the card
  sinks and fades (220ms) and never comes back.
- **Hide.** × hides it for good, on every device, with the toast "Hidden. Everything it pointed to is in Settings."
- **Welcome on Today.** While you are new (the card not yet done or hidden) and today is empty, Personal's Today says
  "Welcome to Tudu, Rohit." (your first name; "Welcome to Tudu." until you have one) over "This is your day: one calm
  page. Write the first thing you want to get done; it stays here until you cross it off." with Add a task (the
  writing line, as the plain empty state does). A space you joined by invite says "Welcome to Northwind, Rohit." over
  "Meera and 17 others are here. What you add in Northwind can be shared with them; Personal stays yours." Once a task
  is on the day, or the card is gone, the day reads as it does today ("Nothing planned for today yet."). A space you
  made keeps chunk 08's "It's just you for now" welcome.
- **Welcome back.** A returning person (an account that existed before this sign-in) gets the toast "Welcome back,
  Rohit." ("Welcome back." without a name) on landing, and no card unless theirs is still open.
- **Joining.** Landing in a space from an invite toasts "You joined Northwind. Meera and 17 others are here." ("Meera
  is here." with two of you), for new and returning people alike; a new person gets the card too, as drawn.
- **The kit.** A Getting started section with the four states from the board (new, two done, folded, you're set),
  light and dark, each in its own Pair so the kit's width test holds at phone width.
- **Data.** Migration 0009 adds `user.first_run` (jsonb: `themeAt`, `hiddenAt`), Tudu's own column on Better Auth's
  table as `color` is. Name, task and Jira are read from the rows that already exist (`user.name`, a task you made, a
  `jira_connections` row of yours). `GET /api/me` gains `user.createdAt` and `gettingStarted: { open, done: { name,
task, theme, jira } }`. One new request, `POST /api/me/getting-started` with `{ theme: true }` or `{ hidden: true }`,
  idempotent. No new sync mutations; no SSE.
- **Tests stay honest.** Every end-to-end test signs in a fresh person, so from this chunk every one of them would meet
  the card. `signInFresh` (and the mac harness's sign in) hides it the way × does, through the app's own test hook
  (`window.__tudu.firstRun.hide()`, next to `idle()`), without the toast; the first-run group alone signs in with
  `{ gettingStarted: true }` and sees it. No other group's cases change.

Out of scope: a first-run page before Today (options A and B on the board, not picked); a fifth row for the Mac app
(not drawn; chunk 11's "Getting started's desktop tick" was loose wording); a photo on its own as a tick (the board
ticks the row on the name; the photo stays optional); OS notifications (later.md); a tour, tips or sample tasks (not
drawn, and the decisions say a new Personal is empty).

## Choices

1. **Done comes from what exists, not from clicks.** A row is ticked by the real thing (a name, a task, a theme, a
   connection), never by opening its page, so someone who writes their first task from Quick Add without touching the
   card still sees it tick. Theme is the one that leaves no row, so the web tells the server once when you pick one.
   The alternative records "visited" per row, which ticks a row you only looked at.
2. **The card is per account, on the server.** Hidden, done and the theme tick live on your user row, so a card you hid
   on your Mac is not back on your phone. The fold alone is per browser (as the sidebar's). The alternative keeps it
   all in the browser, which would greet you again on every device.
3. **Write your first task opens Quick Add.** The board's row calls New task, which in Tudu is Quick Add on every page;
   on Today the welcome's own Add a task opens the writing line, as the plain empty state does. The alternative opens
   the line on Today and Quick Add elsewhere, two behaviours for one row.
4. **New means "made by this sign-in".** The server marks the session that made the account (`firstSignIn` on
   `/api/me`); any other sign-in is a returning person ("Welcome back"). (Built this way instead of comparing the
   account's created time with the moment the code was asked for: that called someone who signs out and back in
   within a minute new, and leaned on the device's clock.) The welcome on Today and the card itself
   follow the server's `open` flag instead, so a person who signed up on their phone and opens their Mac the next day
   still gets the welcome and the card. The alternative keys everything on the created time, which would greet a
   two-day-old account as a stranger.
5. **The card shows on every page, under everything.** As the prototype: it stays while you turn days, open the Week
   or the Inbox, so the rows are always a click away; dialogs, panels and Quick Add open over it (z 50 against the
   panels' 70 and dialogs' 75). Phones hide it on pages without the tabs, since it has no New task button to sit
   beside there. The alternative shows it on Today only, where "Pick light or dark" would send you away from it.
6. **Existing tests hide it through the app's hook, not a test route.** The hook calls the same code × does (the
   request to the server and the card's close), so the server side is exercised by every sign in, and no test route
   exists that could leave a person's card hidden by accident. The alternative, a reload after a test request, adds a
   second or so to each of 330 cases.
7. **Joined and Welcome back are toasts, as drawn.** They say who is there or who you are and go; nothing waits on them.
   The alternative puts them on the day as a banner, which the boards do not draw.

Staging: accounts already on staging have never hidden the card, so each sees it once after this deploys; × or the
four rows clear it. Review it as a new person with a fresh address, and as an invitee from an existing space.

## Test plan

Unit (`packages/core`, `packages/ui`, `apps/web`, `apps/server`):

| ID      | Component      | Case                                                                                                                                                                                                                                                                                                                                                           |
| ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C12-U01 | GettingStarted | The four rows with their labels and sublines; "0 of 4" and the ring at 0; a done row crossed off with the tick and no chevron, and it ignores clicks; an undone row calls its way in; the title folds and unfolds (aria-expanded) and the fold is reported; phones start folded; × calls onClose; "You're set" at 4 of 4; closing leaves (220ms) then unmounts |
| C12-U02 | core           | The words: "Welcome to Tudu, Rohit." and "Welcome to Tudu."; "Welcome to Northwind, Rohit."; "Meera and 17 others are here." / "Meera is here."; "You joined Northwind. …"; "Welcome back, Rohit." / "Welcome back."; the first name of a name; the done count and whether all are done                                                                        |
| C12-U03 | web            | The card's state from `/api/me` plus what this browser did: a task written, a theme picked, a name saved, Jira connected each tick at once; a theme pick tells the server once; the fourth tick hides the card after 1.8s and tells the server once; × tells the server, closes and toasts; a hidden card never mounts; the fold is remembered per browser     |
| C12-U04 | web            | Today's welcome: Personal with and without a name; a space joined by invite with its people line; the plain empty state once a task is on the day or the card is gone; the creator's "It's just you for now" is unchanged; Add a task opens the line                                                                                                           |
| C12-U05 | web            | Sign in: a created time after the code was asked for lands quietly; an older one toasts "Welcome back, Rohit."; joining toasts "You joined …"; the phone card hides on pages without tabs                                                                                                                                                                      |
| C12-U06 | server         | `gettingStarted` from the rows: name blank or given; a task you made in any space (not one sent to you); the theme flag; a Jira connection in any space; `open` false once hidden; another person's rows never count                                                                                                                                           |

API (`apps/server`):

| ID      | Case                                                                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C12-A01 | `GET /api/me` for a fresh person: `createdAt`, `gettingStarted.open` true and all four false; name true after `me.rename`; task true after `task.create` (and still false for the person it was sent to); jira true after connecting the fake Jira |
| C12-A02 | `POST /api/me/getting-started`: `{ theme: true }` and `{ hidden: true }` are recorded and idempotent; `open` is false after hidden; anything else is 400; no session is 401; one person's flags never show on another's `/api/me`                  |
| C12-A03 | Migration 0009 applies on a database at 0008 and `first_run` starts null for everyone, so every existing account reads as open                                                                                                                     |

End-to-end, group `first-run` (desktop unless said; the fake Jira under TEST_ROUTES):

| ID      | Case                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C12-E01 | A new person signs in: Today says "Welcome to Tudu." with Add a task; the card rises with "Getting started", "0 of 4" and the four rows; the sidebar, Week and Backlog keep it in the corner; nothing in the console                             |
| C12-E02 | Add your name and photo: the row opens Settings › Account; a saved name ticks it ("1 of 4"); closing Settings, Today now says "Welcome to Tudu, Rohit."; a reload keeps the tick                                                                 |
| C12-E03 | Write your first task: the row opens Quick Add; Add task ticks it; the welcome gives way to the row on the day; writing on the line instead (a second person) ticks it too                                                                       |
| C12-E04 | Pick light or dark: the row opens Appearance and Dark ticks it; a second person picks from the avatar menu's switch and it ticks the same; a reload keeps it; the painted theme is dark                                                          |
| C12-E05 | Bring your Jira issues: the row opens Apps; Connect with the fake Jira ticks it; with the other three done the card says "You're set", "4 of 4", then eases away; a reload shows no card and the plain empty day                                 |
| C12-E06 | Hide: × closes the card and toasts "Hidden. Everything it pointed to is in Settings."; a reload and the same person in a second browser context show no card; the welcome on Today is gone with it                                               |
| C12-E07 | Folding: the title folds to one line and back; a reload keeps the fold; the rows are still reachable after unfolding                                                                                                                             |
| C12-E08 | Returning: sign out and in again: "Welcome back, Rohit." toasts, no welcome title, and the card is where it was (2 of 4); a person whose card is hidden gets the toast and no card                                                               |
| C12-E09 | Joining by invite as a new person (second browser context): lands on the space's Today with "You joined Northwind. Meera is here." and "Welcome to Northwind." over its people line; the card is there; Personal's Today says "Welcome to Tudu." |
| C12-E10 | Joining as a returning person whose card is hidden: the joined toast, no card, the space's Today reads plainly                                                                                                                                   |
| C12-E11 | Done elsewhere: the name saved in a second context of the same person shows ticked in the first after a reload; the fourth tick made elsewhere clears the card here on the next load                                                             |
| C12-E12 | Phone: the card starts folded beside New task; unfolds; the rows go to the phone's Account page, Quick Add, Appearance and More › Apps and the card is out of the way on each; back on Today it is there, ticked                                 |
| C12-E13 | Tablet: the card in the corner over the rail; the rows open the dialog and Quick Add; E02 again                                                                                                                                                  |
| C12-E14 | Dark: E01 and E05 again in dark                                                                                                                                                                                                                  |
| C12-E15 | The kit shows the four Getting started states light and dark, and no kit section overflows at phone width (with C00-E03)                                                                                                                         |

Every other group signs in with the card hidden (see Scope); the smoke group gains nothing. Not automated: the 400ms
beat before the card rises and the sink at the end, which reduced motion flattens; judge them on staging.
