# Step 1: Foundations

Status: Done
Depends on: nothing
Blocks: every other step

## Read this first

You are working in a pnpm monorepo at `/Users/rraj/Documents/work/tudu`.

- `apps/desktop` is a Tauri 2 shell, Vite on port 1420.
- `apps/web` is a browser shell, Vite on port 5173.
- `apps/server` is a Hono API on port 3456.
- `packages/ui` holds all shared React UI. Both apps import it. This is where almost
  all of your work happens.
- `packages/store` holds Redux Toolkit and RTK Query.
- `packages/shared` holds types shared between client and server.
- `packages/db` holds the Drizzle schema.

Both apps alias `@` to `packages/ui/src` and `@assets` to `packages/ui/assets`.

### Rules you will break if you are not careful

1. **No em-dash characters (U+2014) anywhere.** `pnpm lint:copy` greps the entire
   working tree and fails the build if it finds one. This applies to TSX copy, code
   comments and markdown. Use a hyphen or restructure the sentence.
2. TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`. An unused import
   fails `pnpm build`.
3. `verbatimModuleSyntax` is on. Type only imports must use `import type { Foo }`.
4. Radius is `0` everywhere by design. Never add `rounded-*` classes.
5. Cross package imports inside `packages/store` use explicit `.js` extensions
   (see `packages/store/src/index.ts`). Keep that convention in that package.
   `packages/ui` does not use extensions. Match the file you are editing.

## Goal

After this step, running `pnpm dev` gives you the real Tudu top navigation bar from
screen A1 of the design, with four empty routes behind it, a working light and dark
theme toggle, and every library later steps need already installed.

## Non goals

Do not build any of these in this step. They belong to later steps.

- Task lists, buckets, task rows, the JIRA column, the detail inspector.
- Any database table beyond the existing `users`.
- Any new server route.
- Drag and drop behaviour. The library gets installed, nothing uses it yet.
- The macOS title bar with traffic lights. The mockup draws that to show context.
  In the real app the operating system draws it. Do not build it.

## Design reference

Open `/Users/rraj/Documents/work/tudu_designs/Tudu.dc.html` in a browser. The screen
you are matching is labelled `A1 Today`. Only the top bar is in scope, which is the
element at roughly lines 59 to 90 of that file.

Exact values read from the mockup, and their mapping to existing theme tokens:

| Mockup token | Value | Theme equivalent |
|---|---|---|
| `--bg` | `#f4f3f2` | `--background` (`#f3f2f2`, close enough, do not change) |
| `--panel` | `#fdfcfb` | `--card` |
| `--side` | `#eceae8` | `--sidebar` |
| `--ink` | `#201e1d` | `--foreground` |
| `--acc` | `#ec3013` | `--primary` |
| `--muted` | `rgba(32,30,29,.56)` | `--muted-foreground` |
| `--rule` | `rgba(32,30,29,.22)` | missing, you add it in task 3 |
| `--hair` | `rgba(32,30,29,.1)` | missing, you add it in task 3 |
| `--ghost` | `rgba(32,30,29,.2)` | missing, you add it in task 3 |
| `--faint` | `rgba(32,30,29,.34)` | missing, you add it in task 3 |

---

## Task 1: Install dependencies

Install everything the roadmap needs now, in one pass, so later steps do not keep
churning `package.json` and the lockfile.

Run from the repo root.

```bash
cd /Users/rraj/Documents/work/tudu

# Router, panes, drag and drop, palette, dates, forms, toasts.
pnpm --filter @tudu/ui add \
  @tanstack/react-router@^1.170.0 \
  react-resizable-panels@^4.12.0 \
  @dnd-kit/core@^6.3.1 \
  @dnd-kit/sortable@^10.0.0 \
  @dnd-kit/modifiers@^9.0.0 \
  @dnd-kit/utilities@^3.2.2 \
  cmdk@^1.1.1 \
  date-fns@^4.4.0 \
  react-hook-form@^7.87.0 \
  @hookform/resolvers@^5.2.0 \
  sonner@^2.0.8

# Zod is shared between client and server, so it goes in the shared package too.
pnpm --filter @tudu/shared add zod@^4.5.0
pnpm --filter @tudu/ui add zod@^4.5.0

# Test tooling at the root.
pnpm add -Dw \
  vitest@^5.0.0 \
  @vitest/coverage-v8@^5.0.0 \
  jsdom@^28.0.0 \
  @testing-library/react@^17.0.0 \
  @testing-library/dom@^11.0.0 \
  @testing-library/jest-dom@^7.0.0 \
  @testing-library/user-event@^15.0.0
```

