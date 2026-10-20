# Chunk 00 · Foundations

Status: approved 20 Oct 2026, in progress on branch `rewrite/00-foundations`.

Boards: 00 Colour & type, 00 shadcn + Tailwind theme, 00 Type, radius, shadows, motion, 00 Components, 00 Motion, 00 Layout, Logo final.

## Scope

- Wipe `master` and scaffold the monorepo from the plan: pnpm, TypeScript strict, ESLint, Prettier, copy lint (no em dash, no `rounded-*`), Vitest, Playwright, the CI workflows and the Dokploy runner image.
- Theme: `paper-theme.css` from the design system, the four fonts self-hosted, light and dark on `html`, System follows the OS, the 280ms cross-fade on change.
- Tokens: the design system's `tokens.json` checked in; a test guards that every token has a CSS variable in both themes.
- Primitives ported from Tudu Paper, one React component each, matching its README and board: Desk, Sheet, SheetBody, DayTitle, Button, IconButton, Checkbox (ink tick, draw and sparkle), Tag, Chip, Segmented, Field, Switch, Menu, Tooltip, Toast, Banner, Skeleton, EmptyState, Icon, Logo, Avatar, Dialog, ConfirmDialog, Drawer, MiniCalendar.
- Motion: the duration and easing tokens, press tint with no transform, the sparkle, strike-fade, grain, pop ease-out.
- Date logic in `packages/core`: relative day labels, due distance, ISO weeks starting Monday, all on date strings.
- The kit page at `/kit` in the web app: every primitive in every state, light and dark side by side, with a Play button on each motion. It ships in every build (it is not linked from the app) so staging can show it for review.

Out of scope: TaskRow, TaskList, DayHeader and the shell (chunk 01 and 02), any API.

## Test plan

Unit, `packages/ui` and `packages/core`:

| ID      | Component                                     | Case                                                                                            |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C00-U01 | tokens                                        | Every key in tokens.json has a variable in paper-theme.css for light and for dark               |
| C00-U02 | theme                                         | Light, Dark and System resolve to the right class; System follows a media-query change          |
| C00-U03 | theme                                         | Changing theme adds the cross-fade class and removes it after 280ms; the choice survives reload |
| C00-U04 | copy lint                                     | Source with an em dash or a `rounded-*` class fails the lint                                    |
| C00-U05 | Button                                        | Default is ink, secondary, ghost and destructive render their variants                          |
| C00-U06 | Button                                        | Pressing changes colour only: no transform, no font-weight change                               |
| C00-U07 | Button                                        | Loading shows the spinner and the label, is disabled, keeps its width                           |
| C00-U08 | Button                                        | Disabled is not clickable and announces disabled                                                |
| C00-U09 | IconButton                                    | Needs an aria-label; shows the press wash                                                       |
| C00-U10 | Checkbox                                      | Click and Space toggle; aria-checked follows                                                    |
| C00-U11 | Checkbox                                      | Checking plays the tick draw and one sparkle; unchecking plays neither                          |
| C00-U12 | Checkbox                                      | Works controlled and uncontrolled                                                               |
| C00-U13 | Checkbox                                      | 19px box, 44px hit area                                                                         |
| C00-U14 | Tooltip                                       | Opens after 380ms of hover, not before; closes on leave; opens on focus; honours side           |
| C00-U15 | Dialog                                        | Opens, traps focus, Esc and veil click close it, focus returns to the trigger                   |
| C00-U16 | ConfirmDialog                                 | The ink button carries the action's name; Cancel closes without calling confirm                 |
| C00-U17 | ConfirmDialog                                 | Type-to-confirm enables the button only when the text matches exactly                           |
| C00-U18 | Menu                                          | Arrow keys move, Enter picks, Esc closes, click outside closes                                  |
| C00-U19 | Menu                                          | Opens upward when there is no room below                                                        |
| C00-U20 | Segmented                                     | Click and arrow keys change the value; the active item keeps its font weight                    |
| C00-U21 | Field                                         | Focus shows the ink edge; error shows the red edge, the message and aria-invalid                |
| C00-U22 | Field                                         | Long values end in an ellipsis                                                                  |
| C00-U23 | Switch                                        | Toggles by click and keyboard                                                                   |
| C00-U24 | Toast                                         | Shows, Undo calls its handler, dismisses after 4500ms                                           |
| C00-U25 | Banner                                        | Icon on the first line, grows into place, dismisses                                             |
| C00-U26 | MiniCalendar                                  | Shows the month, marks today, shows counts per day                                              |
| C00-U27 | MiniCalendar                                  | Previous and next month; keyboard arrows move the focus day                                     |
| C00-U28 | MiniCalendar                                  | Picking a day calls onPick with the ISO date                                                    |
| C00-U29 | MiniCalendar                                  | Hovering a day says "tomorrow", "in 4 days" or "2 days ago"                                     |
| C00-U30 | Chip                                          | Changing the label eases the width; clear calls onClear                                         |
| C00-U31 | Tag, Avatar, Skeleton, EmptyState, Logo, Icon | Render with their props; Avatar falls back to initials; Logo switches with theme                |
| C00-U32 | Drawer                                        | Opens from the side, modeless has no veil, modal has one                                        |
| C00-U33 | Sheet                                         | Only the sheet body scrolls; the header stays put                                               |
| C00-U34 | dates                                         | Today, Tomorrow, Yesterday, In N days, N days ago, from two date strings                        |
| C00-U35 | dates                                         | Due distance: in 4 days, tomorrow, today, 2 days overdue                                        |
| C00-U36 | dates                                         | ISO week number and Monday-to-Sunday range, including the year boundary                         |

End-to-end, group `kit`:

| ID      | Case                                                                                  |
| ------- | ------------------------------------------------------------------------------------- |
| C00-E01 | The kit page loads in light with no console errors                                    |
| C00-E02 | The kit page loads in dark with no console errors                                     |
| C00-E03 | At phone width the kit page has no horizontal scroll                                  |
| C00-E04 | A menu opened near the bottom of the window opens upward (the layout half of C00-U19) |
| C00-E05 | Picking Dark in the theme switch paints dark and survives a reload                    |

Not automated: whether the motion feels right. You judge that on the kit page.

## Done when

- Every test above passes three runs in a row, locally and on the Dokploy runner.
- The kit page matches the 00 boards in light and dark at 1440, 834 and 390.
- `docs/tests/STATUS.md` shows chunk 00 green.
