# Chunk 00 · Foundations · test cases

Status column is kept by `pnpm test:status` in [STATUS.md](STATUS.md). Run this chunk's tests with
`pnpm test -- --project ui --project core` and `pnpm e2e kit`.

## Unit (`packages/ui`, `packages/core`)

| ID      | What it checks                  | Scenario                                                                                                                                                   |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C00-U01 | Tokens and theme agree          | Every colour token in tokens.json has a variable in paper-theme.css for light and for dark; radius, duration, easing and shadow tokens have a variable too |
| C00-U02 | Theme resolves                  | Light, Dark and System set the `dark` class and colour-scheme; System follows a change of the OS setting                                                   |
| C00-U03 | Theme change is soft and sticks | Changing adds the cross-fade class and removes it when the transition ends; the choice is in localStorage                                                  |
| C00-U04 | Copy lint                       | A line with an em dash, or a `rounded-*` class in a component, fails the lint                                                                              |
| C00-U05 | Button variants                 | primary (ink), secondary, quiet and danger render their classes                                                                                            |
| C00-U06 | Pressing never moves            | The stylesheet's press rules change colour only: no transform, no font-weight                                                                              |
| C00-U07 | Button loading                  | Shows the spinner and the loading label, is busy, ignores clicks, keeps its width                                                                          |
| C00-U08 | Button disabled                 | Not clickable, announced as disabled                                                                                                                       |
| C00-U09 | IconButton                      | Has an accessible name from its label and the press wash class                                                                                             |
| C00-U10 | Checkbox toggles                | Click and Space toggle; aria-checked follows                                                                                                               |
| C00-U11 | Checkbox sparkle                | Checking plays the tick draw and one sparkle; unchecking plays neither                                                                                     |
| C00-U12 | Checkbox controlled             | Works controlled and uncontrolled                                                                                                                          |
| C00-U13 | Checkbox size                   | 19px box, 44px hit area (stylesheet)                                                                                                                       |
| C00-U14 | Tooltip timing                  | Opens after 380ms of hover, not before; closes on leave; opens on keyboard focus; honours side                                                             |
| C00-U15 | Dialog                          | Opens, traps focus, Esc and veil click close it, focus returns; Esc in a field leaves the field first                                                      |
| C00-U16 | ConfirmDialog                   | The ink button carries the action's name; Cancel closes without confirming                                                                                 |
| C00-U17 | Type to confirm                 | The button is off until the text matches exactly; then the action runs and "Done" shows                                                                    |
| C00-U18 | Menu keyboard                   | Arrow keys move, Enter picks, Esc closes, click outside closes                                                                                             |
| C00-U19 | Menu near the bottom            | Opens upward when there is no room below (also C00-E04)                                                                                                    |
| C00-U20 | Segmented                       | Click and arrow keys change the value; the active item keeps its font weight                                                                               |
| C00-U21 | Field states                    | Focus is the ink edge; error shows the red edge, the message and aria-invalid                                                                              |
| C00-U22 | Field ellipsis                  | Long values end in an ellipsis (stylesheet)                                                                                                                |
| C00-U23 | Switch                          | Toggles by click and keyboard                                                                                                                              |
| C00-U24 | Toast                           | Shows, Undo calls its handler, leaves after 4500ms with an action and 1800ms without; a new one replaces the old                                           |
| C00-U25 | Banner                          | Icon on the first line, title in bold, actions, Dismiss; grows into place                                                                                  |
| C00-U26 | Calendar month                  | Shows the month, Monday first, marks today, counts per day                                                                                                 |
| C00-U27 | Calendar navigation             | Previous and next month; arrow keys move the focused day                                                                                                   |
| C00-U28 | Calendar pick                   | Picking a day calls onPick with the ISO date                                                                                                               |
| C00-U29 | Calendar hint                   | Hovering a day says "tomorrow", "in 4 days" or "2 days overdue" in the right tone                                                                          |
| C00-U30 | Chip                            | Changing the label eases the width; the clear button calls onClear                                                                                         |
| C00-U31 | Small parts                     | Tag, Avatar, Skeleton, EmptyState, Logo and Icon render with their props                                                                                   |
| C00-U32 | Drawer                          | Modal has a veil and traps Esc; modeless has none and only closes from inside; fullscreen is the phone page                                                |
| C00-U33 | Sheet                           | Only the sheet body scrolls; it marks itself once scrolled                                                                                                 |
| C00-U34 | Relative days                   | Today, Tomorrow, Yesterday, In N days, N days ago                                                                                                          |
| C00-U35 | Due distance                    | in 4 days, tomorrow, today, 2 days overdue, weeks from two weeks out                                                                                       |
| C00-U36 | ISO weeks                       | Week numbers and the Monday to Sunday range, including the year boundary                                                                                   |

## End-to-end (`packages/e2e/tests/kit`, group `kit`)

| ID      | What it checks      | Scenario                                                           |
| ------- | ------------------- | ------------------------------------------------------------------ |
| C00-E01 | Kit in light        | The page loads in light with every section and no console errors   |
| C00-E02 | Kit in dark         | The page loads in dark, the window is painted the dark desk colour |
| C00-E03 | Phone width         | No horizontal scroll at 390px                                      |
| C00-E04 | Menu flips          | A menu opened near the bottom of the window opens upward           |
| C00-E05 | Theme is remembered | Picking Dark paints dark, survives a reload                        |