Do **not** pre-install `react-day-picker` or any `@radix-ui/*` package. The shadcn CLI
in task 2 installs the exact versions its component code expects. Installing them by
hand first is the most common way this task goes wrong.

### Why each library

State this in the PR description if asked.

- `@tanstack/react-router`: type safe routing. Chosen over React Router because route
  params and search params are typed end to end, which matters once the Week view
  starts putting an ISO week in the URL.
- `react-resizable-panels`: the three pane Today screen has draggable dividers. This is
  the library shadcn's own Resizable component wraps, so the styling story is solved.
- `@dnd-kit`: reordering inside a bucket and dragging across buckets are different
  operations on the same drag. dnd-kit models that with sortable contexts inside a
  single DndContext. It is also keyboard accessible out of the box, which
  `react-beautiful-dnd` no longer maintains and HTML5 drag and drop cannot do.
- `cmdk`: Cmd K commands and the Cmd L JIRA link palette are the same widget.
- `date-fns`: the Week grid needs real ISO week maths. Tree shakes, unlike moment.
- `react-hook-form` plus `zod`: settings has roughly forty controls. The zod schemas get
  reused unchanged as server request validators.
- `sonner`: toasts, and it is what shadcn ships.

### Verify

```bash
pnpm install
pnpm --filter @tudu/ui exec tsc --noEmit
```

Both must exit 0.

---

## Task 2: Add the missing shadcn components

`packages/ui/components.json` is already configured: new-york style, neutral base,
CSS variables on, lucide icons, components land in `src/components/ui`.

Already present, do not re-add: `badge`, `button`, `card`, `checkbox`, `dialog`,
`input`, `label`, `scroll-area`, `separator`, `skeleton`.

Run from inside `packages/ui`:

```bash
cd /Users/rraj/Documents/work/tudu/packages/ui

pnpm dlx shadcn@latest add \
  tabs popover dropdown-menu switch toggle-group toggle avatar textarea \
  tooltip sheet select table alert alert-dialog command resizable \
  calendar sonner \
  --yes --overwrite
```

If the CLI prompts about a Tailwind config path, accept the empty value. Tailwind v4
has no JS config and `components.json` already reflects that.

### After the CLI runs

1. Open every file the CLI created under `packages/ui/src/components/ui/`.
2. Delete any `rounded-*` class it added. The Modernist system has zero radius, and the
   shadcn defaults will have sprinkled `rounded-md` and `rounded-lg` around. Leave
   `rounded-full` on `avatar` alone only if you agree it reads correctly; the design
   uses square avatars with initials, so prefer removing it there too.
3. Confirm the CLI added the Radix packages to `packages/ui/package.json` dependencies
   rather than the root.

### A note on the segmented control

The design uses a segmented control in three places: the Yest / Tdy / Tmr day jump, the
bucket picker in the detail pane, and several settings rows. `toggle-group` with
`type="single"` is the right primitive. You will wrap it in task 7.

### Verify

```bash
cd /Users/rraj/Documents/work/tudu
pnpm --filter @tudu/ui exec tsc --noEmit
rg -n 'rounded-(sm|md|lg|xl|2xl|3xl)' packages/ui/src/components/ui
```

The `tsc` run must exit 0. The `rg` run must return nothing.

---

## Task 3: Extend the theme tokens

The mockup uses four ink tints that have no equivalent in `theme.css`. Add them so
components can say `border-rule` instead of hard coding an rgba value.

Edit `/Users/rraj/Documents/work/tudu/packages/ui/assets/theme.css`.

### 3a. Add to the `:root` block

Insert after the `--ring: #ec3013;` line, before `--radius: 0rem;`:

