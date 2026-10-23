# Chunk 19 · Send feedback

Status: proposed 23 Oct 2026. Awaiting your approval, and your answer to choice 1 (where reports go). Branch
`rewrite/19-feedback` once approved.

Boards: 13 Next, K-Feedback ("Send feedback") and K-Proto's feedback dialog, which picks, pastes and drops a real
screenshot. One small form for both a bug and an idea, two clicks from anywhere.

## Scope

- **Ways in.** Send feedback in the avatar menu, between Settings and Sign out. On a phone, a row at the foot of
  More, under Settings. On the Mac, the menu bar sheet's ⋯ › Send feedback… (chunk 20), which brings the window
  forward with the form open.
- **The form.** A dialog titled "Send feedback", with the subtitle "It goes straight to the people who make Tudu."
  (a sheet on phones):
  - **Kind.** A segmented control: Something's wrong | An idea. Something's wrong is picked first.
  - **The question.** "What happened?" with the placeholder "What you did, what you expected, what happened
    instead.", or "What would help?" with "What you'd like Tudu to do, and what it would save you.". The draft is
    kept when you switch kind.
  - **One screenshot.** Add a screenshot (file picker), paste into the text, or drop onto the dialog, which outlines
    while you drag. Images only, up to 10 MB. The attach row folds shut as the preview opens: a shimmer while the
    file reads, then the image fades in at the form's width, up to 150px tall and cropped from the top. Under it,
    the name and size ("Screenshot.png · 412 KB"), and × over its corner, which folds it away. Adding another
    replaces it. As built in K-Proto.
  - **Include app details.** A switch, on by default, that remembers your last choice on this device. The helper
    names what goes: "Tudu 0.38.0, macOS 15.1, the Today page. Never your tasks."
  - **Send.** Off until there are words. "Sending…" holds the form, then "Sent", and the dialog goes after 650ms. A
    toast stays for 4 seconds: "Thanks. That's with the Tudu team now."
- **Closing.** Closing with words in it asks nothing and keeps the draft (the screenshot too) until you send or
  clear it, as Quick Add does.
- **Offline.** Send saves the report on this device and the toast reads "Saved. It sends when you're back online."
  It goes by itself on reconnect, screenshot included.
- **App details.** These are the version and track (Tudu, Tudu Staging, web), the OS and browser, the page, the
  space's kind (personal or team, never its name), the window size, and the theme. Never task titles, notes, people
  or space names.
- **Data.** Migration (the next free number) adds `feedback`: id, user id, kind (`bug` or `idea`), text (up to 5000
  characters), details (jsonb or null), screenshot file key (or null), created at, and the client's report id
  (unique, so a retry is one report). One new request: `POST /api/feedback`, multipart (the JSON and the image),
  idempotent by the report id. It is limited to 10 per person per hour. The image goes to object storage under
  `feedback/`, outside any space.

Out of scope: a reply thread in the app (whoever reads a report answers by email), more than one screenshot,
screen recording, an admin page to browse reports (choice 1 makes it unnecessary for now), and feedback while
signed out.

## Choices

1. **Where reports go: a table plus an email to you.** Each report is saved in `feedback` and mailed through Resend
   to one address, `FEEDBACK_TO` (yours, set per environment), with the text, the details and the screenshot
   attached. The reply-to is the sender's email, so answering is just replying. Nothing new to watch, and nothing
   is lost if mail fails (the row is there). **Your call.** The alternatives:
   - GitHub issues on `shimorojune/tudu`. That repo is public, so a screenshot of someone's day would be public. I
     would not.
   - A private issues repo. That needs a GitHub token on the server, and still emails you.
   - Table only, with an admin page. That is more to build and to remember to open.
2. **Its own queue, not the sync outbox.** The outbox carries mutations of tasks and spaces, applied
   last-write-wins. A report is a one-way send with a file, so it gets a small IndexedDB queue of its own (the
   report and the image blob), flushed on reconnect and on the next launch. The alternative pushes a multipart
   upload through the outbox and teaches it files.
3. **The details are opt-out and listed.** On by default, because "which version" is the first question for every
   bug report. The helper says exactly what goes, and the switch remembers. The alternative, off by default,
   loses the version on most reports.
4. **The form is Tudu Paper.** `FeedbackDialog` (the segmented kind, the note field, the screenshot slot with its
   fold and fade, the details row) joins `packages/ui` and the kit. It replaces the kit's placeholder "Feedback"
   overlay. The motion is the K-Proto motion: 280ms fold, a shimmer while reading, a 320ms fade, and none of it
   under reduced motion.

## Test plan

Unit (`packages/core`, `packages/ui`, `apps/web`):

| ID      | Component      | Case                                                                                                                                           |
| ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U01 | FeedbackDialog | The kinds switch the question and placeholder and keep the draft; Send is off with no words; Sending… and Sent                                 |
| C19-U02 | FeedbackDialog | A screenshot by picker, by paste into the text and by drop: the slot opens, the name and "412 KB" show, × removes it, a second one replaces it |
| C19-U03 | FeedbackDialog | Not an image, or over 10 MB: nothing attaches and the hint says why; the drop outline shows only while dragging                                |
| C19-U04 | core           | The details builder: version, track, OS, page, space kind, window size, theme; no titles, notes or names, whatever the page holds              |
| C19-U05 | web            | The queue: a report sent offline is kept with its image, sent once on reconnect, kept across a reload, and dropped after the server's 200      |
| C19-U06 | web            | The draft survives closing and reopening; Send clears it; the details switch remembers its last value per device                               |

API (`apps/server`):

| ID      | Case                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-A01 | `POST /api/feedback` saves the row and the image, and mails `FEEDBACK_TO` (the test outbox) with the text, details, the image attached and the sender as reply-to |
| C19-A02 | The same report id twice is one row and one mail; a body over 5000 characters, a non-image or an image over 10 MB is 400; signed out is 401                       |
| C19-A03 | The eleventh report in an hour is 429; mail failing still saves the row and returns 200                                                                           |
| C19-A04 | The migration applies on the previous one                                                                                                                         |

End-to-end, group `feedback`:

| ID      | Case                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| C19-E01 | Avatar › Send feedback: write, Send, "Sent", the dialog goes, the toast reads; the test outbox has the mail with the details          |
| C19-E02 | Attach by the file picker (Playwright's file chooser): the preview and name show; × removes it; send with one and the mail carries it |
| C19-E03 | Paste an image into the text (a synthetic clipboard event) and drop one (a synthetic drop): each attaches                             |
| C19-E04 | Details off: the mail has no details block; reopening, the switch is still off                                                        |
| C19-E05 | Offline (the context offline): Send saves with the offline toast; back online, one mail arrives                                       |
| C19-E06 | Close with words, reopen: the draft and screenshot are there                                                                          |
| C19-E07 | Phone: More › Send feedback opens the sheet; E01 there (phone)                                                                        |
| C19-E08 | Dark: E01 and E02 again in dark                                                                                                       |
| C19-E09 | The kit shows the dialog empty, with a screenshot, sending, sent and offline, light and dark, with no overflow at phone width         |

Not automated: how the fold and fade feel (reduced motion is on in the suite); judge them on staging.

## Done when

- The tests above pass three runs in a row locally and in CI.
- On staging, a report from the desk, the phone and Tudu Staging reaches your inbox with its screenshot, and
  replying reaches the sender.
- The dialog matches K-Feedback light and dark. The register drops its 13 Next line for Send feedback.

Open item for you: choice 1, and the address for `FEEDBACK_TO` on staging and production (a Dokploy environment
variable, which you set by hand).
