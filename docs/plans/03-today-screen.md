# Step 3: Today screen, read only

Status: Planned
Depends on: step 2
Blocks: step 4

## Read this first

You are working in a pnpm monorepo at `/Users/rraj/Documents/work/tudu`.

- `packages/ui` holds all shared React UI. **This is where almost all of your work
  happens.**
- `packages/store` holds Redux Toolkit, RTK Query, and the `day` slice.
- `packages/shared` holds zod schemas and `DEFAULT_NOW_SOFT_CAP`.
- `apps/server` already exposes task CRUD from step 2. You do not touch it here.

Read `.cursor/rules/react-ui.mdc` and `.cursor/rules/redux-store.mdc` before you start.

### Rules you will break if you are not careful

1. **No em-dash characters (U+2014) anywhere.** `pnpm lint:copy` greps the whole
   working tree and fails the build.
2. TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`.
3. No `rounded-*` classes. Radius is `0` project-wide.
4. New UI lives in `packages/ui`. Do not add screens to `apps/desktop` or `apps/web`.
5. Cross package imports use workspace names: `@tudu/store`, `@tudu/shared`. Never
   relative paths across packages.
6. `packages/store` relative imports carry `.js` extensions. `packages/ui` uses `@/`
   with no extension.

## Goal

After this step, signing in and opening Today shows the real A1 three pane layout with
tasks from the API. Clicking a row selects it and fills the detail inspector with
read-only fields. The JIRA column shows the C6b not-connected empty state. A new
Unscheduled nav tab and route list the backlog. Nothing is editable: no create,
complete, rename, delete, drag, or bucket change.

## Non goals

Do not build any of these. They belong to later steps.

- Task CRUD, drag to reorder, or the working add row. Step 4.
- Attachments, comments, timeline content, or the "Latest" preview block. Step 5.
- Carry dots on rows (A2 shows them; A1 meta line uses text only). Step 6.
- Real JIRA data or connection state. Step 10.
- Optimistic RTK Query updates. Step 4.
- Enforcing or nudging the Now soft cap beyond showing the prompt line. Step 4.
- Week view, Inbox, Team product features. Later steps.

## Design reference

Open the Claude artifact in a browser:

https://claude.ai/code/artifact/26712a88-3eed-429a-b4ed-6bc11c15b3fa

Screens in scope:

| Screen | What to match |
|---|---|
| A1 Today | Three pane grid, bucket headers, task rows, add row placeholder, inspector |
| C6 First run | Left pane when the user has zero tasks anywhere |
| C6b JIRA not connected | Middle pane until step 10 |

### Layout numbers (A1)

| Pane | Rule | Notes |
|---|---|---|
| Task list | `minmax(0, 1fr)` | Grows and shrinks |
| JIRA | 296px default | `defaultSize={296}` `minSize={240}` |
| Inspector | 356px default | `defaultSize={356}` `minSize={300}` |

`react-resizable-panels@4.12.3` treats bare numbers as **pixels**.

### Decisions already made

1. **Unscheduled** is a nav tab at `/unscheduled` between Inbox and Team, with a faint
   count (not Inbox's red badge).
2. **Bucket labels**: Today shows Now / Next / Later; other dates show Priority 1 / 2 /
   3. Enum values stay `now | next | later`.
3. **Now empty**: show `Now is clear. Pull the next thing in?` when Next has tasks. Button
   is inert (toast) until step 4.

---

## Task 1: Bucket label resolver

Create `packages/ui/src/lib/buckets.ts`:

```ts
import type { Bucket } from "@tudu/shared";

const TODAY_LABELS: Record<Bucket, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

const OTHER_DAY_LABELS: Record<Bucket, string> = {
  now: "Priority 1",
  next: "Priority 2",
  later: "Priority 3",
};

export function bucketLabel(bucket: Bucket, isToday: boolean): string {
  return isToday ? TODAY_LABELS[bucket] : OTHER_DAY_LABELS[bucket];
}

export function isSelectedDateToday(selectedDate: string, today: string): boolean {
  return selectedDate === today;
}
```

Create `packages/ui/src/lib/buckets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketLabel } from "./buckets";