```css
    /* Ink tints from the design canvas. Ordered lightest to strongest.
       hair: the quietest separator. ghost: idle grip dots and disabled marks.
       faint: de-emphasised meta text. rule: the standard 1px divider. */
    --hair: rgba(32, 30, 29, 0.1);
    --ghost: rgba(32, 30, 29, 0.2);
    --rule: rgba(32, 30, 29, 0.22);
    --faint: rgba(32, 30, 29, 0.34);
```

### 3b. Add to the `.dark` block

Insert after the `--ring: #ff563c;` line:

```css
    --hair: rgba(240, 237, 232, 0.1);
    --ghost: rgba(240, 237, 232, 0.2);
    --rule: rgba(240, 237, 232, 0.22);
    --faint: rgba(240, 237, 232, 0.34);
```

### 3c. Expose them to Tailwind

Inside the existing `@theme inline { ... }` block, add after `--color-ring: var(--ring);`:

```css
  --color-hair: var(--hair);
  --color-ghost: var(--ghost);
  --color-rule: var(--rule);
  --color-faint: var(--faint);
```

This makes `border-rule`, `bg-hair`, `text-faint` and `border-ghost` valid utilities.

### Verify

Nothing to run yet. Task 7 consumes these. If Tailwind does not pick them up there, the
`@theme inline` entry is missing or misspelled.

---

## Task 4: Delete dead CSS

`packages/ui/src/index.css` currently carries roughly 230 lines of animation CSS for a
mochi character, a wizard notification avatar and a splash screen. No React component in
the repo references any of it. It is left over from an abandoned design pass and it
contradicts the Modernist direction.

Delete from `/Users/rraj/Documents/work/tudu/packages/ui/src/index.css`:

- The `.avatar-body` rule.
- Everything from `@keyframes mochi-float` to the end of the file.

The file should end after the `html, body, #root { min-height: 100%; }` rule.

### Verify

```bash
cd /Users/rraj/Documents/work/tudu
rg -n 'mochi|wizard|splash' packages apps --glob '!node_modules'
```

Must return nothing. If it returns hits in `.tsx` files, stop and report it: a component
does use them and this plan was wrong.

---

## Task 5: Theme provider with light, dark and system

Screen C1 offers Light, Dark and System. Build the mechanism now, the settings UI comes
in step 11.

### 5a. Create `packages/ui/src/lib/theme.ts`

```ts
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tudu.theme";

export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

export function writeStoredTheme(preference: ThemePreference) {
  window.localStorage.setItem(STORAGE_KEY, preference);
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}
```

### 5b. Create `packages/ui/src/providers/ThemeProvider.tsx`

```tsx
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredTheme(),
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredTheme()),
  );

  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    applyTheme(next);
  }, [preference]);

  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {
      const next = resolveTheme("system");
      setResolved(next);
      applyTheme(next);
    };

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredTheme(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
```

### 5c. Create `packages/ui/src/hooks/useTheme.ts`

The `packages/ui/src/hooks/` directory does not exist yet. `components.json` already
declares the `@/hooks` alias, so create the directory.

```ts
import { useContext } from "react";
import { ThemeContext } from "@/providers/ThemeProvider";

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
```

### 5d. Avoid the flash of light theme

Add this to the `<head>` of **both** `apps/desktop/index.html` and
`apps/web/index.html`, immediately before the closing `</head>`:

```html
    <script>
      (function () {
        try {
          var stored = localStorage.getItem("tudu.theme") || "system";
          var dark =
            stored === "dark" ||
            (stored === "system" &&
              window.matchMedia("(prefers-color-scheme: dark)").matches);
          if (dark) {
            document.documentElement.classList.add("dark");
          }
          document.documentElement.style.colorScheme = dark ? "dark" : "light";
        } catch (e) {}
      })();
    </script>
```

### 5e. Wire it into `AppProviders`

Edit `packages/ui/src/providers/AppProviders.tsx`. Wrap the existing tree so the order
is `ClerkProvider > Provider > ThemeProvider > AuthTokenBridge`. Import `ThemeProvider`
from `./ThemeProvider`.

---

## Task 6: Router

