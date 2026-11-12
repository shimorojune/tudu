# Scramble my text, a public-issue switch, and the explanation over the form

Issues: #67 (share screenshots with scrambled text, then drop the public/private screenshot switch), #50 (the
screenshot warning reads like a warning about the whole report; make "file a public issue" a general switch, on by
default, otherwise email only) and #39 ("Public on GitHub" shows no explanation).

Status: awaiting Rohit's approval. Canvas approved 12 Nov 2026 ("approved"): boards `K-FeedbackPrivacy` and
`K-FeedbackPrivacy-Dark` on the Send feedback page (canvas v220), light and dark, with sticky `fb-priv-q`. Rohit's calls
on 12 Nov: a scramble **mode for the whole app** instead of Tudu taking the picture; the switch lives in the **avatar
menu next to Theme**; it covers everything **except the Send feedback form**.

Checked against master `ac11d83`. PR #86 covered none of the three:

- **#39** is a layering bug. The popover portals to `<body>` with `z-index: 60` (`.tp-root.tp-fb-pop`, `app.css`)
  while the dialog layer is `z-index: 75` (`.tp-dlg-layer`, `components.css`), so it opens underneath the form. The
  tests pass because `toBeVisible()` ignores what covers an element. The "image upload doesn't work" half of #39 was
  fixed by PR #45.
- **#50**: filing is decided by the server alone (GitHub when `FEEDBACK_GITHUB_TOKEN` is set, else email). There is no
  per-report choice.
- **#67**: not built.

## Part 1 · #67 Scramble my text

### What changes for the person

- **Where.** A new row in the avatar menu (`AccountMenu`), right under Theme: "Scramble my text", line "Hides your words
  for screenshots", and a `Switch`. The menu stays open when it's flipped, like Theme. Phones have no
  avatar menu (their avatar opens Settings), so the same switch also sits in Settings › Appearance, under Theme, on
  every size. _(Built: the phone placement changed from the plan, which assumed one menu on every size.)_
- **What it does.** Every word that is yours is drawn as jumbled letters of the same shape, everywhere in Tudu:
  every page, the task panel, Search, Inbox, People, Notebook, the note window, the menu bar sheet, Jira, Settings
  (space, project and member names). Capitals stay capitals, digits stay digits, spaces and punctuation stay put, so a
  bug about a long title, a wrong count or a clipped menu still shows. Tudu's own words (page names, buttons, menus,
  day names, dates, counts) stay readable.
- **Pictures** that are yours become plain blocks in `--skeleton`: avatars with a photo (initials scramble instead),
  attachments, note images and drawings.
- **Not scrambled: the Send feedback form.** What you type there is the report, and the "Already reported?" matches
  are already public issue titles.
- **Nothing saved changes.** It's only how words are drawn on this device. Sync, search, the MCP server, mail and
  notifications are untouched.
- **Typing while it's on.** The field you're typing in (a title, a description, a note, a comment, Quick Add) shows real
  words while it has focus, and scrambles again when you leave it. So editing stays possible and nothing jumbled can
  ever be saved.
- **The reminder.** While it's on, a **Scrambled** pill (shuffle icon, `--warning-soft` with `--warning` ink) sits in the
  top bar of every Tudu window, the note window and the menu bar sheet included. Clicking the pill turns it off.
- **It stays on** until switched off, through a reload or a restart. It's per device (`localStorage`), not synced.
- **After a report.** If the mode is on when a report is sent, the thanks toast gets a **Turn off** action:
  "Filed as #97 on GitHub. Scramble is on." / "Thanks. That’s with the Tudu team now. Scramble is on."
- **In the form.** No switch of its own. While the mode is on, the hint next to Add a screenshot reads "Your text is
  scrambled" (shuffle icon) instead of "or paste or drop one". The "Public on GitHub" popover's last line ends with
  "**Scramble my text**, in your menu, hides your words before you take one."

### Motion

- On or off: each scrambled run crossfades through a soft blur, 240ms `--ease-change`. Nothing moves or resizes,
  because a jumbled word has the same letters' count and kinds.
