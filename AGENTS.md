# Working on Tudu

Read [docs/rewrite/plan.md](docs/rewrite/plan.md) first. The design canvas and the Tudu Paper design system are the
source of truth for how anything looks or moves; never invent a look.

## Rules

- No em dash anywhere. No `rounded-*` Tailwind classes in components: radius comes from the theme. `pnpm lint:copy` checks both.
- Components keep the design system's markup and `tp-*` classes from `packages/ui/src/styles/components.css`.
  Radix underneath for focus, keyboard and screen readers. Red is never a button fill.
- Dates are ISO day strings; the logic lives in `packages/core`. No time zones in the UI.
- Every change ships with tests. A test's title starts with its case id (`C02-U07`), and the case is listed in
  `docs/tests/<chunk>.md`. End-to-end tests make their own user and data and never depend on another test.
- Where the build departs from the canvas, the app wins: add the line to the register in
  [docs/rewrite/design-deviations.md](docs/rewrite/design-deviations.md) and a block to its history in the same PR,
  and redraw the canvas to match before the chunk is called done.
- Run `pnpm verify` before finishing. Run the chunk's end-to-end group three times before calling it stable.
- Write for the person: short sentences, sentence case, no exclamation marks, no emoji. The app says "you", never "we".