Use TanStack Router in **code based** mode, not file based. The file based generator
runs as a Vite plugin, and routes live in `packages/ui` which is consumed by two
separate Vite apps. Wiring the generator into both is fragile. A hand written route tree
in `packages/ui` is imported by both shells with zero build config.

Use the default browser history. Do not use hash history: Clerk's `<SignIn>` uses hash
routing and the two would fight. The router is only mounted inside `<SignedIn>`, so
there is no overlap.

### 6a. Create the route components

Create `packages/ui/src/routes/RootLayout.tsx`:

```tsx
import { Outlet } from "@tanstack/react-router";
import { TopNav } from "@/components/chrome/TopNav";

export function RootLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopNav />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
```

Create `packages/ui/src/components/PagePlaceholder.tsx`:

```tsx
type PagePlaceholderProps = {
  title: string;
  note: string;
};

export function PagePlaceholder({ title, note }: PagePlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 px-[22px]">
      <h1 className="text-[28px] tracking-tight">{title}</h1>
      <p className="max-w-[520px] text-[14.5px] leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
```

Create one file per route in `packages/ui/src/routes/`, each rendering
`PagePlaceholder`:

| File | Title | Note |
|---|---|---|
| `TodayRoute.tsx` | `Today` | `The three pane day view lands here in step 3.` |
| `WeekRoute.tsx` | `Week` | `The seven day grid lands here in step 7.` |
| `InboxRoute.tsx` | `Inbox` | `Tasks your manager sends land here in step 9.` |
| `TeamRoute.tsx` | `Team` | `Your reports and your own manager land here in step 9.` |
| `SettingsRoute.tsx` | `Settings` | `Five settings pages land here in step 11.` |

### 6b. Create `packages/ui/src/router.tsx`

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "@/routes/RootLayout";
import { TodayRoute } from "@/routes/TodayRoute";
import { WeekRoute } from "@/routes/WeekRoute";
import { InboxRoute } from "@/routes/InboxRoute";
import { TeamRoute } from "@/routes/TeamRoute";
import { SettingsRoute } from "@/routes/SettingsRoute";

const rootRoute = createRootRoute({ component: RootLayout });

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TodayRoute,
});

const weekRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/week",
  component: WeekRoute,
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxRoute,
});

const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/team",
  component: TeamRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  todayRoute,
  weekRoute,
  inboxRoute,
  teamRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

### 6c. Rewrite `packages/ui/src/App.tsx`

Replace the whole file. The health check display goes away: it was scaffolding.

```tsx
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { router } from "@/router";

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      <SignedIn>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </SignedIn>
    </>
  );
}
```

`useGetHealthQuery` stays exported from `@tudu/store`. It is now unused by the UI, which
is fine, but do not delete it: step 2 extends the same API slice.

---

## Task 7: The top navigation bar

This is the visible deliverable. Match screen A1 of the mockup.

### 7a. The brand mark

The mockup draws the mark inline rather than using the SVG assets, because the geometry
is tiny and exact. Do the same. Do not modify the existing
`packages/ui/src/components/TuduLogo.tsx`, it is unused and out of scope.

Create `packages/ui/src/components/chrome/BrandMark.tsx`:

```tsx
export function BrandMark() {
  return (
    <div className="flex items-center gap-[11px]">
      <div className="relative grid size-[23px] place-items-center bg-foreground">
        <span className="text-[14px] font-extrabold leading-none tracking-[-0.04em] text-card">
          T
        </span>
        <div className="absolute -bottom-[2px] -right-[2px] size-[6px] bg-primary" />
      </div>
      <span className="text-[16.5px] font-extrabold tracking-[-0.03em]">
        Tudu
      </span>
    </div>
  );
}
```

### 7b. The nav tabs

Create `packages/ui/src/components/chrome/NavTabs.tsx`.

Four tabs: Today at `/`, Week at `/week`, Inbox at `/inbox`, Team at `/team`. Use
TanStack Router's `<Link>` so the active state comes from the router, not local state.

Specification from the mockup:

- Container: `flex gap-[20px] self-stretch items-center`, font size `13.5px`.
- Each tab: `padding: 18px 1px`.
- Inactive tab: `text-muted-foreground`.
- Active tab: `font-bold`, plus an inset underline. Use
  `shadow-[inset_0_-2px_0_var(--foreground)]`, not a border, so the tab does not shift
  by two pixels when it becomes active.
