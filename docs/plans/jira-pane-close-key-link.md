# Jira panel: a click outside closes it, and the issue key opens the ticket

Status: proposal, awaiting Rohit's approval. Issues: #62 (Jira pane should close when we click outside) and #61 (in
the Jira pane, clicking the ticket ID should open the ticket in the browser). Canvas: approved by Rohit 12 Nov 2026 on
the Jira page (boards `J-Outside`, `J-Outside-Dark`, `J-Outside-States`, `J-Outside-States-Dark`, sticky
`p04-outside-draft`; `J-Motion` gained "Open the ticket" and the close wording). Both behaviours are now the default
in the canvas kit, so every Jira prototype on the canvas has them. Kit: Tudu Paper, 12 Nov (`Drawer`
`closeOnOutside`, `JiraPanel` `keyLinks`, `Sidebar` `data-nav`, connect form `data-keep-open`; READMEs for Drawer and
JiraPanel, `index.d.ts`).

## What is wrong today (master b532c83)

- **#62.** `JiraHost` and `JiraConnectHost` (`apps/web/src/app/JiraHost.tsx`) put the panel in
  `<Drawer modal={false}>`. In `packages/ui/src/components/Drawer.tsx`, `onInteractOutside` calls
  `e.preventDefault()` whenever the drawer is modeless, so Radix never dismisses it. This was deliberate: the panel was
  designed to "stay open while you work". Only × or Esc (from inside it) close it. That design changes here.
- **#61.** The key is a `<span className="tp-jp-key">` in `byline()` and a `<span className="tp-jp-pvkey">` in the
  preview header (`packages/ui/src/components/JiraPanel.tsx`). Only the ↗ IconButton and "Reply in Jira" call
  `onOpenInJira`, which goes through `openInJira()` → `openOutside(issueUrl(site, key))` (`apps/web/src/app/jira.ts`,
  `links.ts`). The ticket is reachable, but only from the preview.

## The change

### 1. Kit (`packages/ui`), ported from Tudu Paper (12 Nov)

**Drawer** (`Drawer.tsx`)

- New prop `closeOnOutside?: boolean`, default `true` when the drawer is modeless (`modal={false}`, not
  `fullscreen`). Modal drawers are unchanged: they already close on their veil.
- Radix events split by kind:
  - `onPointerDownOutside`: let Radix dismiss (→ `onClose`) unless the press lands on something that isn't
    "outside": `.tp-toast-host`, `.tp-nb-float` (both already exempt today), `.tp-jirabtn` and
    `[data-nav="app:Jira"]` (the entries that toggle the panel, so one press closes it instead of closing and
    reopening it), or the panel holds `[data-keep-open]`. Radix already treats portaled children of the panel (its
    menus, the date picker) as inside, and layers above it (a dialog, Quick Add, the task drawer) disable pointer
    events below them, so those need no list.
  - `onFocusOutside`: always `preventDefault()` for a modeless drawer. Moving focus away with Tab or a shortcut never
    closes it; only a press does.
  - The press is not swallowed (no veil), so it still does its own job: clicking a task on the day opens it while
    Jira leaves.
- `closeOnOutside={false}` keeps today's behaviour, for any future panel that needs it.

**Sidebar** (`Sidebar.tsx`): each nav button gets `data-nav={it.value}`, so the Jira row can be recognised
(`app:Jira`). Nothing visible.

**JiraPanel** (`JiraPanel.tsx`)

- New prop `keyLinks?: boolean`, default `true`. When the panel knows the site (`siteUrl`):
  - the byline key becomes `<a className="tp-jp-key" href={issueUrl(siteUrl, key)} target="_blank"
rel="noopener noreferrer" title="Open KEY in Jira" aria-label="Open KEY in Jira">` on the desk and tablets.
    On phones (`compact`) the row key stays a span: a tap target that small would open the browser by mistake.
  - the preview header key becomes the same link on every size (the phone sheet included), beside ↗.
  - a plain click calls `onOpenInJira(key)` and `preventDefault()`s (so the Mac app and the web go through the same
    `openOutside`); ⌘/Ctrl-click and middle click are left to the browser. The click never reaches the row, so it
    doesn't open the preview (`stopPropagation`, and the row's click and key handlers ignore `a`).
- CSS (from the kit, `components.css`): `a.tp-jp-key` / `a.tp-jp-pvkey` get a `jira-soft` wash and an underline that
  ease in on hover (160ms `ease-change`), a deeper wash on press (60ms), the usual ring on `:focus-visible`, no fade
  under reduced motion. The wash sits in negative margin, so the byline doesn't move.
- **Connect form** (`JPConnect`):
  - `data-keep-open` on the form while it is checking or showing its Connected tick, so a press outside doesn't close
    the panel mid-check.
  - New props `draft?: { site: string; token: string }` and `onDraft?(d)`: the form starts from `draft` and reports
    each edit, so the page can bring back what you typed if the panel closes before you connect. `JiraPanel` passes
    them through as `connectDraft` / `onConnectDraft`.

### 2. Web (`apps/web`, so the Mac app too)

- `jira.ts`: a module-level `connectDraft` (memory only, never storage) with `getConnectDraft()`,
  `setConnectDraft()`, `clearConnectDraft()`. Cleared when a connect succeeds and on sign out (`session.ts`
  `signOut`). A reload or quitting the app forgets it, by design: the token is never written to disk.
- `JiraHost.tsx`: `JiraView` and `JiraConnectHost` pass `connectDraft` / `onConnectDraft`. No change to how the
  panel closes: Drawer's `onClose` is already `close()` (drops `?jira`, so Back still works).
