# One Inbox across every space

Status: proposal, waiting for Rohit's approval. No code until then.
Design: canvas page "08 · Inbox" (v56). Boards I-All-Desktop(-Dark), I-All-States(-Dark), I-Motion.

## Why

- **The bug.** Personal's sidebar shows Inbox, but `/me/inbox` sends you back to Today. The `teamOnly` guard in
  `apps/web/src/router.tsx` redirects it, while `VIEWS` in `AppShell.tsx` still draws the entry.
- **The real problem.** Inbox items are about you, not about a space. Each space has its own Inbox, so you check
  several places. The sidebar is space-scoped, which makes it the wrong home for something that isn't.

## What changes for the person

1. There is one Inbox, at `/inbox`. It opens from an inbox button in the top bar, beside Search, in the same
   IconButton style. A pip shows the total count across every space. The button is there in every space,
   including Personal.
2. The sidebar no longer has an Inbox entry. On phones, the header's inbox icon opens it, and More drops its
   Inbox row.
3. Every row shows its space ("Northwind · Today"). An **All spaces** chip filters to one space, and its menu
   shows a count per space. The filter lives in the address: `/inbox?space=northwind`.
4. Inbox, Answered and Sent work as they do now, but across every space.
5. New kinds of item:
   - **Invite**: "Sana Qureshi invited you to Design Guild", with **Join** and **Not now**.
   - **Notice**: "Arjun removed you from Pilot Farm", or "Pilot Farm was deleted". These have no actions and
     can be deleted.
   - **App update**: the Mac new-version card, shown once rather than once per team space.
6. **New vs read.** New rows sit on a faint ink wash (foreground at 4%, 7% on hover), with an 8px ink dot and a
   bold name. Read rows are muted: grey text, a lighter name, and the avatar at 60% opacity. No brand red
   anywhere on rows. Hover is never `--selection`.
7. **Row actions.** On hover, a row shows **Mark as read/unread** and **Delete**. On phones, swiping left
   deletes. Requests waiting for your answer can't be deleted, only declined.
8. **Clear all** on the Updates section replaces "Mark all as read". It deletes the updates in view (respecting
   the space filter) and shows a toast: "3 updates deleted. Undo".
9. **States**, as drawn:
   - Loading skeleton.
   - "Couldn't load your Inbox" error banner with **Try again**.
   - Offline warning.
   - "That invite has ended." error with **Remove**.
   - No search matches, "Nothing from Northwind", Answered empty, Sent empty, All caught up.
   - Banners keep their error and warning tones. The action button goes under the text in the narrow list.
10. Old links redirect: `/<space>/inbox` goes to `/inbox?space=<space>`, and `/<space>/inbox/<item>` goes to
    `/inbox/<item>?space=<space>`. The bare legacy `/inbox` route stops redirecting and becomes the real page.

## Data (packages/db, one migration)

- `inbox_kind` gains `invite` and `notice`.
- `inbox_items`:
  - `space_id` becomes nullable, with `on delete set null` instead of cascade, so a notice survives its space
    being deleted.
  - New `space_name text`: a snapshot used when the space is gone.
  - New `invite_id` references `space_invites`, `on delete cascade`.
  - New `notice jsonb` holding `{ type: 'removed' | 'deleted', by: name }`.
  - New `cleared_at timestamptz`. Delete and Clear all set it, and Undo clears it. Cleared rows are never
    returned. They are purged after 30 days by the existing attachment sweep timer in `bootstrap.ts`.
  - Unique index on `(user_id, invite_id)`, so backfilling invites is idempotent.
  - Index `(user_id, cleared_at, created_at)` for the cross-space read.
- Existing rows keep their `space_id`. Request, comment and answer items for a deleted space are now
  `set null` rather than deleted, so the read filters them out unless they are notices.

## Server (apps/server)

- **`GET /api/inbox?view=inbox|answered|sent&space=<id>&q=`** replaces `GET /spaces/:spaceId/inbox`.
  - It covers every space you're a member of, plus notices and invites addressed to you.
  - Each item gains `space: { id, slug, name, color } | null`.
  - `counts` becomes `{ toAnswer, unread, bySpace: Record<spaceId, InboxCounts> }`.
  - The old route stays for one release as a thin wrapper (`?space=`), because a Mac app on 0.37 may still
    call it. It is removed in the release after.
- **Invites.**
  - When an invite is sent to an email that already has an account, an `invite` item is inserted for that
    user.
  - Pending invites for your email (not accepted, not cancelled, under 7 days old) are backfilled on
    `GET /api/inbox` and `GET /api/me`, which covers people who signed up after being invited.
  - `POST /api/invites/:id/join` reuses `join()` by the invite's token and checks that your email matches. It
    returns the same errors (expired, taken back, another address).
  - On success, the invite item is cleared and the new space's slug is returned.
  - **Not now** clears the item only. The email link still works.