- The Inbox tab renders a count badge to its right with `gap-[6px]`. Badge styling:
  `text-[11px] font-extrabold text-white bg-primary px-[5px] py-px tabular-nums`.
  Hard code the count to `2` for now with a `TODO` comment naming step 9. Hide the badge
  entirely when the count is `0`.

Use `<Link>` with the `activeProps` prop for the active styling. Note that the Today tab
at path `/` needs `activeOptions={{ exact: true }}`, otherwise it stays active on every
route.

### 7c. The date navigator and day jump

The selected day is application state, not local state, because step 3's task list and
step 7's week view both read it. Put it in Redux now.

Create `packages/store/src/slices/daySlice.ts`:

```ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayIso() {
  return isoDate(new Date());
}

type DayState = {
  selectedDate: string;
};

const initialState: DayState = {
  selectedDate: todayIso(),
};

export const daySlice = createSlice({
  name: "day",
  initialState,
  reducers: {
    setSelectedDate(state, action: PayloadAction<string>) {
      state.selectedDate = action.payload;
    },
    shiftSelectedDate(state, action: PayloadAction<number>) {
      const date = new Date(`${state.selectedDate}T12:00:00`);
      date.setDate(date.getDate() + action.payload);
      state.selectedDate = isoDate(date);
    },
    goToToday(state) {
      state.selectedDate = todayIso();
    },
  },
});

export const { setSelectedDate, shiftSelectedDate, goToToday } =
  daySlice.actions;
```

Do not use `toISOString().split("T")[0]` for this. It converts to UTC first, which puts
the user a day behind for the entire evening in every timezone east of Greenwich. The
existing helpers in `packages/ui/src/lib/utils.ts` have this bug. Leave them alone for
now, step 3 replaces them with `date-fns`.

Register the slice in `packages/store/src/store.ts` under the key `day`, and export
`daySlice`, its actions and `todayIso` from `packages/store/src/index.ts` using the
`.js` extension convention that file already uses.

Then create `packages/ui/src/components/chrome/DateNav.tsx`:

- A `ChevronLeft` lucide icon at 14px, stroke width 1.7, in `text-muted-foreground`,
  dispatching `shiftSelectedDate(-1)`.
- The date label: `text-[13.5px] font-semibold tabular-nums`, formatted as `EEE d MMM`
  with `date-fns` `format`, giving `Tue 1 Sep`.
- A `ChevronRight` icon, dispatching `shiftSelectedDate(1)`.
- Wrap the two chevrons in real `<button>` elements with `aria-label` of
  `Previous day` and `Next day`.

And `packages/ui/src/components/chrome/DayJump.tsx`:

- A three option segmented control: `Yest`, `Tdy`, `Tmr`.
- Built on the shadcn `ToggleGroup` with `type="single"`.
- Container: `flex items-stretch border border-rule bg-card text-[11.5px] font-bold leading-none`.
- Each option: `px-[9px] py-[6px] text-muted-foreground`.
- Selected option: `bg-foreground text-card`.
- Selection is derived from `selectedDate` compared against today, yesterday and
  tomorrow. When `selectedDate` is none of the three, no option is selected.
- Clicking an option dispatches `setSelectedDate` with the matching ISO date.

### 7d. Assemble `packages/ui/src/components/chrome/TopNav.tsx`

Structure, top to bottom of the JSX:

```
<header class="flex h-[56px] shrink-0 items-center gap-[28px] border-b border-rule bg-card px-[22px]">
  <BrandMark />
  <NavTabs />
  <div class="ml-auto flex items-center gap-[18px]">
    <DateNav />
    <DayJump />
    <div class="h-[20px] w-px bg-hair" />
    <NewTaskButton />
    <SettingsLink />
  </div>
</header>
```

`NewTaskButton`: a `<button>`, not the shadcn `Button`, because the design's flush left
label rule and exact padding fight the default variants. Styling:
`flex items-center gap-[7px] bg-primary px-[13px] py-[7px] text-[12.5px] font-bold text-primary-foreground`,
with a lucide `Plus` icon at 13px, stroke width 2.4, then the text `New task`. On click,
call `toast("New task lands in step 4")` from `sonner`. Add a `TODO` comment naming
step 4. Give it `aria-label="New task"`.

