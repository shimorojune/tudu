# Show the feedback screenshot on its GitHub issue, if you choose

Status: proposal, awaiting Rohit's approval. Canvas approved 27 Oct 2026 (boards `K-FeedbackShot` and
`K-FeedbackShot-Dark` on the Send feedback page, light and dark). Approach picked by Rohit on 27 Oct: Tudu serves the
image at an unguessable link, and each report decides with a switch whether its screenshot goes public. The switch is
off by default.

## What Rohit asked for

"When we submit a bug or feature through the app, the github issue does not contain the attached image. The mail has
it." (26 Oct, item 1 of the staging list.)

PR #23 kept screenshots off GitHub on purpose, because the repository is public and a screenshot can show someone's
private tasks. GitHub also has no API for attaching an image to an issue: the drag-and-drop upload only works in the
browser. So the image has to live at a URL somewhere, and the issue embeds it.

## What changes for the person

Everything below is only when GitHub filing is on (`filing: 'github'`). With email only, the form stays as it is.

- **A switch under the screenshot.** Once a screenshot is in (button, paste or drop), the preview's fold also shows a
  setting row, "Show it on the public issue", with a Switch. It is the same SettingRow + Switch as Include app details.
  - It starts **off every time** a screenshot goes in, and the setting isn't remembered, so a private shot never goes
    public out of habit.
  - The sub line crossfades between "Private. Only the Tudu team sees it, with your report." and "Public. Anyone can
    see it on the GitHub issue." (160ms fade, 3px rise).
  - Removing the screenshot (×) folds the row away with it. A new screenshot comes in off again.
- **On, the preview says so.** A "Public" pill with a globe fades onto the preview's top-left corner (180ms opacity,
  220ms rise and scale), and the frame gets the accent ring. Switching off reverses both.
- **Copy.** The hint next to Add a screenshot changes from "Only the Tudu team sees it" to "Private unless you show
  it". The "Public on GitHub" popover now lists "The screenshot, only when you show it" under Public on GitHub, and
  "The screenshot, unless you show it" under Only the Tudu team.
- **The issue.** When the switch is on, a "Screenshot" section with the image goes under the words and before the app
  details. When it is off, or there is no screenshot, the issue is exactly today's. It never says that a private
  screenshot exists.
- **The mail** always attaches the screenshot, as today. Its line says "Screenshot: name (attached, shown on the
  issue)" or "(attached, private)".
- **Unchanged:** sending, Filed, Sent (GitHub down) and Your reports. A report waiting for GitHub, or offline on the
  device, keeps its choice and files with it later.
- **Reduced motion:** the fold, the pill and the crossfade are instant.

## What goes where (only the screenshot row changes)

| Piece                      | GitHub issue (public)                             | Team only (row + mail)            |
| -------------------------- | ------------------------------------------------- | --------------------------------- |
| What you write, bug / idea | Yes                                               | Yes                               |
| App details (switch on)    | Yes                                               | Yes                               |
| **Screenshot**             | **Only when "Show it on the public issue" is on** | Always (mail attachment, storage) |
| Name, email                | Never                                             | Yes                               |
| The screenshot's file name | Never (the link carries no name)                  | Yes                               |

## How

### Core (`packages/core/src/feedback.ts`)

1. `feedbackReportSchema` gains `shotPublic: z.boolean().default(false)`. Older queued reports on devices have no such
   field, so they parse as private.
2. `issueBody` takes an optional `shot: string | null`, the image's URL. When it is set, the body gets
   `**Screenshot**`, a blank line and `![Screenshot](url)` after the words, before the `---` and the details. Without
   it, the body is byte-for-byte today's.

### Server (`apps/server`)

3. **Migration `0017_feedback-shot-public`** adds `feedback.screenshot_public boolean not null default false`. The
   server only sets it to true when the request had a screenshot. Existing rows stay private.
