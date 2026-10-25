# Notes and comments: visible lists, one-line file chips, paste and drop, a rich Quick Add note

Status: proposal, waiting for Rohit's approval. Canvas: approved 25 Oct 2026 (board `D-RichText` on the Task detail
page of the canvas). Covers items 1, 2 and 6 of Rohit's list of 24 Oct.

## What Rohit reported

1. Bullets and numbers are invisible in task notes and in comments, in light and dark.
2. Pasting an image does nothing. Attaching with the button breaks the editor: the chip overlaps the lines around it
   and its name runs on without being cut. Attaching from Quick Add does the same in the task's notes.
3. Quick Add's note must be rich text, like the task's notes.

All of it should have been caught by tests. Why it wasn't is under "Why the tests missed it".

## Root causes (reproduced in Chromium with the e2e stack on 24 Oct)

- **Lists.** Tailwind v4's preflight sets `ol, ul, menu { list-style: none }`. `.tp-prose` in
  `packages/ui/src/styles/components.css` only colours `li::marker`; it never turns the list style back on, so a
  computed `list-style-type` of `none` reaches every list in notes and comments. The Tudu Paper bundle has the same
  rules, but the canvas loads no preflight, so the design looked right and nobody saw the gap.
- **Chip overlap.** `.tp-prose .tp-att` is `inline-flex` with a fixed `height: 26px`, and `.tp-prose` sets
  `overflow-wrap: anywhere`. A long name wraps inside the chip and spills over the lines above and below it; the size
  wraps too ("243 / KB"). Chips the server writes (Quick Add and request attachments, `attachmentChip()` in
  `apps/server/src/tasks.ts` and `requests.ts`) use the same markup and break the same way. I could not reproduce the
  name appearing four times; with the chip fixed to one line that overlap can no longer happen, and if a stored name
  really repeats, the full-name tooltip will show it.
- **Paste.** `RichTextEditor` has no paste or drop handling, and StarterKit has no image node, so a pasted file is
  dropped by ProseMirror.
- **Quick Add note.** A plain `<textarea>` capped at three lines; `noteToHtml()` (web) and `noteHtml()` (server,
  requests) turn its lines into paragraphs.

## What changes

### 1. Lists (CSS only)

In `components.css`, under `.tp-prose`:

- `ul { list-style: disc }`, `ul ul { list-style: circle }`, `ul ul ul { list-style: square }`,
  `ol { list-style: decimal }`, `ol ol { list-style: lower-alpha }`. `ul.tp-checks` keeps `list-style: none` (its rule
  is more specific).
- Markers move from `--ghost` to `--muted-foreground` for bullets (numbers already use it). `ghost` is decoration and
  too faint to read as a list.
- `li { padding-left: 2px }` so the text clears the marker.

Same edit in the Tudu Paper design system's `components/bundle.css`, so the canvas and the app share it.

### 2. The file chip

- **Markup.** The `Attachment` node (`packages/ui/src/components/attachment.ts`) renders
  `<a class="tp-att"><span class="tp-att-i"></span><span class="tp-att-n"><span class="tp-att-stem">name</span><span
class="tp-att-ext">.ext</span></span><span class="tp-att-s">243 KB</span></a>` with `title` set to the full name.
  A pure `splitFileName(name)` in `@tudu/core` (next to `fileSize`) gives `{ stem, ext }`: the last dot, kept only when
  the extension is 1 to 8 characters and the stem is not empty (`.env` stays whole).
- **The cleaner** (`packages/core/src/notes.ts`) keeps `tp-att-n`, `tp-att-stem` and `tp-att-ext` on spans, and
  `title` on `a.tp-att`. Old stored chips (name as a bare text node) still parse: `parseHTML` reads `data-name`, so
  they render with the new markup the next time the editor loads them. `RichTextContent` (read-only comments) gets
  the new markup through a small rewrite of chips without `tp-att-n` before rendering (same pure function, unit
  tested), so old comments are fixed too.
- **Server chips** (`attachmentChip()` in `tasks.ts` and `requests.ts`) move into one shared function in
  `@tudu/core` that writes the new markup, so the server and the editor cannot drift again.