- Pill: pops in 220ms `--ease-arrive` (fade + 3px rise + scale .92 to 1), fades out 180ms.
- Menu row: the `Switch`'s own motion. The form hint crossfades 160ms.
- Reduced motion: the crossfade and the pill become instant.

### States

The mode has no loading or error state: it's instant, local and needs no network. If `localStorage` throws (private
window), it still works for the visit and isn't remembered.

### How it scrambles (`packages/core/src/scramble.ts`, new)

- `scrambleText(text, key)`: letter for letter. Each letter becomes a letter of the same case, each digit a digit;
  everything else (spaces, punctuation, emoji, `@`, `#`) is kept. The pick for each character comes from a hash of the
  **key**, the **whole word** and the character's place, so the same word always jumbles the same way during a visit
  (no flicker on re-render) and different words differ.
- The **key** is 16 random bytes made when the mode is switched on and kept with it in `localStorage`. The code is
  public, so a fixed mapping could be reversed; a key that never leaves the device can't. What still shows: word
  lengths and which words repeat. That is the trade-off of keeping the layout honest.
- Non-Latin letters: Cyrillic, Greek and other alphabets jumble within their own script block; CJK characters are
  replaced by other CJK characters; anything else unknown becomes `•`.

### How it's wired (`packages/ui`)

1. **`lib/scramble.ts`**, modelled on `lib/theme.ts`: `readScramble()`, `setScramble(on)`, `useScramble()` (a
   `useSyncExternalStore` over the module state), a `storage` listener so every window (main, note window, menu bar
   sheet, Quick Add) follows within one event, and `<html data-scrambled>` set while it's on (CSS hook for pictures).
2. **`useMine()`**: returns `(text) => text` when off, `scrambleText(text, key)` when on. Every plain-string render of
   user text goes through it. The places (from a sweep of master): `TaskLine`, `TaskList`/`TaskRow`, `SubtaskList`,
   `TaskDetail` (title, facts, people), `QuickAdd` (chips), `InboxItem`, `PersonDot`/`PersonRow`/`PersonHeader`/
   `PersonPick`, `SpaceSwitch`/`SpaceFilter`/`SpaceTile`, `ProjectFilter`/`ProjectSettings`, `NoteParts`/`NoteTree`/
   `NoteHit`/`NoteLinks`/`NoteWindow`, `JiraPanel` and the Jira facts, `SearchHit`, `MenuBarSheet`, `AccountMenu`
   (name and email), `MemberRow`/`MemberList`, and in `apps/web`: `TodayPage`, `WeekPage`, `PeoplePage`, `TaskPanel`,
   `spaces.tsx`, `settings.tsx`, `JiraHost`. `FeedbackDialog`, `SimilarReports` and `FeedbackReports` deliberately
   don't.
3. **Fields** (`useMineField(value)`): returns the scrambled text for display while the field isn't focused and the
   real value from focus on, so `onChange` only ever sees real text. Used by every `<input>`/`<textarea>` that shows
   saved user text (task title, project/space names in Settings, the folder rename field).
4. **Rich text** (descriptions, notes, comments; TipTap): while scrambled and not focused, `RichTextEditor` draws a
   read-only copy of the document with every text node passed through `scrambleText` (a pure transform of the
   ProseMirror JSON, so marks, lists, links and checkboxes keep their shape) in place of the live editor; a click or
   focus swaps the live editor back in at the same place. Read-only `RichTextContent` uses the same transform.
5. **Pictures**: `html[data-scrambled]` rules in `components.css` hide `Avatar`/`PersonDot` photos (initials show,
   scrambled), attachment previews, note images and drawings behind a `--skeleton` block of the same size.
6. **Pill**: a `ScrambledPill` in `TopBar`, the note window's head and `MenuBarSheet`'s head.
7. **`document.title`** isn't touched (no page puts user text in it today; checked).

### Not covered (says so in the popover line, and in the proposal for the record)

