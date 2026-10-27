# Clear the Dependabot and code scanning alerts

Status: approved by Rohit 27 Oct 2026. Canvas: not applicable (dependency and input-hardening changes only, nothing on
screen changes); skipping it approved by Rohit 27 Oct 2026.

## The alerts (27 Oct 2026)

44 open: 13 Dependabot, 31 CodeQL. All 31 CodeQL alerts were reproduced locally with the CodeQL bundle (same
`javascript` and `actions` code-scanning suites as GitHub's default setup), and the prototype below takes that run to
0 results. The `boot.test.ts` regex alert mentioned earlier is already closed (fixed in 06355dd); it is not in the list.

### Dependabot (13)

| Alerts                                                            | Package            | Severity           | Comes from                                                                                 | Real risk                                                                                                                   | Fix                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------ | ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| #3 #4 #8 #9 #10 #11 #12 #13 (two of each: nanoid 3.3.3 and 4.0.2) | nanoid             | 6 high, 2 moderate | `@excalidraw/excalidraw` 0.18.1 (3.3.3), `@excalidraw/mermaid-to-excalidraw` 2.2.2 (4.0.2) | Low: the bugs need a zero, negative or fractional size, Excalidraw passes fixed sizes                                       | override `nanoid@<3.3.18` to `^3.3.18` (3.3.20) and `nanoid@>=4 <5.1.16` to `^5.1.16`. nanoid 4 and 5 are both ESM with the same `nanoid()` API |
| #5 #6 #7                                                          | lodash-es 4.17.21  | 1 high, 2 moderate | `chevrotain` 11.0.3 via Mermaid                                                            | Low: `_.template` imports and `_.unset/_.omit` paths are never fed user input                                               | override `lodash-es@<4.18.0` to `^4.18.1` (already in the tree for other packages)                                                              |
| #14                                                               | katex 0.16.47      | low                | Mermaid 11.17.2                                                                            | Low: needs existing prototype pollution first                                                                               | override `katex@<0.18.2` to `^0.18.2` (resolves 0.18.10). Mermaid 12 itself moved to `^0.18`, so Mermaid's KaTeX calls work on it               |
| #2                                                                | glib 0.18.5 (Rust) | moderate           | Tauri 2's Linux GTK stack (`gtk 0.18`)                                                     | None for us: glib is only compiled for Linux; Tudu ships the Mac app only. No fix Tauri 2 can take (needs glib 0.20 / gtk4) | dismiss as "vulnerable code is not used", with that reason                                                                                      |

After the overrides, `pnpm audit` reports no known vulnerabilities.

### CodeQL (31)

| Alerts                 | Rule                                            | Where                                                                                                             | Verdict                                                                                                                | Fix                                                                                                                                                           |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #16 #17 #18 #20 #22    | polynomial ReDoS                                | `EMAIL_PATTERN` (core `spaces.ts`, ui `SignIn.tsx`), used in SignIn, InviteField, MembersBody, CreateSpace        | Real but minor: a long pasted string like `a@a.a.a.a…!` freezes the tab for seconds                                    | rewrite as `/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]*)*\.[^\s@.]+$/`: same accepts/rejects for real addresses except a trailing dot (`a@b.c.`), which is invalid anyway |
| #6 #7 #8 #21           | polynomial ReDoS                                | `normalSite`, `siteHost` (core `jira.ts`), JiraPanel connect                                                      | Real, minor (`/\/+$/` on many slashes)                                                                                 | new `trimSlashes()` loop in core; `normalSite` cuts the query with `split(/[?#]/)`                                                                            |
| #12 #13 #14 #15        | polynomial ReDoS                                | `versionIn`, `notesHtml` (core `versions.ts`)                                                                     | Input is our own release notes; harmless but cheap                                                                     | `(?<!\d)` before the version; headings and bullets match one space then trim; inline strips refs without the leading `\s*` and collapses spaces after         |
| #3 #4                  | polynomial ReDoS                                | `osOf`, `browserOf` (core `feedback.ts`)                                                                          | User agent is client-supplied; minor                                                                                   | test the device/`Safari` word separately, then read the version with a simple regex                                                                           |
| #9                     | polynomial ReDoS                                | `cleanHtml` TAG_RE (core `notes.ts`)                                                                              | Real: many unclosed `<!--` in a pasted note is quadratic, and this runs on the server for every saved note             | an unclosed comment runs to the end (as browsers read it); the junk-tag branch stops at `<`                                                                   |
| #10 #34                | polynomial ReDoS                                | `toHtml`, `noteHtml` (core `notes.ts`)                                                                            | Real, server-side, minor                                                                                               | tag test stops at `<`; trailing empty paragraphs trimmed with an `endsWith` loop                                                                              |
| #5 #19 #24 #25 #26 #27 | ReDoS / incomplete multi-character sanitization | tag stripping in core `inbox.ts`, `notes.ts` (`isEmptyHtml`, `textOf`), ui `InboxItem.tsx`, server `jira/fake.ts` | Output is plain text, not HTML, so no injection; the ReDoS part is real                                                | one `stripTags()` in core: removes `<[^<>]*>` again until nothing changes. All five places use it                                                             |
| #28                    | double unescaping                               | `textOf` (core `notes.ts`)                                                                                        | Real bug: a note containing the words `&lt;` shows `<` in search and previews                                          | unescape `&amp;` last                                                                                                                                         |
| #29                    | incomplete attribute sanitization               | `upgradeChips` (core `attachments.ts`)                                                                            | False positive in practice (the name comes from a `"…"` attribute so has no raw quote), but cheap                      | title is `esc(unesc(name))`                                                                                                                                   |
| #23                    | DOM text reinterpreted as HTML                  | `apps/desktop/shell/loader.js`                                                                                    | False positive in practice (`data-go` is a fixed attribute in our own HTML), but it decides where the window navigates | only one of the four known pages (`/`, `/menubar`, `/quick-add`, `/note-window`), otherwise `/`                                                               |
| #30 #31                | incomplete URL substring check                  | `packages/e2e/mac/tests/desktop.spec.ts`                                                                          | False positive, test only (`opened` is an array, `includes` is exact)                                                  | use `some((u) => u === …)` so the rule sees an exact match and the alert closes on its own                                                                    |
| #2 #32                 | workflow without permissions                    | `.github/workflows/flake-check.yml`                                                                               | Real hardening: the token gets the repo default                                                                        | top-level `permissions: contents: read` (the jobs only check out and upload artifacts)                                                                        |

Everything is one PR. No release secrets, deploy settings or signing are touched.

## Test scenarios

New unit tests in `packages/core` (vitest), each slow-input case asserting it finishes under 100 ms on a 50,000-char
input (today each takes seconds):

- **SEC-U01** `EMAIL_PATTERN` accepts `rohit@tudu.app`, `a.b+c@mail.co.uk`, `x@y.z`; rejects `a@b`, `a@.b`, `a b@c.d`,
  `a@b@c.d`, `@b.c`; `'!@!' + '!.'.repeat(25000)` is quick. The ui `SignIn` copy gets the same cases.
- **SEC-U02** `stripTags`: `<p>a<b>b</b></p>` gives `ab`; `<scr<b>ipt>x` gives `x` with no `<script` left;
  `'<'.repeat(50000)` is quick and unchanged; the `by` argument puts a space per tag.
- **SEC-U03** `textOf('<p>&amp;lt;b&amp;gt;</p>')` is `&lt;b&gt;` (was `<b>`); existing textOf cases unchanged.
- **SEC-U04** `noteHtml`: trailing `<p></p>` run is dropped as before; `'<p></p>'.repeat(10000) + 'x'` is quick.
  `isEmptyHtml` cases unchanged; many `<` is quick.
- **SEC-U05** `cleanHtml`: `a<!-- b` keeps `a` only; `'<!--'.repeat(20000)` and `'<!x'.repeat(20000)` are quick.
- **SEC-U06** `toHtml`: `'<a'.repeat(25000)` is quick (and is treated as plain words); `a < b` stays plain words;
  `<p>x</p>` stays HTML.
- **SEC-U07** `trimSlashes`, `normalSite`, `siteHost`: `https://j.io///` and `https://j.io/?x#y` give the same as
  today; `'/'.repeat(50000) + 'x'` is quick.
- **SEC-U08** `versionIn('9'.repeat(50000))` is quick and null; `notesHtml` with a 50,000-space heading and bullet is
  quick; existing release-notes cases unchanged (commit refs still removed, no double spaces).
- **SEC-U09** `osOf`/`browserOf`: `'iPad'.repeat(12500)` and `'Version/9' + '9'.repeat(50000)` are quick; existing UA
  cases unchanged.
- **SEC-U10** `upgradeChips` on a chip without a title whose name holds `&quot;` writes a title with `&quot;`, never a
  raw `"`.

Existing tests that cover the rest (all must stay green):

- Mac e2e `desktop.spec.ts` (main window, menu bar, Quick Add and note window all still load through the loader; the
  two edited link checks still pass).
- Web e2e for sign in, invites, Create space, Jira connect, Inbox quotes and Notebook drawing (the overrides move
  Excalidraw's nanoid and Mermaid's KaTeX/lodash-es).
- Server tests using the Jira fake (comment and description text).

Checks, all on Rohit's Mac:

1. `pnpm install --frozen-lockfile`, then `pnpm audit` reports no known vulnerabilities.
2. `pnpm verify` (lint, typecheck, unit tests).
3. Web e2e and Mac e2e suites.
4. Manual: in a Notebook drawing, open Excalidraw's "Mermaid to Excalidraw" and convert a small flowchart with a
   `$$x^2$$` label (proves Mermaid on KaTeX 0.18 and nanoid 5).
5. CI green on the PR. After merge, CodeQL closes the 31 alerts and Dependabot closes 12 on their own; I dismiss glib
   #2 with the reason above.