- **CSS.** `.tp-att`: `max-width: min(100%, 340px)`, `white-space: nowrap`, `overflow-wrap: normal`,
  `box-sizing: border-box`; the stem `overflow: hidden; text-overflow: ellipsis; min-width: 0`; the icon, extension
  and size `flex: none`. Hover deepens the wash and edge (160ms, ease-change). An image file (by extension: png, jpg,
  jpeg, gif, webp, heic, svg) gets the picture mark instead of the clip (`tp-att-img` class from the node).
- **Links inside prose.** `.tp-prose a.tp-att` keeps the foreground colour and no underline. Today it inherits the
  Jira-blue link style when the chip is not the first rule to match.

### 3. Paste and drop into notes and comments

Only where `onAttach` is given (task notes, comments; the same places the Attach button shows).

- **Paste:** `editorProps.handlePaste`: when `clipboardData.files` has files, the editor attaches them and ignores
  the rest of the clipboard (what Quick Add already does). Text and HTML pastes are untouched.
- **Drop:** `editorProps.handleDrop` does the same at the drop position. While a drag with files is over the editor,
  it shows the "Drop to attach · it goes where the caret is" outline (fade in 160ms, out 110ms).
- **Pasted screenshot names.** A pasted file with no name, or named `image.png`/`image.jpeg` and the like, is renamed
  `Pasted image 24 Oct 14.32.png` (day, month, 24-hour time, original extension). A pure `pastedFileName(file, now)`
  in `@tudu/core`.
- **While it uploads.** A new inline atom, `attachmentUpload` (attrs: a local key, name, size, progress, error), goes
  in at the caret at once. It draws the chip with the Quick Add fill behind it (`--selection`, growing with
  progress) and the percent where the size goes. On success it is replaced by an `attachment` node in one
  transaction; on failure it turns red with Retry and ×, and a toast says "**Couldn't attach the file.** Check your
  connection and retry." Retry re-uploads the same `File` (kept in a map by key, never in the document).
- **Saving.** `attachmentUpload` nodes never reach what is stored: `renderHTML` writes them as
  `<span data-tp-upload>`, and the editor's `onBlur`/`onInput`/`onSubmit` HTML goes through `withoutUploads()`, which
  removes those spans (and the cleaner drops them anyway, as a second guard). A comment's Comment button stays
  disabled while a chip uploads or has failed; Cmd+Enter waits the same way.