- **System surfaces**: Mac notifications (working-hours nudges), the menu bar's number, the Dock. macOS draws them.
- **Pictures you add yourself** to a report are sent as they are; Tudu can't read a picture, so it can't tell whether
  it was taken scrambled.

## Part 2 · #50 File it as a public issue

### What changes for the person

- A new last row in the form, under Include app details: **"File it as a public issue"**, a `SettingRow` with a
  `Switch`. Line on: "On GitHub, where you can follow it and others can +1." Line off: "Off. It goes to the Tudu team by
  email, nothing is public."
- **On every time the form opens**; switching it off holds for this report only (not remembered, kept with the draft
  while the form is closed, like the other draft fields).
- **Off:** the head line crossfades (160ms) to "It goes straight to the people who make Tudu, by email."; "Already
  reported?" folds shut (280ms) and a picked +1 is let go; the footer's "Public on GitHub" swaps (200ms rise) for a lock
  and **"Only the Tudu team"** (not a button). Send sends by email only; the thanks is the existing toast, and Your
  reports lists it as **Sent by email**, a row that exists today.
- The row only shows when the server files on GitHub (`filing: 'github'`); email-only servers keep today's form.
- **The screenshot goes wherever the report goes.** The per-screenshot "Show it on the public issue" switch, its sub
  line, the Public pill on the preview and the accent ring are removed. With the report public, one line sits under
  the picture in `--warning` ink: "It goes on the issue as it is. Check it shows nothing private." HEIC and other kinds
  GitHub can't show keep a single muted line with a lock: "GitHub can’t show this kind of image. It stays with the
  team." (the disabled switch goes).
- Popover lists: under Public on GitHub, "The screenshot" with a quiet second line "Exactly as you added it"; under Only
  the Tudu team, only "Your name and email (so we can reply)"; last line as in Part 1.

### How

1. `packages/core` `feedbackReportSchema`: new `public: z.boolean().default(true)`. Default true, because a report
   queued offline by an older client was sent from a form that said it would be public. `shotPublic` stays in the
   schema; the client now sends `shotPublic = public && shotCanBePublic(type)`.
2. `apps/server/src/routes/feedback.ts`: `issueState` is `'pending'` only when `tracker && report.public`; otherwise
   `'none'`, no `fileReport`, and the screenshot is stored private. A `plusOneOf` with `public: false` is a 400. The
   mail is unchanged except its first line says "Email only (not filed on GitHub)" when `public` is false.
3. `apps/web/src/app/feedback.tsx`: `FeedbackDraft` gets `public: boolean` (true in `EMPTY` and on every open);
   switching off clears `plusOne` and stops the similar lookup; `shotPublic` is derived, not stored.
4. `FeedbackDialog`: the new row and its copy, the removed screenshot row, pill and ring, the as-it-is line, the
   footer swap, the head-line crossfade (both lines in one grid cell, as `.tp-fb-sub` does today).

## Part 3 · #39 The explanation opens over the form

