# Chunk 17 · Quick Add always says where

Status: proposed 23 Oct 2026. Awaiting your approval. Branch `rewrite/17-quick-add-space-line` once approved.

Boards: 13 Next, K-QuickAdd ("Quick Add always says where the task goes"), and K-Proto's New task. Today the top
line "In Northwind for Me" appears only once you are in a team space, and the floating bar never has it. This chunk
puts it on every Quick Add.

## Scope

- **Every Quick Add opens on the line.** The bar over the app, the floating bar (⌘⇧N) and the phone sheet all start
  with "In … for Me". The rest of the bar is unchanged.
- **Personal alone.** The line reads "In Personal for Me" and both chips are plain, with no chevron, no menu and no
  hover, because there is nothing to choose yet. Join or create a team space and the same chips start to open, with
  no reload (the `me` read already carries your spaces).
- **The floating bar.** It gains the line too. The space chip starts on the space you were last in on this Mac (the
  desk's current space, remembered by the floating page), and any space is one click away. "For" lists that space's
  people, as on the desk.
- **Placeholder.** It stays "What needs doing?" for you, and becomes "What should Meera do?" once someone is picked
  (as built).
- **Data.** None. No migration and no API change.

Out of scope: a space picker on the phone's top bar (not drawn), and the Quick Add project picker's Edit projects…
line (chunk 18).

## Choices

1. **One component, no second bar.** `QuickAdd`'s `send` prop stops being optional in the app: `quickAdd.tsx` and
   `FloatingQuickAdd` always pass it, and `canSend` stays false while you have no team space, so the person chip is
   plain. The alternative keeps two layouts (plain bar, bar with the line), which is what produced the gap on the
   floating bar.
2. **Plain chips are not buttons.** With one space and no one to send to, the chips render as text with the chip's
   look, not as disabled buttons, so a screen reader reads "In Personal for Me" and Tab skips them. The alternative,
   disabled buttons, would make keyboard users stop on two controls that do nothing.
3. **The floating bar remembers the space per Mac.** The desk tells the floating window which space it is on (the
   bridge already carries `go` the other way). A first summon after launch uses Personal. The alternative, always
   Personal, makes team work one extra click every time.

## Test plan

Unit (`packages/ui`, `apps/web`):

| ID      | Component | Case                                                                                                                           |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C17-U01 | QuickAdd  | Personal alone: "In Personal for Me", both chips plain (no button role, no menu on click or Enter), Tab goes to the title      |
| C17-U02 | QuickAdd  | Two spaces: the space chip opens the list, the person chip opens the people; picking Meera changes the placeholder             |
| C17-U03 | web       | A team space joining (the `me` read changes) turns the plain chips into buttons without remounting the bar or losing the draft |
| C17-U04 | floating  | The floating page starts on the last space the desk reported, and on Personal before any report                                |

End-to-end, group `quick-add`:

| ID      | Case                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C17-E01 | A fresh person with Personal alone opens Quick Add on the desk: the line reads "In Personal for Me" and the chips do not open |
| C17-E02 | The same person creates a space; Quick Add now opens the space list, and a task added in it lands on that space's Today       |
| C17-E03 | Phone: E01 in the sheet (phone)                                                                                               |
| C17-E04 | Floating page (desktop bridge faked): the line shows; it starts on the space the desk reported; switching space adds there    |
| C17-E05 | Dark: E01 again in dark                                                                                                       |

Desktop, group `desktop`: C17-D01 ⌘⇧N over another app shows the line on the space the desk was last on, and a task
added for Northwind lands there.

## Done when

- The tests above pass three runs in a row locally and in CI.
- On staging, with a Personal-only account and with Northwind, the bar, the floating bar and the phone sheet match
  K-QuickAdd light and dark.
- The design deviations register drops its 13 Next line for Quick Add.