- **Refused before upload.** Over 25 MB: no chip, the toast "That file is too big. Files can be up to 25 MB."
  Offline: no chip, "You're offline. Files need a connection." (both already the app's words).
- `RichTextEditor`'s `onAttach` already takes `onProgress`; `TaskPanel` and the comment box already pass it through.

### 4. Quick Add's note is rich text

- `QuickAdd` renders the note with `RichTextEditor` in a new `variant="quick"`: no frame, the placeholder "Add a
  note", `compact`. The formatting row (Bold, Italic | Bulleted, Numbered, Checklist | Link, Code) sits under the
  note and shows only while the note has focus (fades in with `tp-label-in`, folds on blur). On phones it shows Bold,
  Bulleted, Numbered, Checklist and Link at 36px. Up to about eight lines (`max-height: 12em`), then the note
  scrolls. Markdown shortcuts (`- `, `1. `, `[ ] `) work as in the task's notes.
- The editor gets no `onAttach` here: files pasted or dropped on the note bubble up to the bar's existing paste and
  drop handling and join the files row, as today. Enter in the note makes a new line or list item; Cmd/Ctrl+Enter adds
  the task.
- `QuickAddResult.note` becomes HTML (cleaned), empty string when blank. `noteToHtml()` goes; the web passes the HTML
  straight through as `notes`. The draft kept between openings (and the floating page's `localStorage` draft) stores
  HTML; an old plain-text draft goes through `toHtml()` on load.
- The foot still says "note" when the note has words (`isEmptyHtml`).
- **Requests** (Quick Add "for" someone else): `note` is stored as cleaned HTML. `REQUEST_NOTE_MAX` goes from 2,000 to
  8,000 characters to leave room for markup. The server's `noteHtml()` treats a note that has tags as HTML (cleaned)
  and anything else as before, so requests already in the database still work. The Inbox shows `textOf(note)` as
  today's one-paragraph preview; the task the person accepts has the formatted notes.

### 5. Design system and canvas

- Tudu Paper (`EByMwK8AQmbh6TAmWwSzeD`): update `bundle.css` (lists, chip, upload and error chips, drop outline),
  the `Attachment` chip markup in its rich text component, and its Quick Add note. The README's Quick Add line
  ("A note (up to three lines)") becomes "A note (rich text, like the task's notes)".
- Canvas: once the bundle is updated, `D-States`, `D-Desktop` and the other boards with notes pick up the list fix by
  themselves. `Q-States` "With a note and two files" and `Q-Desktop` get the rich note. `D-RichText` stays as the
  record of this change.

## Why the tests missed it

| Bug                  | What the tests did                                                                                                                 | The gap                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invisible lists      | `C03-E04` clicks Bulleted list and checks the stored HTML has a `<ul>`; unit tests do the same in jsdom.                           | Nothing looked at how the list renders. jsdom has no layout and no Tailwind, so a unit test can't see it; the e2e test never asked the browser. The canvas has no preflight, so the design check passed by eye. |
| Chip overlap         | `C04-E06` and `C04-E14` attach `offsite-agenda-v3.pdf` and `quick-add-spec.md` in a 1440px panel and assert `toContainText(name)`. | Short names fit on one line, and `toContainText` passes even when text overflows its box. Nothing checked the chip's height, its width against the notes, or a phone width.                                     |
| Paste does nothing   | `C04-U06` and `C04-E07` cover paste and drop on the Quick Add bar only.                                                            | The editor never had paste, so there was no case for it. The spec (chunk 04) said only "Attach a file" for the editor.                                                                                          |
| Quick Add plain note | `C04-U05` checks "three lines at most".                                                                                            | Not a test gap: the spec itself said plain text. This proposal changes the spec.                                                                                                                                |

The general fix is a third kind of assertion beside "the HTML is right" and "the text is there": **what the person
sees**. The new e2e cases read computed styles and bounding boxes, run at desktop and phone widths, in light and
dark, with real-world names (long, with spaces and dots). A shared helper in `packages/e2e/fixtures/visual.ts`:

- `expectListMarkers(locator)`: every `ul:not(.tp-checks) > li` has a computed `list-style-type` other than `none`
  and a marker colour whose contrast with the background is at least 3:1; every `ol > li` likewise.
- `expectOneLineChip(chip, container)`: the chip's height is 26px (± 1), its text does not overflow
  (`scrollWidth <= clientWidth` on the stem's chip), it lies inside the container's box, and it overlaps no other
  line's box in the same block.

## Test scenarios

Ids continue each chunk's list; they may shift by one or two if another open branch takes the same numbers first.

### Unit (`packages/core`, `packages/ui`)

| Id      | Case                          | Scenario                                                                                                                                                                                                                                              |
| ------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C04-U18 | File names split              | `splitFileName`: `WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg` → stem and `.jpeg`; `archive.tar.gz` → `.gz`; `.env` and `README` stay whole; an extension over 8 characters stays in the stem                                                        |
| C04-U19 | Pasted names                  | `pastedFileName`: `image.png` at 24 Oct 14:32 → `Pasted image 24 Oct 14.32.png`; an empty name with type `image/jpeg` → `.jpeg`; a real name (`spec.pdf`) is kept                                                                                     |
| C04-U20 | The chip's markup             | The `Attachment` node and the shared server chip write the same markup (stem, extension, size, title); an old chip with a bare name parses and re-renders with the new markup; an image extension gets `tp-att-img`                                   |
| C04-U21 | The cleaner and new chips     | The cleaner keeps `tp-att-n`, `tp-att-stem`, `tp-att-ext` and `title` on chips and nothing else new; `<span data-tp-upload>` is dropped with its text                                                                                                 |
| C04-U22 | Paste a file into notes       | A paste with one image file calls `onAttach` once, puts an uploading chip at the caret, reports progress, then a finished chip; the stored HTML has the chip and no upload span; text pastes don't call `onAttach`                                    |
| C04-U23 | Drop a file into notes        | A drop with files shows "Drop to attach", inserts at the drop point and uploads; a drop of text does not                                                                                                                                              |
| C04-U24 | A failed upload in the editor | `onAttach` rejects: the chip turns failed with Retry and ×, a toast says so; Retry uploads the same file again and it lands; × removes the chip; nothing failed is ever in `onBlur`'s HTML                                                            |
| C04-U25 | Too big, offline              | A 30 MB file and an offline editor make no chip and toast the app's words                                                                                                                                                                             |
| C04-U26 | Comment waits for files       | Comment and Cmd+Enter do nothing while a chip uploads or has failed; they post once it lands                                                                                                                                                          |
| C04-U27 | Quick Add rich note           | The note is a rich text box labelled Note; the formatting row shows on focus and hides on blur; `- ` makes a list; Cmd+Enter adds; `onSave` gets cleaned HTML; an old plain-text draft opens as paragraphs; the foot says note only when it has words |
| C04-U28 | Files on the Quick Add note   | Pasting or dropping a file while the note has focus adds it to the files row, not into the note                                                                                                                                                       |
| C04-A09 | Request notes are HTML        | A request with an HTML note is cleaned and stored; the accepted task's notes keep the lists; a request stored with a plain note still becomes paragraphs; over 8,000 characters is 400                                                                |
| C04-A10 | Server chips match the editor | A Quick Add task with files has chips in the shared markup at the end of its notes                                                                                                                                                                    |
| C03-U25 | List styles                   | `.tp-prose` rules in `components.css` set a list style for `ul`, nested `ul`, `ol`, nested `ol`, and none for `ul.tp-checks` (a parse of the stylesheet, so a missing rule fails in CI without a browser)                                             |

### End-to-end (`packages/e2e`)

Every case below runs on desktop and phone unless it says otherwise; the light/dark ones set the theme first.

| Id      | Case                                             | Scenario                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C03-E17 | Lists you can see                                | Write a bulleted list, a nested bullet, a numbered list and a checklist in notes; `expectListMarkers` passes; reload and it still passes; in dark as well                                                                                                        |
| C03-E18 | Lists in comments                                | Post a comment with a bulleted and a numbered list; the posted comment and the comment box both pass `expectListMarkers`; in dark as well                                                                                                                        |
| C04-E16 | A long-named file in notes                       | Attach `WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg` from the Attach button inside a list item and after a line of text; `expectOneLineChip` passes; the visible stem ends with "…" and the extension `.jpeg` shows; hovering shows the full name; on phone too |
| C04-E17 | Paste a screenshot into notes                    | Dispatch a paste with a PNG in the clipboard; the uploading chip shows at once, then `Pasted image … .png` with its size; after a reload it's there and opens as `image/png`                                                                                     |
| C04-E18 | Paste into a comment                             | Paste a file into the comment box; Comment is disabled until it lands; the posted comment shows the chip on one line and it opens                                                                                                                                |
| C04-E19 | Drop a file into notes                           | Drop a file on the notes; the outline shows, the chip lands where it was dropped (desktop, tablet)                                                                                                                                                               |
| C04-E20 | A failed paste                                   | With the upload route answering 500, a pasted file shows the failed chip and the toast; Retry after the route recovers lands it; a reload never shows a broken chip                                                                                              |
| C04-E21 | Quick Add with a rich note and a long-named file | Write a bulleted list in the note (with the formatting row), attach the long-named file, Add; the task's notes have the list (`expectListMarkers`) and the chip passes `expectOneLineChip`, on phone too                                                         |
| C04-E22 | A rich note to someone else                      | In a team space, send a task with a numbered list in the note; their Inbox preview reads the words; when they accept, the task's notes have the list                                                                                                             |

Existing cases that change: `C04-U05` (the note line is now C04-U27; its "three lines at most" goes),
`C04-E06` (uses the long name and `expectOneLineChip` as well as `toContainText`), `C04-E14` (same), and
`C03-E04` (adds `expectListMarkers` after the reload).

## Not in this change

- Inline image previews in notes (a picture instead of a chip). The file route needs a session cookie, and a
  cross-site `<img>` from the API domain needs `SameSite=None` and CORS work; a follow-up if wanted.
- Items 3, 4, 5 and 7 of Rohit's list are in their own threads.

## Order of work

1. `@tudu/core`: `splitFileName`, `pastedFileName`, the shared chip, cleaner changes, request note handling. Unit
   tests first.
2. CSS (lists, chip, upload and failed chips, drop outline), `less-motion.css` entries.
3. `RichTextEditor`: new chip markup, `attachmentUpload`, paste, drop, saving without uploads, comment waiting.
4. Quick Add: the rich note, draft migration, request path.
5. Server: shared chips, request notes, `REQUEST_NOTE_MAX`.
6. E2E fixtures and cases; run the `detail` and `quick-add` groups three times.
7. Design system bundle and README, then the canvas boards above.
