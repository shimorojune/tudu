# The version at the foot of Settings, linked to its release

Status: approved by Rohit 24 Oct 2026; implemented. Canvas: approved 24 Oct 2026 (board `G-Version` on the Settings & theme
page of the canvas, v55): Settings only, not the app sidebar.

## What Rohit asked for

Somewhere that shows which Tudu is running. Clicking it opens that version's release on GitHub: the
`tudu-<version>` tag for a release, the rolling `staging` release for a staging build. A staging build must say so,
quietly.

## What's drawn

One quiet line at the foot of Settings' list, in every layout (the dialog on the desk, the slimmer list on tablets, the
list page on phones), light and dark:

- `Tudu 0.37.0`: the name at 12px, the number in mono at 11px, both muted. On hover or keyboard focus the row takes
  the list's hover fill and a small up-right arrow fades in and slides 2px into place (220ms, the arrive ease). Less
  motion: the arrow only fades. On phones the line is centred, 44px tall, with the arrow always showing.
- A staging build puts a 6px amber dot (the `--warning` token) before the name, and the row's tooltip reads
  "Staging build · opens its release on GitHub". A long staging version truncates with "…" on the tablet list.
- A local dev build shows the version as plain text, not a link.

## Where each build gets its name, version and track

| Build              | Shows                                 | Opens                                                          |
| ------------------ | ------------------------------------- | -------------------------------------------------------------- |
| Web, production    | `Tudu 0.37.0`                         | `https://github.com/shimorojune/tudu/releases/tag/tudu-0.37.0` |
| Web, staging       | dot `Tudu 0.37.1-staging+3f9c2ab`     | `https://github.com/shimorojune/tudu/releases#release-staging` |
| Mac, Tudu          | `Tudu 0.37.0`                         | the tag, in the default browser                                |
| Mac, Tudu Staging  | dot `Tudu Staging 0.37.1-staging.132` | `#release-staging`, in the default browser                     |
| Mac, Tudu Test     | `Tudu Test <version>`                 | nothing (plain text; it is never released)                     |
| Local dev (`vite`) | `Tudu 0.37.0-dev`                     | nothing (plain text)                                           |

- **Mac app:** the bridge's `info()` already answers `{ track, name, version }`. Use it whenever the bridge is there,
  so the Mac app shows its own version (what the updater moves), not the web bundle's.
- **Web:** today `vite.config.ts` defines only `VITE_TUDU_VERSION` from the root `package.json`, so staging reports
  `0.37.0` though it runs master. The fix:
  - `apps/web/Dockerfile` takes two more build args, `VITE_TUDU_TRACK` and `VITE_TUDU_VERSION` (an override; without it
    the root `package.json` version is used, as now).
  - `.github/workflows/deploy-staging.yml` computes the version the way `desktop-staging.yml` does (next patch after the
    latest `tudu-*` tag) plus the short commit: `0.37.1-staging+<sha7>`, and passes `VITE_TUDU_TRACK=staging`.
    The run number is not reused because it belongs to another workflow; the commit says exactly what is deployed.
  - `.github/workflows/release.yml` passes `VITE_TUDU_TRACK=production` to the production web image.
  - With no track set: `vite` (dev server) is `dev`, `vite build` is `production`. CI's e2e build is therefore
    production-shaped, which is what the tests below expect.
- **The link** is one pure function in `@tudu/core` next to `versions.ts`:
  `releaseUrl(track, version)` returns the tag URL for `production`, `#release-staging` for `staging`, and `null` for
  `test` and `dev`.

## Code changes

1. `packages/core/src/versions.ts`: `releaseUrl()` and a `Track` that also allows `'dev'` for this purpose (the
   existing `TRACKS` table stays the three app tracks).
2. `packages/ui`: a new `VersionLink` component (`name`, `version`, `track`, `href`), and `Settings` gets an optional
   `version` prop it draws at the foot of the list in `dialog`, `page` and `phone` layouts. A new `external` icon (the
   arrow) joins `lib/icons.tsx`. CSS in `components.css` per the canvas, with the less-motion rule in `less-motion.css`.
3. `apps/web/src/app/version.ts`: `useAppVersion()` returns `{ name, version, track, href }`: from `useAppInfo()` in
   the Mac app, else from the build constants. `feedback.tsx`'s `APP_VERSION` moves here so there is one source.
4. `apps/web/src/app/settings.tsx` passes it to `Settings`. In the Mac app the link already goes through
   `interceptLinks` to the default browser; on the web it is `target="_blank" rel="noopener"`.