4. **The link.** `GET /api/feedback/shots/:id/:sig.:ext` is public and needs no session (GitHub's image proxy fetches
   it with no cookies).
   - `sig` is the first 32 base64url characters of `HMAC-SHA256(AUTH_SECRET, 'feedback-shot:' + id)`. It is checked
     with `timingSafeEqual`, so nobody can guess or enumerate links.
   - It answers only when the row exists, `screenshot_public` is true and the stored object is still there. Every
     other case gets the same 404: unknown id, wrong signature, private row, or object gone.
   - `ext` comes from the content type. The URL never carries the file name, which can be personal ("Rohit's
     screen.png").
   - Headers: the stored content type, `x-content-type-options: nosniff`, `content-disposition: inline`,
     `content-security-policy: default-src 'none'; sandbox`, `cache-control: public, max-age=3600`.
5. **Which images go public.** Only `image/png`, `image/jpeg`, `image/gif` and `image/webp`, the types GitHub's image
   proxy shows inline. SVG is never served publicly, because it can carry script. HEIC and other types stay private
   too (see the open point below).
6. **Filing.** `fileReport` builds the URL from the row (`BASE_URL` + the route above) when `screenshot_public` and the
   type allow it, and passes it to `issueBody`. The sweep uses the same function, so a report filed later still
   embeds its image. `BASE_URL` is already the public API origin on staging (`https://api.staging.tudu.ezdev.net`) and
   production (`https://api.tudu.ezdev.net`), so there's no new env var.
7. **The mail** line says whether the screenshot is shown on the issue.
8. **Taking one down.** Setting `screenshot_public = false` on the row (or deleting the object) makes the link 404 at
   once. GitHub's image proxy may keep a cached copy for a while. The clean fix is to edit the issue and drop the
   image line. I'll add both steps to `docs/release.md` under a short "Feedback screenshots" note. There's no admin UI
   for this now.

### Client

9. **`FeedbackDialog` (`packages/ui`)** gains `shotPublic` and `onShotPublic`. When `github` is on and a screenshot is
   in, it renders the row inside the existing `tp-fb-slot` fold, plus the Public pill and ring (`tp-fb-shot.tp-shown`)
   and the crossfading sub line. It also updates the hint and the popover lines. With email only it renders none of
   this.
10. **`apps/web/src/app/feedback.tsx`**: the draft gains `shotPublic` (false), which resets to false whenever the
    screenshot changes. The report JSON carries it, and the offline queue keeps it with the queued Blob.
11. **Kit** (`routes/kit/FeedbackStates.tsx`): adds the switch-off and switch-on phases, light and dark, desktop and
    phone sheet.

### Design parity (before the PR is ready)

- Canvas: port the approved draft into the shipped boards. On `K-FeedbackIssue` and `-Dark`, that means the hint, the
  popover lines and the privacy table row. Then mark the `K-FeedbackShot` boards as approved (they stay as the spec for
  the switch, pill and motion). `K-Feedback` gets the new hint where it shows the GitHub form.
- Design system artifact: the Send feedback form component gains the switch row, the pill and ring state, the new hint
  and the popover lines, so the DS, the canvas and the app match.

## Test scenarios

New IDs continue chunk 19's (last used: C19-U16, C19-A11, C19-E14). "(update)" changes an existing test. Tests run
on Rohit's Mac.

Unit, core (`packages/core/src/feedback.test.ts`):

| ID               | Scenario                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U17 (new)    | `feedbackReportSchema`: `shotPublic` defaults to false when missing; a non-boolean is refused                                               |
| C19-U18 (new)    | `issueBody` with a shot URL: "Screenshot" and `![Screenshot](url)` sit after the words and before `---`; without one it equals today's body |
| C19-U08 (update) | `issueBody` still never holds name, email, user id or a file name, with or without the shot                                                 |

Server (`apps/server/src/feedback.test.ts`, against the fake tracker and memory storage):

| ID               | Scenario                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-A12 (new)    | PNG with `shotPublic: true`: the filed body embeds `BASE_URL/api/feedback/shots/<id>/<sig>.png`; GET with no cookie returns the bytes, type, nosniff, CSP and cache headers |
| C19-A13 (new)    | `shotPublic` false, missing, or true with no screenshot: no Screenshot section and no link in the body; `screenshot_public` stays false                                     |
| C19-A14 (new)    | The link 404s alike for a wrong or missing sig, another report's sig, an unknown id and a private row; the sig differs per id and per `AUTH_SECRET`                         |
| C19-A15 (new)    | GitHub down at send: the row waits; the sweep later files it with the same image link                                                                                       |
| C19-A16 (new)    | SVG or HEIC with `shotPublic: true`: not embedded, the link 404s, the mail still attaches it                                                                                |
| C19-A17 (new)    | Taken down: after `screenshot_public` is set to false, or the object is deleted, the link 404s                                                                              |
| C19-A18 (new)    | The mail's screenshot line says "shown on the issue" or "private"; the attachment is there either way                                                                       |
| C19-A19 (new)    | Migration 0017 adds `screenshot_public` with default false; existing rows read as private                                                                                   |
| C19-A02 (update) | The same report twice: one row, one issue, and the first request's choice stands                                                                                            |
| C19-A11 (update) | The body never holds the name, email, user id, space name, storage key or file name (asserted on what the fake received)                                                    |

Unit, UI (`packages/ui/src/components/FeedbackDialog.test.tsx`):

| ID               | Scenario                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C19-U19 (new)    | No screenshot: no switch. A screenshot in: the switch is there, off, with the "Private." line. On: `onShotPublic(true)`, the Public pill, the ring and the "Public." line |
| C19-U20 (new)    | Email-only (`github` off): no switch and no pill with a screenshot in; the hint is "or paste or drop one" as today                                                        |
| C19-U21 (new)    | The hint reads "Private unless you show it"; the popover lists "The screenshot, only when you show it" and "The screenshot, unless you show it"                           |
| C19-U10 (update) | Popover open and close as today, with the new lines                                                                                                                       |

Unit, web (`apps/web/src/app/feedback.test.tsx`):

| ID               | Scenario                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C19-U22 (new)    | The report JSON carries `shotPublic`; replacing or removing the screenshot resets it to false; Send clears it with the draft |
| C19-U05 (update) | A report queued offline keeps `shotPublic` through a reload (IndexedDB) and sends it when back online                        |

End to end (`packages/e2e/tests/feedback/feedback.spec.ts`; desktop, phone and dark projects; fake tracker):

| ID               | Scenario                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C19-E15 (new)    | Attach a PNG, switch on (the pill shows), send: the fake's issue body has the image link; fetching it with a cookieless request returns the same bytes |
| C19-E16 (new)    | Attach, leave the switch off, send: the fake's issue has no link; the mail has the attachment                                                          |
| C19-E17 (new)    | Switch on, remove the screenshot, add another: the switch is off again                                                                                 |
| C19-E12 (update) | The popover and the hint show the new copy                                                                                                             |
| C19-E09 (update) | The kit's switch-off and switch-on phases, light and dark; nothing overflows at phone width                                                            |

Manual on staging, after deploy: send a report with a PNG and the switch on, then open the issue on github.com and check that the image shows.
This is the one thing the fake can't prove: that GitHub's image proxy can fetch from `api.staging.tudu.ezdev.net`.

## Open points

- **HEIC and other non-web images** (phone photos) stay private even with the switch on, because GitHub can't show
  them inline. I recommend the switch disables itself for those, with the sub line "This kind of image can’t go on
  the issue." That is a small canvas addition I'd draw before building. Converting HEIC to PNG on the server is the
  alternative, but it adds an image library for an edge case.
- **Very large images.** Uploads stay capped at 10 MB. GitHub's image proxy may refuse images above its own limit, in
  which case the issue shows the alt text "Screenshot". The staging check above covers the common case.
- **No in-app "take it down".** It's done by hand for now (step 8). A button in Your reports could come later.
