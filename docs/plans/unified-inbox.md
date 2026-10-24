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

### Unit (vitest)

- **core**:
  - `inboxCountWords` and `inboxBadge` with `bySpace` totals.
  - `filterInbox` matches invite and notice text (space name, inviter).
  - Item ordering across spaces is newest first.
- **server, `requests.test.ts` / new `inbox.test.ts`** (against the test database):
  - Items from two spaces come back in one list, each with its `space`.
  - `?space=` narrows the list, while `counts.bySpace` still has every space.
  - Items from a space you've left are not returned. A `removed` notice for it is returned.
  - Deleting a space keeps the `deleted` notice, with `space: null` and `space_name` set. Request and comment
    items for that space disappear.
  - `inbox.unread` then `inbox.read` round-trips `readAt`, and counts follow.
  - `inbox.delete` on a waiting request returns 409 with the message, and on a comment hides it.
  - `inbox.clear` with ids clears only those ids. An item that arrives after the read survives.
  - `inbox.restore` brings the cleared items back with their read state.
  - Someone else's item returns 403.
  - Inviting an existing user creates one invite item. Inviting twice still leaves one. Sign-up backfill
    creates it.
  - `POST /invites/:id/join`: success makes you a member and clears the item. Expired, taken back and wrong
    email each return their error, and the item stays.
  - `removeMember` creates a notice, and `restoreMember` removes it.
  - The old `/spaces/:id/inbox` still answers (compat).
- **ui**:
  - `TopBar` renders the inbox button with its pip, an `aria-label` of "Inbox, 4 new", and the `tp-on` state.
  - `InboxItem`:
    - Unread class, dot and bold name; read rows are muted.
    - Hover actions call `onToggleRead`/`onDelete`.
    - No Delete on waiting requests.
    - Invite and notice kinds render their buttons and words.
    - The space byline renders.
  - `SpaceFilter`: the menu lists spaces with counts, and choosing one calls `onChange`.
- **web**:
  - Router: `/me/inbox` and `/northwind/inbox` redirect to `/inbox?space=…`. `/inbox` renders without
    redirecting.
  - `AppShell`: no Inbox in the sidebar or More, and the top bar pip shows the total.
  - `DesktopHost`: the dock badge is the total plus the update, counted once.

### End to end (Playwright, packages/e2e/tests/inbox)

1. From Personal, click the top-bar Inbox. You see a request from Northwind and a comment from Pilot Farm, each
   labelled with its space. (This covers the original bug.)
2. Pick Northwind in the space filter. Only Northwind's items remain, and the address has `?space=northwind`.
   Reload, and the filter is kept.
3. Open an unread comment, and it turns read: the dot is gone and the pip drops by 1. Mark it unread from hover,
   and the dot and count come back.
4. Delete a comment from hover, and it's gone after reload. Waiting requests show no Delete.
5. Clear all with 3 updates: the toast says "3 updates deleted". Undo brings all 3 back. Clear all again
   without Undo, and after reload Updates is empty while requests remain.
6. Meera invites the signed-in user to a new space. The invite appears without a reload, via sync. Join takes
   you into the space with the toast. The invite is gone, and the space is in the switcher.
7. Join on an invite that was taken back shows the "That invite has ended." banner. Remove clears the row.
8. Meera removes you from Pilot Farm. The notice appears, and Pilot Farm is gone from the switcher. Deleting the
   notice works.
9. Old link: `/northwind/inbox` lands on `/inbox?space=northwind`.
10. Phone viewport: the header inbox icon opens the Inbox. Swiping left on a comment deletes it. More has no
    Inbox row.
11. Error state: the route fails (`page.route` returns 500), so the banner shows. Try again succeeds once the
    route is fulfilled.
12. Dark theme: a visual snapshot of the list, new and read rows (no red pixels in rows, only an ink wash).

The existing C08 inbox specs (11 tests) are updated to the new address and the top-bar entry. None are dropped.

## Out of scope, and open questions

- **Tablet**: no board is drawn. It follows the desktop two-pane layout down to the existing breakpoint, then
  the phone layout. Say if you want a board first.
- **Emails**: invite emails are unchanged. The Inbox is an extra way in, not a replacement.
- **Push and desktop notifications**: unchanged.
- **Retention**: cleared items are purged after 30 days. Shout if you want them kept longer.

## Rollout

One PR: migration, server, kit, web, tests, the design-system mirror, and the canvas marked "built". It ships in
the next release. The compatibility route and `inbox.readAll` are removed in the release after.