`SettingsLink`: a TanStack `<Link to="/settings">` wrapping a lucide `SlidersHorizontal`
icon at 17px, stroke width 1.6, `text-muted-foreground`, with
`aria-label="Settings"`.

### 7e. Focus states

The design system forbids the default browser focus ring. Add to the `@layer base`
block in `packages/ui/src/index.css`:

```css
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
```

---

## Task 8: Test setup

Create `vitest.config.ts` at the repo root:

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const uiRoot = path.resolve(__dirname, "packages/ui");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(uiRoot, "./src"),
      "@assets": path.resolve(uiRoot, "./assets"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/**/*.test.{ts,tsx}"],
  },
});
```

Create `vitest.setup.ts` at the repo root:

```ts
import "@testing-library/jest-dom/vitest";
```

`@vitejs/plugin-react` is currently a dev dependency of the two apps, not the root. Add
it to the root dev dependencies as well: `pnpm add -Dw @vitejs/plugin-react`.

Add to the root `package.json` scripts:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Write two tests to prove the harness works, both in
`packages/ui/src/components/chrome/`:

1. `BrandMark.test.tsx`: renders `BrandMark`, asserts the letter `T` and the word `Tudu`
   are both in the document.
2. `DayJump.test.tsx`: renders `DayJump` inside a real store `Provider`, asserts `Tdy`
   is the selected option on first render, clicks `Tmr`, asserts the store's
   `day.selectedDate` is tomorrow's ISO date.

The second test needs a fresh store per test. Export a `makeStore()` factory from
`packages/store/src/store.ts` alongside the existing singleton `store`, and have the
singleton call it.

---

## Task 9: Update the roadmap

Edit `docs/plans/README.md` and change the step 1 row status from `Planned` to `Done`.

---

## Verification checklist

Run all of these from `/Users/rraj/Documents/work/tudu`. Every one must pass.

```bash
pnpm install
pnpm lint:copy          # must print "No em-dashes found."
pnpm build              # tsc -b plus vite build across the workspace
pnpm test               # both tests green
```

Then run the app and check by eye:

```bash
pnpm dev
```

1. Signed out shows the Clerk sign in, unchanged from before.
2. Signed in shows the top bar: mark, wordmark, four tabs, date, day jump, red New task
   button, settings icon.
3. The bar is 56px tall, sits on the card colour, has a 1px rule underneath, and nothing
   in it has a rounded corner.
4. Clicking Week, Inbox and Team changes the route and moves the active underline. The
   Today tab is not underlined while you are on another route.
5. The Inbox tab shows a red `2` badge.
6. The chevrons move the date by one day. `Yest`, `Tdy` and `Tmr` jump correctly and the
   selected segment follows the date.
7. Clicking New task raises a toast in the bottom right.
8. The settings icon routes to `/settings`.
9. Tab through the bar. Every focusable element gets a 2px red outline, never the
   browser default blue.
10. In devtools, add `class="dark"` to `<html>`. The whole bar flips to warm charcoal
    with no layout shift. Remove it and it flips back.
11. Reload the page on `/week`. It stays on `/week` and does not 404, in both the Tauri
    window and the browser.

## Things most likely to go wrong

- **Tauri and history routing.** If reloading on `/week` inside the Tauri window shows a
  blank screen, the custom protocol is not falling back to `index.html`. Fix it by
  switching `createRouter` to `createMemoryHistory` for the desktop build only, and
  report it, because it changes the plan for step 7's URL driven week picker.
- **The shadcn CLI overwriting existing components.** You pass `--overwrite`, so it will
  happily replace `button.tsx` if you accidentally list `button`. Only add the
  components in the task 2 list.
- **Tailwind v4 not seeing new tokens.** Utilities like `border-rule` only exist if the
  token is declared inside `@theme inline`, not just in `:root`. Both are required.
- **The em-dash lint.** If `pnpm lint:copy` fails, run
  `rg -n $'\u2014' . --hidden --glob '!.git' --glob '!node_modules'` to find it.