5. Build: `vite.config.ts`, `apps/web/Dockerfile`, `deploy-staging.yml`, `release.yml` as above.
6. Design system and canvas: rebuild the Tudu Paper bundle from `packages/ui` with the new component and prop,
   document `VersionLink` and the `version` prop in the DS README, and pass `version` in every Settings board on the
   canvas (`G-B-Dialog`, `G-Desktop-Dark`, `G-B-Members`, `G-Tablet`, `G-Phone`, `G-Phone-Theme`, `G-Phone-Dark`,
   `G-Confirm`, `G-States`, `G-States-Dark`, and the Settings view in `K-Proto`), so they all show the row.

## Tests

Unit (Vitest):

| Id      | Where                                          | Scenario                                                                                                                                                                                                                      |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C09-U10 | `packages/core/src/versions.test.ts`           | `releaseUrl('production', '0.37.0')` is the `tudu-0.37.0` tag URL; `releaseUrl('staging', '0.37.1-staging.132')` and `('staging', '0.37.1-staging+3f9c2ab')` are `…/releases#release-staging`; `test` and `dev` give `null`.  |
| C09-U11 | `packages/ui/src/components/Settings.test.tsx` | With `version` for production, the list ends with a link named "Tudu 0.37.0, open its release on GitHub" whose `href` is the tag, `target="_blank"`; there is no staging dot.                                                 |
| C09-U12 | `packages/ui/src/components/Settings.test.tsx` | Staging: the dot is present, the accessible name says "a staging build", the tooltip text is "Staging build · opens its release on GitHub", `href` is `#release-staging`.                                                     |
| C09-U13 | `packages/ui/src/components/Settings.test.tsx` | No `href` (dev, test): the version renders as plain text, not a link, and is not focusable. No `version` prop: nothing renders (the kit and older callers stay as they are).                                                  |
| C09-U14 | `packages/ui/src/components/Settings.test.tsx` | Phone layout: the row renders under the list on the list view, and not on a section view.                                                                                                                                     |
| C11-U10 | `apps/web/src/app/desktop.test.tsx`            | `useAppVersion()` with the fake bridge answering `{ track: 'staging', name: 'Tudu Staging', version: '0.37.1-staging.132' }` returns that name, version and the staging URL; without a bridge it returns the build constants. |

End-to-end (Playwright; desktop at 1440x900 unless said):

| Id      | Where                                          | Scenario                                                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C09-E14 | `packages/e2e/tests/settings/settings.spec.ts` | Open Settings from the avatar menu: the foot of the list reads "Tudu" and the root `package.json` version; the link's `href` is that version's tag URL and it opens in a new tab (assert the popup's URL, then close it). Same on tablet and phone (phone: More › Settings, the line under the list). |
| C09-E15 | `packages/e2e/tests/settings/settings.spec.ts` | Hover the row: the arrow becomes visible (opacity 1 after the transition). Tab to it: it takes focus and shows the focus ring. With reduced motion emulated, the arrow has no transform transition.                                                                                                   |
| C09-E16 | `packages/e2e/tests/settings/settings.spec.ts` | Dark theme: the row is visible with the dark tokens (its text colour equals `--muted-foreground` in dark).                                                                                                                                                                                            |
| C11-E10 | `packages/e2e/tests/desktop/desktop.spec.ts`   | With the desktop fake set to `{ track: 'staging', name: 'Tudu Staging', version: '0.37.1-staging.132' }`: the row reads "Tudu Staging 0.37.1-staging.132" with the staging dot; clicking it calls the bridge's `openExternal` with `…/releases#release-staging` and opens no tab.                     |
| C11-E11 | `packages/e2e/tests/desktop/desktop.spec.ts`   | Fake with `track: 'test'`: plain text, no link, no dot.                                                                                                                                                                                                                                               |
| C11-D13 | `packages/e2e/mac/tests/desktop.spec.ts`       | The real Tudu Test app: Settings shows "Tudu Test" and the app's own version (from `tauri.conf.json` for the build), as plain text.                                                                                                                                                                   |

Not automated, checked once after merge: staging.tudu.ezdev.net shows `0.37.1-staging+<the merged commit>` with the dot
and opens the staging release; the next production release shows `Tudu <version>` linked to its tag.

Existing cases to re-run, unchanged: all of `settings.spec.ts` (C09-E01 to C09-E13), the feedback tests that read the
app version (`feedback.test.tsx`, `feedback.spec.ts`), and `desktop.spec.ts`.

## Out of scope

The app sidebar and the menu bar sheet don't show the version (Rohit, 24 Oct 2026). The macOS "About Tudu" window is
unchanged.
