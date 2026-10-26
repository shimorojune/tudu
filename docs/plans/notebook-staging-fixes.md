# Notebook fixes from staging: the toolbar, bullets and Make a task

Status: proposal, 26 Oct 2026. Canvas approved by Rohit 26 Oct (canvas v120, Notebook page, boards `P-MakeTask` and
`P-MakeTask-Dark`, sticky `p16-fix-draft`). Rohit approved keeping the note pill and skipping a canvas for the bullet
bug.

These are items 1 and 2 of Rohit's staging test of the Notebook (PR #32). Item 2 changes a decision in
[notebook.md](notebook.md): Make a task used to make the task straight away (Personal, on Today). Now it opens New task
on the words you selected, and nothing is made until you press Add task.

## 1. The formatting bar sits at the foot of the note

**Cause.** In `.tp-nb-body` (`packages/ui/src/styles/components.css`) the editor is a flex column: the text area
(`order: 1`) and then the bar (`order: 2`, `position: sticky; bottom: 12px`). The text area never grows, so the bar
comes right after the last line. In a short note that is halfway down the pane. The canvas kit had the same CSS.

**Fix (CSS only).**

```css
.tp-nb-body { display: flex; flex-direction: column; }
.tp-nb-body > .tp-rte-notes { flex: 1 0 auto; }
.tp-nb-body .tp-rte-notes .tp-rte-area { flex: 1 0 auto; }
```

The editor fills the scrolling body, and the text area fills the editor. That pushes the bar to the bottom of the pane,
centred. In a long note it stays stuck 12px from the bottom while the words scroll under it, as before. A click
anywhere in the empty space under the words now writes, because the text area covers it. These rules also cover the
compact editor (the note window, the browser popup and phones). Task notes (`TaskDetail`) don't use `.tp-nb-body`, so
they stay as they are.

## 2. A bullet clears the placeholder (bug, no design change)

**Cause.** `RichTextEditor` sets `tp-rte-blank` (the class that draws the placeholder) from Tiptap's `editor.isEmpty`.
In Tiptap 3 that returns true for a doc holding one empty list item, task item, heading or quote, because it checks
whether the children are empty, not the kind of node. So starting a list (toolbar, `- `, ⌘⇧8) keeps the placeholder
drawn through the bullet. This affects every variant: notes, comments and Quick Add's note.

**Fix.** A new helper, `blankDoc(doc)`: blank only when the doc has exactly one child, that child is a `paragraph`, and
the paragraph has no content. It replaces `e.isEmpty` in `onUpdate` and the initial `useState`. What a save or a
submit treats as empty (`isEmptyHtml` on the stored HTML) does not change: a note holding only an empty bullet still
saves as empty, and Post stays off for such a comment. Only the placeholder follows the new rule.

## 3. Make a task opens New task, filled in

**Today.** `onMakeTask` in `apps/web/src/app/noteEditing.tsx` calls `taskStore.create(personal, today, words)`, links
it, and shows a toast.

**New behaviour (as on the canvas).**

- The words become the task. The first selected line is the title, cut to `TITLE_MAX` (500); if a line is longer, the
  cut falls on a word boundary past 250 characters and the rest of that line goes to the note. Every other selected
  line becomes a paragraph of the note (escaped). Runs of whitespace inside a line fold to one space. This lives in
  `@tudu/core` as `taskFromWords(raw)` so the page, the floating window and tests share it.
- New task opens set to **Personal, on Today, for me**, the same as Quick Add opened from a Personal page. The
  space, person, day and project chips all work before you add.
- The top line shows a **note pill**: the note's icon, its name (title, else its first line, else "This note"), and
  ×. × shrinks the pill away (140ms) and the task won't link. The pill only shows when New task was opened from a
  note.
- **Add task:** the task is made as Quick Add makes it. If the pill is still there, `notebookStore.link(noteId, task)`
  runs right after (as today). The toast reads "‘{title}’ is on Today in Personal, linked to this note." with Open.
  Without the pill it is Quick Add's usual toast.
- **Sent to someone:** the usual request flow and "Sent to …" toast. The note links to the request if you can still
  read it (it shows in your Sent). If the server says it can't be read (404 `TASK_GONE`), the link is dropped quietly
  and the toast doesn't claim it. Section 3 of the tests pins this down.
- **Esc, ×, or a click outside:** nothing is made, and the note and its selection are untouched.
- **Didn't save (offline, 5xx):** Quick Add's existing behaviour applies (the draft stays). The link is only made
  after the task is.

### Where New task opens

| Note shown in | New task |
| --- | --- |
| Notebook page, browser's floating note panel | the Quick Add bar over the app (`openQuickAdd(seed)`) |
| Phone Notebook | the Quick Add sheet |
| Browser popup (`/note-window/:id`, not the Mac) | a `QuickAddHost` mounted in `NoteWindowPage`, the bar inside the popup |
| Mac note window | the floating Quick Add window (the ⌘⇧N one), filled in |

### Changes

- `packages/core`: `taskFromWords(raw: string): { title: string; note: string }`, plus a `QuickAddFrom` type
  `{ noteId: string; name: string }`.
- `apps/web/src/app/dayView.ts`: the `openQuickAdd` seed gains `note?: string` and `from?: QuickAddFrom`. The seed
  stays the single source, so a second Make a task while it is open replaces the words and the pill (new nonce).