- **Notices.**
  - `removeMember` inserts a `removed` notice for the person removed. `restoreMember` (undo) deletes it.
  - `deleteSpace` inserts a `deleted` notice for every other member before the delete.
  - `leaveSpace` adds nothing, since you did it yourself.
- **Sync mutations** (`packages/core/src/tasks.ts`):
  - `inbox.read` stays.
  - `inbox.unread { id }` is new.
  - `inbox.delete { id }` is new, and is rejected for waiting requests with "Answer or decline it first."
  - `inbox.clear { spaceId: id | null, ids }` is new. The client sends the ids it showed, so Clear all never
    deletes something that arrived after you looked.
  - `inbox.restore { ids }` is new, for Undo.
  - `inbox.readAll` stays accepted for one release (older clients), then goes.
- **`INBOX_CHANGED`** becomes user-level. Its `spaceId` becomes optional, and the web refetches the one Inbox.
- **`/api/me`**: `spaces[].inbox` stays, for per-space counts in the switcher, and `inbox: InboxCounts` is added
  for the total.

## UI kit (packages/ui) and design system

These changes go in the kit and are mirrored in the design-system artifact in the same PR.

- **`TopBar`**: new `inbox?: { count?: number; open?: boolean; onInbox: () => void }`, drawn between Search and
  Jira.
- **`InboxItem`**:
  - `space?: { name; color }` for the byline.
  - Kinds `invite` and `notice`.
  - `onToggleRead`, `onDelete`, and `swipe` (phone).
  - The unread and read styles above, with hover using the neutral wash.
  - Waiting requests get no Delete.
- **`InboxSection`**: `action` can be "Clear all".
- **New `SpaceFilter`**: the chip plus the menu, with a count per space.
- **New icons**: `trash`, `unread`, `read`.
- **`Sidebar`**: the Inbox entry is no longer passed in. No component change.

## Web (apps/web)

- New top-level `/inbox` and `/inbox/$itemId` routes, inside the app shell. The sidebar shows the last-used
  space with nothing lit.
- `InboxPage` reads `/api/inbox`. It adds the space filter from `?space=` and handles invites (Join, then the
  toast "Joined Design Guild" with an **Open** action), notices, row actions and swipe, and Clear all with Undo.
  - Accepting a request shows "Accepted onto Today in Northwind."
  - The Mac update card stays client-side (`UpdateStore`), counted once. Clear all marks it read, and Delete
    hides that version.
- Remove the `teamOnly` guard and `inbox` from `VIEWS`, `moreItems` and `spacePath`. Add the redirects from
  section "What changes for the person".
- The dock badge (`DesktopHost`) and the phone header pip use the total from `/api/me`, plus the update once.
- Motion follows I-Motion:
  - Row actions slide in over `--dur-menu` with `--ease-arrive`.
  - A deleted row collapses its height over 200ms.
  - Swipe follows the finger and snaps at 40% width.
  - Reduced motion makes all of these 1ms.

## Test scenarios

IDs continue chunk 08's series (`docs/tests/README.md`). U01–U11, A01–A10 and E01–E20 already exist, and
E21–E23 are taken by the Inbox/People width plan, so this plan starts at U12, A11 and E24. The cases go into
`docs/tests/chunk-08.md` in the same PR, and each ID is in its test's name so `pnpm test:status` finds it.

### Unit (vitest)

| ID      | Where                                      | Case                                                                                                                                  |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| C08-U12 | core `inbox.test.ts`                       | `inboxBadge` and `inboxCountWords` add up `bySpace`; the total matches the sum of the spaces                                           |
| C08-U13 | core `inbox.test.ts`                       | `filterInbox` matches an invite's inviter and space name and a notice's space name; items from several spaces stay newest first        |
| C08-U14 | ui `TopBar.test.tsx`                       | Inbox button between Search and Jira; pip shows 4, `aria-label` "Inbox, 4 new"; no pip at 0; `open` adds `tp-on`; click calls `onInbox` |
| C08-U15 | ui `InboxItem.test.tsx`                    | Unread: `tp-unread`, the dot and a bold name. Read: no dot, muted classes. Neither uses `--selection`                                  |
| C08-U16 | ui `InboxItem.test.tsx`                    | Hover actions: Mark as read/unread calls `onToggleRead`, Delete calls `onDelete`; a waiting request has no Delete                      |
| C08-U17 | ui `InboxItem.test.tsx`                    | Kinds: invite shows Join and Not now; notice shows its words and no buttons; the byline shows the space name                           |
| C08-U18 | ui `InboxItem.test.tsx`                    | Swipe: a left drag past 40% calls `onDelete`; under 40% it snaps back; a request can't be swiped                                       |
| C08-U19 | ui `SpaceFilter.test.tsx`                  | Menu lists All spaces then each space with its count; choosing one calls `onChange`; the chip reads the chosen space                   |
| C08-U20 | web `router.test.ts`                       | `/me/inbox` and `/northwind/inbox` go to `/inbox?space=…`; `/northwind/inbox/<id>` keeps the item; `/inbox` renders with no redirect   |
| C08-U21 | web `AppShell` test                        | No Inbox in the sidebar (Personal and team) or in More; the top bar pip is the total from `/api/me` plus the Mac update, once           |
| C08-U22 | web `desktop.test.tsx`                     | Dock badge is the total plus a waiting update, counted once however many team spaces there are                                       |

