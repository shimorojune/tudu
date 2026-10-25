# The task panel's Jira fact only where Jira is connected

Status: approved by Rohit 25 Oct 2026; implemented. Canvas: approved by Rohit 25 Oct 2026 on the Jira page (boards `J-NoJira` and `J-NoJira-Dark`, sticky
`p04-nojira`), and "Jira is optional" (`J-Optional`) now passes the new mode to the panel. Kit: `TaskDetail` takes
`jira={false}` (Tudu Paper v14/v15).

## The bug

Open any task in a space that has never connected Jira: the panel shows a "Jira" fact with "Link a Jira issue".
Everywhere else Jira is invisible until you connect it (the sidebar, the top bar, the phone tabs), as the canvas's
"Jira is optional" board says. Linking a key there does nothing useful: there is no Jira to show its status or open it.

Cause: `apps/web/src/routes/today/TaskPanel.tsx` passes `onJira` to `TaskDetail` unconditionally, and `TaskDetail`
shows the fact whenever `onJira` is set. `useJira(spaceId).conn` is already read on the line above and used for
`onOpenJira`, so the page knows; it just never gates the fact on it. Every page that opens a task (Today, Week, Backlog,
Inbox, People) goes through this one `TaskPanel`, so they all have the bug.

## Why the tests missed it

Three gaps, all of the same shape: every Jira test runs in a space where Jira is connected, and nothing ever asserted
that the fact is absent.

1. **The design never drew the absent state.** The kit's `TaskDetail` drew the fact unconditionally, so even the
   "Jira is optional" board showed "Link a Jira issue" in its task panel. The chunk 10 spec was written from the
   boards, so it has no "no Jira, no fact" line to turn into a test.
2. **The unit test encoded the bug.** C10-U08 ends with "without a connection the key reads as words": it renders
   `TaskDetail` with `onJira` but no `onOpenJira` and checks the fact still shows. That is right for a task that kept
   its key, but no case renders the panel without `onJira`, and no test checks what `TaskPanel` passes.
3. **The end-to-end "no Jira" test stops at the shell.** C10-E01 ("no apps: no Jira anywhere") checks the sidebar and
   the top bar, but never opens a task. C10-E10 (the task panel) starts from `connected(page)`. No test opens a task
   panel in a space without Jira, and none covers a team space without Jira while Personal has it, which is exactly
   the report (a connection belongs to one space).

## The change

1. `TaskPanel.tsx`: the fact follows the connection.

   ```tsx
   onJira={conn || d.jira ? (key) => taskStore.linkJira(d.id, key) : undefined}
   onOpenJira={conn ? (key) => void openInJira(spaceId, key) : undefined}
   ```

   - Jira connected in this space: unchanged ("Link a Jira issue", the key and status, Open in Jira, Unlink).
   - Not connected, no key: no Jira fact at all. The panel has four facts: Planned, Due, Project, Visible to.
   - Not connected, the task kept a key (from before a Disconnect, or a key linked in another space's era): the fact
     shows the mark and the key, no status (already the case, `jiraStatus` is null without `conn`), and its menu has
     only "Unlink the issue" (already the case without `onOpenJira`). Unlinking makes the fact leave, since there is
     nothing to link to.
   - An expired token still counts as connected (`conn` is set; the panel's banner asks for a new token), so the fact
     stays, as today.

2. `TaskDetail` (packages/ui) needs no change: it already hides the fact without `onJira`. Its doc comment on `onJira`
   gets one line: "The page leaves it out where Jira isn't connected in the space, unless the task kept a key."
3. The rows keep their Jira signal for a kept key, unchanged (C10-E10 already asserts it after Disconnect).
4. `docs/tests/chunk-10.md`: the new and changed cases below.

Motion: none new. The fact is part of the panel's content, so it comes and goes with the panel's own entrance and the
220ms content slide between tasks. Light and dark are the same component; the canvas shows both.

## Tests

| Id                | Where                                                 | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C10-U12 (new)     | `packages/ui/src/components/TaskDetail.jira.test.tsx` | Without `onJira` and no key: no "Jira" button, no "Link a Jira issue" text, exactly four facts (Planned, Due, Project, Visible to). Without `onJira` but `readOnly` with a key (someone else's task): the key shows, with no picker.                                                                                                                                                                                                                 |
| C10-U08 (changed) | same file                                             | Rename its last part to "a key kept without a connection: the key alone, Unlink only" so the case says what it covers; assertions unchanged.                                                                                                                                                                                                                                                                                                         |
| C10-E01 (changed) | `packages/e2e/tests/jira/jira.spec.ts`                | After the shell checks, write "Tidy the buckets" on Today, open its panel: no "Jira" button in the dialog and no "Link a Jira issue" text; the four facts are there. Close it, then go on with Add an app as today.                                                                                                                                                                                                                                  |
| C10-E14 (new)     | same file, all three sizes (desk, tablet, phone)      | The whole life of the fact: no apps → open a task: no Jira fact. Connect by API, reload → the same task: "Link a Jira issue"; link TUDU-226 → key and Backlog status. Disconnect (through the API; C10-E10 covers the More › Disconnect Jira click) → open the task: the fact shows TUDU-226 with no status; its menu has "Unlink the issue" and no "Open TUDU-226 in Jira". Unlink → the fact leaves the panel; the toast says "Unlinked TUDU-226". |
| C10-E15 (new)     | same file, desk                                       | Per space: Jira connected in Personal by API; create Northwind (`createSpace`), write a task there, open it: no Jira fact. Switch back to Personal, open a task: "Link a Jira issue" is there. This is the reported case.                                                                                                                                                                                                                            |
| C10-E10 (changed) | same file                                             | After Disconnect, open the TUDU-224 task's panel: the key without a status and no "Open TUDU-224 in Jira" in its menu (the row's byline check stays).                                                                                                                                                                                                                                                                                                |

Re-run unchanged: C10-E02 to C10-E13, C03-E\* (task detail), and the Inbox and People flows that open the panel
(C08-E10 to C08-E20), since they all share `TaskPanel`.

## Design parity

- Kit (Tudu Paper): `TaskDetail` gains `jira?: boolean`; `false` leaves the fact out unless the task has a key, then
  shows the key alone with Unlink only. Leaving it out keeps the connected look, so no other board changes. README
  and `index.d.ts` say so.
- Canvas: `J-NoJira` / `J-NoJira-Dark` (not connected, a kept key, connected for comparison) and `J-Optional` passes
  `jira={jiraOn}`, so connecting there brings the fact in with the rest of Jira.
- `docs/rewrite/design-deviations.md`: nothing to add; the app and the canvas agree after this.

## Out of scope

The other items from the same report (list bullets, image paste, copy link, the add line's 1px shift, rich text in
Quick Add notes, the close-matches exit) are in their own threads.