- `routes/kit/Overlays.tsx`: the modeless demo's copy says a press outside closes it.

### 3. Docs

- This proposal gets an "As built" section when it ships.
- Canvas: the four boards above say "approved, not built yet"; when the PR merges, the sticky goes gray "BUILT".

## Test scenarios

All new and changed tests run on PR CI (web unit, web e2e in the Playwright container, desktop job), not on Rohit's
Mac.

### Unit (Vitest)

| ID      | Where                                | Case                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C00-U37 | `packages/ui/.../Drawer.test.tsx`    | Modeless drawer: a pointer down on the page outside it calls `onClose`; a pointer down inside it, on a `.tp-toast-host` child, on a `.tp-nb-float` element, on `.tp-jirabtn` or on `[data-nav="app:Jira"]` does not; a panel holding `[data-keep-open]` does not close; focus moving to a button outside does not close it; `closeOnOutside={false}` keeps it open on an outside press; a modal drawer is unchanged (closes on its veil only)                 |
| C10-U29 | `packages/ui/.../JiraPanel.test.tsx` | With `siteUrl`: each row's key is a link to `{site}/browse/{KEY}` named "Open KEY in Jira", `target=_blank`, `rel` noopener; clicking it calls `onOpenInJira(KEY)` once and doesn't open the preview; Enter on the focused link does the same; a click elsewhere on the row still opens the preview; the preview header's key is the same link; `compact`: the row key is text and the sheet's key is a link; `keyLinks={false}` and no `siteUrl`: plain text |
| C10-U30 | `packages/ui/.../JiraPanel.test.tsx` | Connect form: no `data-keep-open` at rest; while `onConnect` is pending the form has `data-keep-open` and keeps it through the Connected tick; on a refusal it goes away; `connectDraft` fills the address and token; typing calls `onConnectDraft` with both                                                                                                                                                                                                 |
| C10-U31 | `apps/web/src/app/jira.test.ts`      | `connectDraft`: set and read back; nothing written to `localStorage` or `sessionStorage`; cleared by a successful connect and by `signOut()`                                                                                                                                                                                                                                                                                                                  |

Changed: **C00-U32** "modeless: no veil, and Escape closes only from inside the panel" keeps its Esc checks and no
longer asserts that an outside press is ignored (C00-U37 owns that now).

### End to end (Playwright, fake Jira at `/__test/jira`)

| ID      | Spec           | Case                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-E32 | `jira.spec.ts` | Desk and tablet: Jira open on Today. A press on the day's empty paper closes it (the panel's leaving class, then gone; `?jira` dropped from the URL; Back doesn't bring it back as a step). Open it again and click a task's title on the day: the task panel opens and Jira closes in the same click. Open it again: Tab out of the panel to the page leaves it open |
| C10-E33 | `jira.spec.ts` | Desk: what is not outside. The top bar's Jira button closes it in one press (`aria-pressed` false, not reopened); the sidebar's Jira row does the same; a press inside the panel (search, the views menu, the date picker) keeps it; Show on a linked task keeps it and flashes the task; removing a view and pressing Undo on the toast keeps it                     |
| C10-E34 | `jira.spec.ts` | Desk and tablet: clicking a row's key opens a popup at `${JIRA_SITE}/browse/TUDU-212`; the panel stays open and no preview opens. In the preview, the header key does the same. Hovering the key gives it the wash and underline (computed `background-color` not transparent). Phone: the row key is not a link; the sheet's header key is, and opens the same URL   |
| C10-E35 | `jira.spec.ts` | Connect form, desk: type an address and a token, press on the day: the panel closes; open Jira again: both are as typed. With the fake Jira's check held (route delayed), Connect shows Checking… and a press on the day doesn't close the panel; once it answers the list loads. Reload: the form is empty again                                                     |
| C10-E36 | `jira.spec.ts` | All spaces token panel (`JiraConnectHost`): a press on the page outside it closes it and drops `?jira`                                                                                                                                                                                                                                                                |

Changed:

- **C10-E03** clicks Monday in the sidebar with the panel open and expects it to stay. Now: Monday turns the day and
  Jira closes; reopen it to go on with Refresh, ×, reload and Esc as before.
- **C10-E05** crosses the Monday task off on the day with the panel open, then reads the chip. Now: the checkbox
  press closes Jira; reopen it and read the chip (crossed off).
- Any other spec that works on the page with Jira open and expects it still open (none found by search beyond
  these two; CI will show any I missed, and each gets the same "reopen, then check" fix, never a skip).

### Mac app (desktop job) and manual

- No new desktop test: the key link goes through the same `openOutside` as ↗, which the desktop job already covers.
- **MC-J01** (Rohit, on the Mac after release): in the app, click a key in the Jira panel: the ticket opens in the
  default browser and Tudu stays as it was. Click on the day: the panel closes.

## Risks

- **A changed habit.** Anyone who worked through issues by clicking on the day (crossing off, turning days) with Jira
  open now has to reopen it. Show on a linked task, the way the panel was designed to be worked through, still keeps
  it. This is what #62 asks for and what the approved canvas draws.
- **Close and reopen in one press** on the toggles: covered by excluding `.tp-jirabtn` and `[data-nav="app:Jira"]`
  (C10-E33).
- **Radix outside detection** for portaled children (menus, date picker, tooltips) relies on Radix's React-tree
  check; C10-E33 presses inside each of them.
- **The token draft** lives in JS memory until connect, sign out, reload or quit. Same exposure as the field itself
  while it's open.

## Out of scope

- Phones: Jira is a page there; nothing closes on outside presses.
- The Apps panel and the task panel: already close on their veil.
- Opening the ticket from the task panel's Jira fact: unchanged.
