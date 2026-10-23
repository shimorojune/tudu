# Chunk 19 · Send feedback · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project core --project ui --project web --project server` and `pnpm e2e feedback`. The end-to-end API
mails reports to `reports@tudu.test`, read from the test outbox.

## Unit (`packages/core`, `packages/ui`, `apps/web`)

| ID      | Component      | Case                                                                                                                                           |
| ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U01 | FeedbackDialog | The kinds switch the question and placeholder and keep the draft; Send is off with no words; Sending… and Sent                                 |
| C19-U02 | FeedbackDialog | A screenshot by picker, by paste into the text and by drop: the slot opens, the name and "412 KB" show, × removes it, a second one replaces it |
| C19-U03 | FeedbackDialog | Not an image, or over 10 MB: nothing attaches and the hint says why; the drop outline shows only while dragging                                |
| C19-U04 | core           | The details builder: version, track, OS, page, space kind, window size, theme; no titles, notes or names, whatever the page holds              |
| C19-U05 | web            | The queue: a report sent offline is kept with its image, sent once on reconnect, kept across a reload, and dropped after the server's 200      |
| C19-U06 | web            | The draft survives closing and reopening; Send clears it; the details switch remembers its last value per device                               |

## API (`apps/server/src/feedback.test.ts`)

| ID      | Case                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-A01 | `POST /api/feedback` saves the row and the image, and mails `FEEDBACK_TO` (the test outbox) with the text, details, the image attached and the sender as reply-to |
| C19-A02 | The same report id twice is one row and one mail; a body over 5000 characters, a non-image or an image over 10 MB is 400; signed out is 401                       |
| C19-A03 | The eleventh report in an hour is 429; mail failing still saves the row and returns 200                                                                           |
| C19-A04 | The migration applies on the previous one                                                                                                                         |

## End-to-end (`packages/e2e/tests/feedback`)

| ID      | Case                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C19-E01 | Avatar › Send feedback: write, Send, "Sent", the dialog goes, the toast reads; the test outbox has the mail with the details              |
| C19-E02 | Attach by the file picker (Playwright's file chooser): the preview and name show; × removes it; send with one and the mail carries it     |
| C19-E03 | Paste an image into the text (a synthetic clipboard event) and drop one (a synthetic drop): each attaches                                 |
| C19-E04 | Details off: the mail has no details block; reopening, the switch is still off                                                            |
| C19-E05 | Offline (the context offline): Send saves with the offline toast; back online, one mail arrives                                           |
| C19-E06 | Close with words, reopen: the draft and screenshot are there                                                                              |
| C19-E07 | Phone: More › Send feedback opens the sheet; E01 there (phone)                                                                            |
| C19-E08 | Dark: E01 and E02 again in dark                                                                                                           |
| C19-E09 | The kit shows the dialog empty, with a screenshot, sending and sent (offline is a toast), light and dark, with no overflow at phone width |

Not automated: how the fold and fade feel (reduced motion is on in the suite); judge them on staging.