`.tp-root.tp-fb-pop` goes from `z-index: 60` to `80`, above the dialog layer (75) and below toasts (100). No design
change. Other layers that portal to `body` below 75 (`DatePop` at 70, the Notebook's pops) get the same check while
building: any one that can open inside a dialog moves above it too.

## Design parity (before the PR is ready)

- **DS** (Tudu Paper): `AccountMenu` gets the Scramble row (`scramble`/`onScramble` props), `TopBar` the Scrambled pill,
  new `shuffle` icon (and `lock` if missing), `FeedbackReports` unchanged. The DS has no Send feedback form component;
  its Decisions entry is updated with Parts 1–3.
- **Canvas**: the draft boards become the shipped ones (sticky marked built). Every account menu and top bar on the
  canvas shows the new row (off) via the canvas copy of the DS bundle; the main `K-Feedback` sheets lose the screenshot
  switch rows and gain the public row. The daily consolidation folds the draft boards after merge.

## Test scenarios

Feedback tests continue chunk 19 (last used: C19-U33, C19-A31, C19-E22). The scramble mode is a new chunk, **C23**
(no chunk above 22 exists on master or any open branch today; renumber at merge if another thread takes it first).
"(update)" marks a change to an existing test.

### Unit · core and ui (Vitest)

| ID               | Scenario                                                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C23-U01 (new)    | `scrambleText`: same length; upper stays upper, lower stays lower, digits stay digits; spaces, punctuation, `@`, `#` and emoji kept; no letter keeps its place in a word of 4+ letters more than chance allows (fixed seed) |
| C23-U02 (new)    | Same key and word give the same output; another key gives another; the output never equals the input for words of 3+ letters                                                                                                |
| C23-U03 (new)    | Cyrillic and Greek stay in their script; CJK stays CJK; unknown characters become `•`                                                                                                                                       |
| C23-U04 (new)    | `scrambleHtml` (built in place of `scrambleDoc`, since the read-only copies draw stored HTML): text nodes, `title` and `alt` change; tags, marks, links' `href` and list structure don't                                    |
| C23-U05 (new)    | `lib/scramble`: off by default; `setScramble(true)` writes the key and the flag, sets `html[data-scrambled]`; a `storage` event from another window turns it on here; `localStorage` throwing still works for the visit     |
| C23-U06 (new)    | `useMine`: identity when off; scrambled when on; re-renders every user of it when switched                                                                                                                                  |
| C23-U07 (new)    | `useMineField`: scrambled while blurred; real on focus; `onChange` after focus gets real text; blur scrambles again                                                                                                         |
| C23-U08 (new)    | `AccountMenu`: the row sits under Theme with its line; flipping it calls `onScramble` and keeps the menu open; menu roles and labels as today                                                                               |
| C23-U09 (new)    | `TopBar`: no pill when off; "Scrambled" pill when on; clicking it turns the mode off                                                                                                                                        |
| C23-U10 (new)    | `TaskLine`, `PersonDot` (initials, photo hidden), `SpaceSwitch`, `NoteTree`, `JiraPanel` and `MenuBarSheet` render scrambled text when on and real text when off (one table-driven test)                                    |
| C23-U11 (new)    | `RichTextEditor`: scrambled read-only copy while on and blurred; focus swaps in the live editor with real text; typing then blurring saves real text only                                                                   |
| C23-U12 (new)    | `FeedbackDialog`, `SimilarReports` and `FeedbackReports` render real text with the mode on                                                                                                                                  |
| C19-U34 (new)    | `feedbackReportSchema`: `public` defaults to true; a non-boolean is refused                                                                                                                                                 |
| C19-U35 (new)    | `FeedbackDialog` (GitHub filing): the public row is last and on; off swaps the head line and the footer to "Only the Tudu team", hides Already reported, and Send reads "Send"                                              |
| C19-U36 (new)    | `FeedbackDialog`: with a screenshot and public on, the as-it-is line shows; with public off it doesn't; HEIC shows the lock line; there is no screenshot switch, pill or ring any more                                      |
| C19-U37 (new)    | `FeedbackDialog`: the hint reads "Your text is scrambled" while the mode is on                                                                                                                                              |
| C19-U38 (new)    | `apps/web` feedback: switching public off clears a picked +1 and stops similar lookups; the draft keeps `public` through a close; a new open starts on; the report JSON carries `public` and a derived `shotPublic`         |
| C19-U39 (new)    | `apps/web` feedback: a send with the mode on shows the thanks toast with "Scramble is on." and a Turn off action that turns it off                                                                                          |
| C19-U10 (update) | Public on GitHub opens what's shared **above the form** (the popover's layer is over the dialog's), and the lists and last line read as Part 2                                                                              |
| C19-U19 (update) | Screenshot in: no switch row; the as-it-is line                                                                                                                                                                             |
| C19-U21 (update) | The popover lines and the hint as Parts 1–2                                                                                                                                                                                 |
| C19-U22 (update) | `shotPublic` is derived from `public` and the type, not stored per screenshot                                                                                                                                               |

### API · server (Vitest against the local test database)

| ID            | Scenario                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-A32 (new) | `public: false` with a tracker set: no issue (the fake has none), the row is `issue_state: 'none'`, the mail goes, `/mine` shows it as sent by email |
| C19-A33 (new) | `public: false`: the sweep never files it later; its screenshot link (`/shots/:ref/:sig`) answers 404                                                |
| C19-A34 (new) | `public: false` with `plusOneOf`: 400, nothing saved, no mail                                                                                        |
| C19-A35 (new) | A report without `public` (an older queued client) files as public, as before                                                                        |
| C19-A36 (new) | The mail for an email-only report says "Email only: they chose not to file it as a public GitHub issue." right under the From line                   |

### End to end (Playwright; web on PR CI, Mac app job on PR CI, never on Rohit's Mac)

| ID               | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C23-E01 (new)    | **Coverage sweep.** Seed one sentinel word ("Zorbleck") into every kind of user text: a task title, description, comment, subtask, note title and body, folder, space, project, person name and email, a Jira ticket title. Turn the mode on from the avatar menu, visit Today, Week, Backlog, Inbox, People, Search (results), All spaces, a task panel, the Notebook, Settings (space, project, members) and the Jira pane: the page text never contains the sentinel, and does again once it's off |
| C23-E02 (new)    | The mode survives a reload; the pill shows in the top bar; clicking the pill turns it off and the words come back                                                                                                                                                                                                                                                                                                                                                                                     |
| C23-E03 (new)    | Edit a task title and a note while it's on: the focused field shows real text; after blur the saved values (read back through the API) are the real words                                                                                                                                                                                                                                                                                                                                             |
| C23-E04 (new)    | Send feedback with it on: the form shows the real words typed; the thanks toast offers Turn off, which works                                                                                                                                                                                                                                                                                                                                                                                          |
| C23-E05 (new)    | Phone size: the switch is in Settings › Appearance (the phone avatar opens Settings); the pill fits the phone header without overflow, and turns it off                                                                                                                                                                                                                                                                                                                                               |
| C23-E06 (new)    | Mac app: turning it on in the main window scrambles the note window and the menu bar sheet too, each with its pill                                                                                                                                                                                                                                                                                                                                                                                    |
| C19-E23 (new)    | Switch public off, send: no issue on the fake, the mail went, Your reports shows "Sent by email", Already reported was hidden                                                                                                                                                                                                                                                                                                                                                                         |
| C19-E24 (new)    | Public on with a PNG: the as-it-is line shows before Send; the issue embeds the image                                                                                                                                                                                                                                                                                                                                                                                                                 |
| C19-E12 (update) | Public on GitHub: the popover is **the topmost element** at its centre (`elementFromPoint`), not just visible; its lists as Part 2                                                                                                                                                                                                                                                                                                                                                                    |
| C19-E16 (update) | Attach a PNG with public **off**: no issue; the mail has the attachment                                                                                                                                                                                                                                                                                                                                                                                                                               |
| C19-E17 (remove) | The per-screenshot switch is gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| C19-E09 (update) | The kit's feedback phases with the public row and without the screenshot switch, light and dark; nothing overflows at phone width                                                                                                                                                                                                                                                                                                                                                                     |
| C23-E07 (new)    | Kit: the account menu with the row off and on, the top bar with the pill, light and dark                                                                                                                                                                                                                                                                                                                                                                                                              |

## Open points

- **Cost.** About 30 components take `useMine`; C23-E01 is the guard against a missed one, so a new surface that skips
  it fails CI as soon as its page is added to that sweep.
- **Rich text swap.** Swapping the read-only copy for the live editor on focus must not jump the caret or the scroll.
  If TipTap makes that unreliable, the fallback is to keep the editor live and scramble only when it's not focused via
  a CSS-hidden live editor under the copy. Decided while building; no visible difference either way.
- **Migration:** none. No new column (email-only is `issue_state: 'none'`, which exists).