- `packages/ui` `QuickAdd`: `seed.note` fills the note (it opens, its editor's `resetKey` bumps) and `seed.from` shows
  the pill (`.tp-qa-from`, the same markup and CSS as the canvas bundle). `QuickAddDraft` gains `from`. `onSave` gets
  it, and the reset after Add clears it.
- `QuickAddHost` (`apps/web/src/app/quickAdd.tsx`): after `a.save(t)` / `sendRequest`, if `t.from` is set, call
  `notebookStore.link(t.from.noteId, …)` with the new task, then show the linked toast.
- `noteEditing.tsx` `onMakeTask`: builds the seed from `taskFromWords` and calls an `o.makeTask(seed)` that each host
  passes in: `openQuickAdd` on the page, the in-app floating panel and the popup, and `desktop().summonWith(seed)` in
  the Mac note window.
- Mac (`apps/desktop/src-tauri`): a new command `summon_with(seed)` keeps the seed in `App` state and summons the
  floating window as `summon` does (it never brings the main window forward). The floating page reads it through a
  new `quick_add_seed` command on `floating:shown` and hands it to `openQuickAdd`. The seed is taken once and cleared,
  so a later ⌘⇧N opens a plain Quick Add. `desktop.ts` gains `summonWith`. The floating window's own draft (kept in
  localStorage) gives way to a seed: the seed's words win, as the in-app seed does today.
- The note window linking from the floating window works through the sync queue as now. The `NOTEBOOK_CHANGED` live
  event refreshes the note window, so the chip appears there.
- `components.css`: the bar rules from section 1, plus `.tp-qa-from`.
- Design system (Tudu Paper): port the `QuickAdd` `from` pill and seed `note`, the Notebook kit's bar rule, and
  `PadEditor` opening New task (as on canvas v120).

## Tests

Unit (Vitest, `packages/core` and `packages/ui`):

- **C22-U23** `taskFromWords`: one line gives a title and an empty note; three lines give the first line as the title
  and the other two as note paragraphs; whitespace and blank lines fold away; a 600-character line is cut at a word
  past 250 and ≤ 500, the rest leading the note; `<`, `&` in the words are escaped in the note.
- **C03-U29** placeholder: `RichTextEditor` with `<ul><li></li></ul>`, `<ul data-type="taskList">…empty…`,
  `<h2></h2>` and `<blockquote><p></p></blockquote>` has no `tp-rte-blank`; `<p></p>` and `''` do. Typing `- ` in a
  blank editor drops the class. `onInput`'s `isEmpty` is still true for the empty list.
- **C04-U30** `QuickAdd` seed: `seed.note` opens the note with those words; `seed.from` shows the pill with the note's
  name; × removes it after the shrink and `onSave` gets `from: null`; with the pill, `onSave` gets `from`; after Add
  the next open has no pill.
- **C22-U24** `NoteEditor` Make a task calls `onMakeTask` with the raw selection (line breaks kept) and creates
  nothing itself.
- **C22-U25** `noteEditing` `onMakeTask` calls the host's `makeTask` with `taskFromWords` output and
  `from: { noteId, name }`, and no longer calls `taskStore.create`.
- **C22-U26** `QuickAddHost`: saving with `from` links the new task to that note and shows the linked toast; without
  `from` it doesn't link; a failed save makes no link.
- **C22-U27** desktop seed: `summonWith(seed)` invokes `summon_with`; the floating page on `floating:shown` asks
  `quick_add_seed` once and opens Quick Add with it, and a second `floating:shown` with no seed opens a plain Quick
  Add.
- Rust: **C22-D07** `summon_with` stores the seed and `quick_add_seed` returns it once, then `None`.

API (server, real Postgres):

- **C22-A17** `note.link` to a request you sent (a task in the other person's Inbox): it links if `readableBy` lets
  you see it, else 404 `TASK_GONE`. This pins down the "sent to someone" behaviour; if it 404s, the UI drops the link
  quietly as above.

E2E (Playwright, on the Mac):

- **C22-E11 (updated)** select words in a note, Make a task: New task opens with the words as the title and the note
  pill. No task exists yet (Today unchanged). Add task: the toast says it's linked, the chip pops into the note, and
  Open shows it on Today in Personal.
- **C22-E21** two selected lines: the first is the title and the second is in New task's note; after Add the task
  panel shows that note.
- **C22-E22** × on the pill, then Add: the task is made and the note has no new chip. Esc instead: no task, nothing
  changes.
- **C22-E23** change the space chip to a team space before Add: the task lands there and is still linked to the note.
- **C22-E24** toolbar: a one-line note, focus the words: the bar's bottom is within 24px of the note pane's bottom
  and horizontally centred (±2px); a 60-line note scrolled to the middle keeps the bar in the same place.
- **C22-E25** placeholder: in a blank note, click the bullet list button: the placeholder is gone (no
  `tp-rte-blank`, the `::before` content is `none`) while the bullet marker shows; the same after typing `- `. Also in
  a task's notes and a comment box.
- **C22-D08** (Mac app e2e, desktop harness) in the note window, Make a task: the floating Quick Add shows, filled in
  with the pill, and the main window stays hidden; Add task: the chip appears in the note window.

Updated: C22-E11 (no longer expects the task made on click). Unchanged and still expected to pass: the rest of
C22-E*, C03-E*, C04-E* (Quick Add).

## Out of scope

Items 3 to 8 of the same staging list (floating notes on the Mac, alignment, the All spaces freeze, the popup's ↗,
Jira per space, feedback issues) are handled elsewhere.
