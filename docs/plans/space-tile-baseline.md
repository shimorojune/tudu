# Personal and All spaces tiles sit 2px low next to the space name

Status: approved by Rohit 26 Oct 2026 (canvas step skipped: no visual change to draw; the fix makes the app match what the
canvas already intends; before/after measurements below instead). Implemented.

## The bug

Reported on staging (26 Oct 2026, item 4): in the All spaces filter chip ("Personal ×") and in a row's byline pill
("Personal · ME-3"), the small space tile sits visibly lower than the name beside it.

Measured from Rohit's screenshots: the tile's centre is ~1.5px below the centre of the name's capitals, and ~1px below
the chip's own centre. It is not the Geist font-rendering difference between Rohit's browser and headless Chromium.
It reproduces in headless Chromium too, and only for some tiles:

| Tile (14px chip tile)    | baseline to tile centre, intended | measured today         |
| ------------------------ | --------------------------------- | ---------------------- |
| A team space (initials)  | 4.44px                            | 4.44px                 |
| Personal (person icon)   | 4.44px                            | **2.44px** (2px low)   |
| All spaces (layers icon) | 4.44px                            | about 1.44px (3px low) |

The 13px byline tile (`.tp-sg-tile`) has the same offsets.

## Why

The small tiles sit inside the name's text line and hang off its baseline:
`vertical-align: calc(12.5px * .355 - <half the tile>)` (`.tp-chip-tile`, `.tp-sg-tile` in
`packages/ui/src/styles/components.css`). That formula assumes the tile's baseline is its bottom edge.

`.tp-stile` is `inline-flex`. An inline flex box takes its baseline from its first item, and an item with no text
baseline (an SVG) gives its own bottom edge. For team tiles the item is the initials SVG at 100% height, so the
baseline is the tile's bottom and the formula holds. For Personal and All spaces the item is a smaller icon centred
in the tile (10px in 14px, or 8px in 14px), so the "baseline" is the icon's bottom edge, 2px or 3px above the tile's
bottom. The tile drops by that gap.

## The change

One CSS rule, in `packages/ui/src/styles/components.css` next to `.tp-stile`:

```css
/* A tile's icon fills its height, so the tile's baseline is always its bottom edge (an inline flex box takes its
   baseline from the first item's bottom) and the small tiles hang off the text baseline like the initials do. The
   drawing stays the same size: the viewBox scales by width and centres. */
.tp-stile > svg {
  height: 100%;
}
```

The icon looks the same: Lucide SVGs keep their width, the 24x24 viewBox is scaled by the width and centred
vertically (default `preserveAspectRatio`), so the person and layers glyphs are drawn at the same size and position
inside the tile. Bigger tiles (rail, switcher, settings) are flex-centred in their rows, so their baseline is not
used and nothing moves there.

The same rule goes into the Tudu Paper design system (`bundle.css`) and the canvas copy of the bundle, so the canvas,
DS and app stay identical. No component, prop or token changes. No motion changes.

Who sees a difference: every Personal or All spaces tile that sits in a line of text: the All spaces filter chip,
byline space pills in All spaces (Today, Week, Backlog, phone), in both themes.

## Tests

New and updated, all run on Rohit's Mac:

Unit (packages/ui, vitest):

- `SpaceTile.test.tsx` STB-U01: the personal and all tiles' icon SVG is a direct child of `.tp-stile` (guards the
  selector the rule relies on).

E2E (packages/e2e, Playwright, group all-spaces):

- STB-E01 chip: filter All spaces by Personal; the chip tile's centre is 4.44px (±0.5) above the label's text
  baseline (measured with a zero-size inline-block marker after the label), and equal (±0.25) to a team space chip's
  offset when filtered by a team space.
- STB-E02 byline: in All spaces with a Personal task and a team task, each row's byline tile centre sits at the same
  offset (±0.5) from its name's baseline; Personal and team rows match each other (±0.25).
- STB-E03 dark: STB-E01 in the dark theme (the inset border must not change the box).
- Existing all-spaces e2e (C21-E01..E21) and SpaceTile/Chip/TaskRow unit tests rerun unchanged.

Manual check on Rohit's Mac (staging after merge): the chip in the screenshot and a Personal byline pill, light and
dark, at 100% and 200% zoom.