describe("bucketLabel", () => {
  it("uses Now / Next / Later for today", () => {
    expect(bucketLabel("now", true)).toBe("Now");
    expect(bucketLabel("next", true)).toBe("Next");
    expect(bucketLabel("later", true)).toBe("Later");
  });

  it("uses Priority labels for other days", () => {
    expect(bucketLabel("now", false)).toBe("Priority 1");
    expect(bucketLabel("next", false)).toBe("Priority 2");
    expect(bucketLabel("later", false)).toBe("Priority 3");
  });
});
```

---

## Task 2: Task meta formatting

Create `packages/ui/src/lib/taskMeta.ts`:

```ts
import { format, isSameDay, parseISO } from "date-fns";
import type { Task } from "@tudu/shared";

function parseNoon(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function formatDeadline(deadline: string, selectedDate: string): string {
  const date = parseISO(deadline);
  const time = format(date, "HH:mm");
  if (isSameDay(date, parseNoon(selectedDate))) {
    return `due today ${time}`;
  }
  return `due ${format(date, "EEE d MMM")}`;
}

function formatStart(startDate: string, selectedDate: string): string | null {
  if (isSameDay(parseNoon(startDate), parseNoon(selectedDate))) {
    return "starts today";
  }
  return `starts ${format(parseNoon(startDate), "d MMM")}`;
}

export type MetaSegment =
  | { kind: "text"; text: string; emphasis?: boolean }
  | { kind: "dot" };

/** Ordered meta segments for the task row meta line. JIRA key is step 10. */
export function taskMetaSegments(
  task: Task,
  selectedDate: string,
): MetaSegment[] {
  const segments: MetaSegment[] = [];

  const start = task.startDate ? formatStart(task.startDate, selectedDate) : null;
  if (start) {
    segments.push({ kind: "text", text: start });
  }

  if (task.deadline) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    const text = formatDeadline(task.deadline, selectedDate);
    const emphasis = text.startsWith("due today");
    segments.push({ kind: "text", text, emphasis });
  }

  const doneCount = task.subtasks.filter((s) => s.done).length;
  if (task.subtasks.length > 0) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    segments.push({
      kind: "text",
      text: `${doneCount} of ${task.subtasks.length}`,
    });
  }

  if (task.carriedDays > 0) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    const dayWord = task.carriedDays === 1 ? "day" : "days";
    segments.push({
      kind: "text",
      text: `carried ${task.carriedDays} ${dayWord}`,
    });
  }

  return segments;
}
```

---

## Task 3: Extend `daySlice` with selection

Edit `packages/store/src/slices/daySlice.ts`. Add `selectedTaskId` and clear it on any
date change:

```ts
type DayState = {
  selectedDate: string;
  selectedTaskId: string | null;
};

const initialState: DayState = {
  selectedDate: todayIso(),
  selectedTaskId: null,
};

// Inside reducers, add:
setSelectedTaskId(state, action: PayloadAction<string | null>) {
  state.selectedTaskId = action.payload;
},

// At the start of setSelectedDate, shiftSelectedDate, and goToToday:
state.selectedTaskId = null;
```

Export `setSelectedTaskId` from `packages/store/src/index.ts`.

Add `packages/store/src/slices/daySlice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  daySlice,
  goToToday,
  setSelectedDate,
  setSelectedTaskId,
  shiftSelectedDate,
} from "./daySlice.js";

describe("daySlice selection", () => {
  it("clears selectedTaskId when the date changes", () => {
    let state = daySlice.reducer(undefined, setSelectedTaskId("abc"));
    expect(state.selectedTaskId).toBe("abc");

    state = daySlice.reducer(state, setSelectedDate("2026-09-10"));
    expect(state.selectedTaskId).toBeNull();

    state = daySlice.reducer(state, setSelectedTaskId("def"));
    state = daySlice.reducer(state, shiftSelectedDate(1));
    expect(state.selectedTaskId).toBeNull();

    state = daySlice.reducer(state, setSelectedTaskId("ghi"));
    state = daySlice.reducer(state, goToToday());
    expect(state.selectedTaskId).toBeNull();
  });
});
```

---

## Task 4: Unscheduled nav tab and route

### 4a. NavTabs

Edit `packages/ui/src/components/chrome/NavTabs.tsx`.

Add a `count?: number` field to tabs (distinct from Inbox's red `badge`). Insert
Unscheduled between Inbox and Team:

```ts
const tabs = [
  { label: "Today", to: "/", exact: true },
  { label: "Week", to: "/week", exact: false },
  { label: "Inbox", to: "/inbox", exact: false, badge: 2 },
  { label: "Unscheduled", to: "/unscheduled", exact: false, count: true },
  { label: "Team", to: "/team", exact: false },
] as const;
```

Refactor `NavTabs` to accept optional counts from RTK Query. Create a thin wrapper
`NavTabsConnected` in the same file or split: the connected version calls
`useGetUnscheduledTasksQuery()` and passes `unscheduledCount={data?.tasks.length ?? 0}`
into `TabContent`. Render count as `text-[11.5px] text-faint tabular-nums`, no red
background.

### 4b. Router

Edit `packages/ui/src/router.tsx`. Add:

```ts
import { UnscheduledRoute } from "@/routes/UnscheduledRoute";

const unscheduledRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/unscheduled",
  component: UnscheduledRoute,
});
```

Register it in `appLayoutRoute.addChildren([...])`.

### 4c. UnscheduledRoute

Create `packages/ui/src/routes/UnscheduledRoute.tsx`:

```tsx
import { useGetUnscheduledTasksQuery } from "@tudu/store";
import { TaskRow } from "@/components/tasks/TaskRow";
import { ScrollArea } from "@/components/ui/scroll-area";

export function UnscheduledRoute() {
  const { data, isLoading, isError } = useGetUnscheduledTasksQuery();

  if (isLoading) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-destructive">
        Could not load unscheduled tasks.
      </p>
    );
  }

  const tasks = data?.tasks ?? [];

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="px-[28px] pb-[8px] pt-[24px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        Unscheduled
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {tasks.length === 0 ? (
          <p className="px-[28px] py-[16px] text-[13px] text-faint">
            Nothing unscheduled. Tasks without a day land here.
          </p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              bucket="later"
              selected={false}
              selectedDate=""
              onSelect={() => {
                /* step 4 */
              }}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
```

Step 3 does not wire selection on this route. Rows are read-only list items.

---

## Task 5: Task row

Create `packages/ui/src/components/tasks/TaskRow.tsx`.

Props:

```ts
import type { Bucket, Task } from "@tudu/shared";

export type TaskRowProps = {
  task: Task;
  bucket: Bucket;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
};
```

Layout per A1:

- Grid: `grid-cols-[19px_minmax(0,1fr)] gap-x-[15px]` (add `13px` first column when
  selected for drag handle dots, read-only, `cursor-default`).
- Padding: `py-[15px] px-[28px]` (Later: `py-[12px]`, title `text-[14.5px]
  text-muted-foreground`).
- Selected: `bg-foreground/[0.03] shadow-[inset_2px_0_0_var(--foreground)]`.
- Hover: `hover:bg-foreground/[0.02]`.
- Checkbox: `18px`, disabled, reflects `task.completedAt !== null`.
- Meta line: `text-[12.5px] text-muted-foreground tabular-nums`, segments from
  `taskMetaSegments`, dots as `text-ghost` middot.
- When selected, render subtasks below title: `14px` checkbox, `13.5px` labels,
  done items get `line-through text-faint`.

Use `role="button"` on the row container with `tabIndex={0}` and `onClick={onSelect}`.
Do not use a real `<button>` wrapper (checkbox inside).

Create `packages/ui/src/components/tasks/TaskRow.test.tsx` with a fixture task. Assert
meta line shows `2 of 3` and selected row has the inset shadow class.

---

## Task 6: Bucket section and day task list

Create `packages/ui/src/components/tasks/BucketSection.tsx`:

```ts
export type BucketSectionProps = {
  bucket: Bucket;
  label: string;
  tasks: Task[];
  selectedTaskId: string | null;
  selectedDate: string;
  onSelectTask: (id: string) => void;
  showNowHelper?: boolean;
  showNowClearPrompt?: boolean;
  onNowClearPrompt?: () => void;
};
```

Header: `text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint`,
padding `24px 28px 8px` for Now (with helper on the right at `11.5px text-ghost`) or
`28px 28px 8px` for Next and Later.

When `showNowClearPrompt`, render below the header:

```tsx
<p className="px-[28px] pb-[8px] text-[13px] text-muted-foreground">
  Now is clear.{" "}
  <button
    type="button"
    className="font-semibold text-foreground underline-offset-2 hover:underline"
    onClick={onNowClearPrompt}
  >
    Pull the next thing in?
  </button>
</p>
```

When `tasks.length === 0` and not showing the clear prompt, one faint line:
`Nothing here yet.` at `13px text-faint`.

Create `packages/ui/src/components/tasks/DayTaskList.tsx`:

- Input: `tasks: Task[]`, `selectedDate`, `selectedTaskId`, callbacks.
- Split tasks by `bucket` into now / next / later arrays, preserving `position` order.
- Compute `isToday` via `todayIso()` from store.
- Render three `BucketSection`s.
- `showNowClearPrompt`: `now.length === 0 && next.length > 0 && isToday`.
- `onNowClearPrompt`: `() => toast("Pull into Now lands in step 4")`.
- Pin `AddTaskRow` at bottom with `mt-auto`.

Create `packages/ui/src/components/tasks/AddTaskRow.tsx` (static):

```tsx
export function AddTaskRow() {
  return (
    <div className="mt-auto flex items-center gap-[12px] border-t border-hair px-[28px] py-[16px]">
      {/* plus icon 15px text-ghost */}
      <span className="text-[14px] text-faint">
        Add a task, or paste a JIRA key to link one
      </span>
      <span className="ml-auto font-mono text-[11.5px] text-ghost">⌘N</span>
    </div>
  );
}
```

Test `BucketSection.test.tsx`: with `showNowClearPrompt`, button text appears.

---

## Task 7: JIRA column empty state

Create `packages/ui/src/components/jira/JiraColumnEmpty.tsx` matching C6b not connected:

- Header: `JIRA · assigned to me`, padding `24px 20px 12px`, same label styling as
  buckets.
- Body centered: link icon 22px `text-ghost`, title `No JIRA connected` `14px
  font-semibold`, body copy from mockup, primary `Connect JIRA` button (inert, toast),
  footer `Tudu works without it` `11.5px text-faint`.

Until step 10, Today always renders this component in the middle pane.

---

## Task 8: Detail inspector

Create `packages/ui/src/components/inspector/DetailInspectorEmpty.tsx` (A2 copy when list
has tasks but nothing selected):

```tsx
<p className="max-w-[230px] text-[14px] leading-relaxed text-muted-foreground">
  Select a task to see its detail, comments and timeline.
</p>
```

Create `packages/ui/src/components/inspector/DetailInspector.tsx`.

When `task` is null, render empty state centered in the pane with calendar icon.

When `task` is set:

- Tab bar height 44px: Details active (`font-bold shadow-[inset_0_-2px_0_var(--foreground)]`),
  Comments with count placeholder `2` in faint (hardcode until step 5), Timeline inactive.
- Title: `19px font-extrabold tracking-tight`.
- Field grid: `grid-cols-[78px_minmax(0,1fr)] gap-x-[16px] gap-y-[13px] text-[13px]`.
- **Bucket**: read-only segmented control (Now/Next/Later labels from `bucketLabel`).
  Active segment gets `bg-foreground text-card`. No clicks.
- **Start**, **Deadline**, **Carried**: format from task fields. Carried:
  `{carriedDays} days, since {carriedSince}` when `carriedDays > 0`, else em dash.
- **Private**: show `Private` badge when `task.isPrivate`.
- Do **not** render Attachments or Latest sections (step 5).
- Footer: `Panes drag to resize · rows drag to reorder` and `⌘K commands`.

Background: `bg-background`. Pane fills height with `flex flex-col`.

---

## Task 9: C6 first-run empty state

Create `packages/ui/src/components/today/TodayFirstRun.tsx` for when the user has zero
tasks on the selected day **and** zero unscheduled tasks.

Match C6 left pane copy:

- Heading: `Nothing here yet. Good.`
- Three numbered points from the artifact (use bold for bucket names via `font-semibold`).
- CTA row: `Add my first task` outline button (inert, toast) and `⌘N` hint.

This replaces the three-pane layout entirely for that state.

---

## Task 10: Three-pane shell and TodayRoute

Create `packages/ui/src/components/today/TodayPanelLayout.tsx`:

```tsx
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const STORAGE_KEY = "tudu.today-panel-layout";

type TodayPanelLayoutProps = {
  taskList: React.ReactNode;
  jiraColumn: React.ReactNode;
  inspector: React.ReactNode;
};

export function TodayPanelLayout({
  taskList,
  jiraColumn,
  inspector,
}: TodayPanelLayoutProps) {
  // Read defaultLayout from localStorage on first render (guard SSR/window).
  // onLayoutChanged: persist JSON layout.

  return (
    <ResizablePanelGroup
      id="today-panels"
      orientation="horizontal"
      className="h-full"
    >
      <ResizablePanel id="task-list" minSize={420} defaultSize="flex">
        {taskList}
      </ResizablePanel>
      <ResizableHandle className="w-[7px] bg-transparent after:w-[7px]" />
      <ResizablePanel id="jira" defaultSize={296} minSize={240}>
        {jiraColumn}
      </ResizablePanel>
      <ResizableHandle className="w-[7px] bg-transparent after:w-[7px]" />
      <ResizablePanel id="inspector" defaultSize={356} minSize={300}>
        {inspector}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

Custom handle styling: idle state shows three `3px` dots in `text-ghost`; active drag
shows `2px` wide `46px` tall `bg-foreground` bar. Use `[&[data-separator][data-state=drag]]`
selectors on the handle className.

Replace `packages/ui/src/routes/TodayRoute.tsx`:

```tsx
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedTaskId,
  todayIso,
  useGetTasksForDayQuery,
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { DayTaskList } from "@/components/tasks/DayTaskList";
import { DetailInspector } from "@/components/inspector/DetailInspector";
import { JiraColumnEmpty } from "@/components/jira/JiraColumnEmpty";
import { TodayFirstRun } from "@/components/today/TodayFirstRun";
import { TodayPanelLayout } from "@/components/today/TodayPanelLayout";

export function TodayRoute() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);

  const dayQuery = useGetTasksForDayQuery(selectedDate);
  const unscheduledQuery = useGetUnscheduledTasksQuery();

  const tasks = dayQuery.data?.tasks ?? [];
  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const isFirstRun =
    !dayQuery.isLoading &&
    !unscheduledQuery.isLoading &&
    tasks.length === 0 &&
    unscheduledCount === 0;

  if (dayQuery.isLoading) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (dayQuery.isError) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-destructive">
        Could not load tasks for this day.
      </p>
    );
  }

  if (isFirstRun) {
    return <TodayFirstRun />;
  }

  return (
    <TodayPanelLayout
      taskList={
        <div className="flex h-full min-h-0 flex-col bg-card">
          <DayTaskList
            tasks={tasks}
            selectedDate={selectedDate}
            selectedTaskId={selectedTaskId}
            onSelectTask={(id) => dispatch(setSelectedTaskId(id))}
          />
        </div>
      }
      jiraColumn={<JiraColumnEmpty />}
      inspector={<DetailInspector task={selectedTask} selectedDate={selectedDate} />}
    />
  );
}
```

---

## Task 11: Verification

Run from repo root:

```bash
pnpm build
pnpm test
pnpm lint:copy
```

Manual check with `pnpm dev:all`:

1. Sign up or sign in (step 2 reset may have cleared accounts).
2. Today shows C6 first-run when empty.
3. Create tasks via curl (examples in `02-task-data-model.md`) or wait for step 4.
4. With seeded tasks, three buckets render, row click selects, inspector fills.
5. Unscheduled tab shows count and lists backlog tasks.
6. Change date with DayJump: bucket headers switch to Priority 1 / 2 / 3 when not today.
7. Resize panes: layout persists after reload.

---

## Task 12: Roadmap

Edit `docs/plans/README.md` step 3 row: Status **Done**.

Edit this file: Status **Done**.

---

## Things most likely to go wrong

1. **Forgetting to export `setSelectedTaskId` from `@tudu/store`.** UI imports fail at
   runtime.
2. **Using percentage panel sizes when pixels were intended.** Match A1: 296 and 356 px.
3. **Nesting a button inside TaskRow.** Use `role="button"` on a `div` instead.
4. **Rendering Attachments in the inspector.** Step 5 only. Details tab stops at fields
   step 2 stores.
5. **Auto-pulling Next into Now.** Product decision is prompt only; do not move tasks.
6. **Em-dash in C6 copy.** Run `pnpm lint:copy` before you commit.