### API (apps/server, against the test database)

| ID      | Case                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C08-A11 | `GET /api/inbox`: items from Northwind and Pilot Farm in one list, newest first, each with its `space`; Personal is included                                |
| C08-A12 | `?space=` narrows the list while `counts.bySpace` still has every space; a space you aren't in returns 403                                                  |
| C08-A13 | After you're removed from Pilot Farm, its items are gone and the `removed` notice is there; `restoreMember` takes the notice away                           |
| C08-A14 | Deleting Pilot Farm leaves a `deleted` notice for each other member with `space: null` and the name kept; its request and comment items are gone          |
| C08-A15 | `inbox.unread` then `inbox.read` round-trips `readAt`, and `counts.unread` follows; someone else's item returns 403                                       |
| C08-A16 | `inbox.delete`: a comment is hidden and stays hidden after a re-read; a waiting request returns 409 "Answer or decline it first."                        |
| C08-A17 | `inbox.clear` with ids clears only those ids; an item that arrived after the read survives; `inbox.restore` brings them back with their read state      |
| C08-A18 | Inviting an existing user creates one invite item; inviting again still leaves one; signing up with an invited email backfills it                         |
| C08-A19 | `POST /api/invites/:id/join`: success makes you a member, spends the invite, clears the item and returns the slug                                           |
| C08-A20 | Join on an expired, taken-back or other-address invite returns that error, and the item stays                                                              |
| C08-A21 | Compat: `GET /spaces/:id/inbox` still answers as before, and `inbox.readAll` is still accepted                                                           |

### End to end (`packages/e2e/tests/inbox`, desktop unless noted)

| ID      | Case                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C08-E24 | Regression for the original bug: from Personal, the top-bar Inbox opens `/inbox` with a Northwind request and a Pilot Farm comment, each labelled  |
| C08-E25 | Space filter: pick Northwind, only its items remain and the address has `?space=northwind`; reload keeps it; All spaces brings everything back        |
| C08-E26 | Opening an unread comment turns it read (dot gone, pip −1); Mark as unread from hover brings both back                                               |
| C08-E27 | Delete from hover: the row collapses and is gone after reload; a waiting request shows no Delete                                                    |
| C08-E28 | Clear all with 3 updates: "3 updates deleted. Undo"; Undo brings all 3 back; Clear all again, reload, Updates is empty and requests are still there  |
| C08-E29 | Meera invites you to a new space: the invite appears live; Join opens the space with its toast; the invite is gone and the space is in the switcher |
| C08-E30 | Join on a taken-back invite: "That invite has ended." banner; Remove clears the row; Not now on another invite hides it and the email link still works |
| C08-E31 | Meera removes you from Pilot Farm: the notice appears live and Pilot Farm leaves the switcher; deleting the notice works                             |
| C08-E32 | Old links: `/northwind/inbox` lands on `/inbox?space=northwind`; `/me/inbox` lands on `/inbox`                                                         |
| C08-E33 | Phone: the header inbox icon opens the Inbox with the total; swiping left on a comment deletes it; More has no Inbox row                             |
| C08-E34 | Error: `/api/inbox` returns 500, so the error banner shows; Try again succeeds once the route is fulfilled; offline shows the warning banner          |
| C08-E35 | Dark: E24's list in dark; new rows use the ink wash and dot, read rows are muted, and no row pixels use the brand red                                |

The existing C08-E10 to C08-E20 Inbox specs keep their IDs. They are updated to the new address and the
top-bar entry, and none are dropped.

## Out of scope, and open questions

- **Tablet**: no board is drawn. It follows the desktop two-pane layout down to the existing breakpoint, then
  the phone layout. Say if you want a board first.
- **Emails**: invite emails are unchanged. The Inbox is an extra way in, not a replacement.
- **Push and desktop notifications**: unchanged.
- **Retention**: cleared items are purged after 30 days. Shout if you want them kept longer.

## Rollout

One PR: migration, server, kit, web, tests, the design-system mirror, and the canvas marked "built". It ships in
the next release. The compatibility route and `inbox.readAll` are removed in the release after.
