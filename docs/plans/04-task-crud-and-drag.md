# Step 4: Task CRUD and drag to reorder

Status: Done
Depends on: step 3
Blocks: step 5

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
7. **`components/ui/*` is shadcn generated.** Do not hand-edit. Run the CLI to add
   `context-menu`.

## Goal

After this step, the Today screen and the Unscheduled route are fully usable:

- Add tasks from the add row (lands in Later on the selected day, or undated on
  Unscheduled).
- Complete, rename, delete tasks. Toggle and add subtasks on the selected row.
- Drag to reorder within a bucket and drag across buckets.
- Pull the top of Next into Now when the prompt shows.
- Optimistic RTK Query updates so drag feels instant.
- Now header shows the soft cap badge (`3 / 5`, over-cap `6 / 5`).

The detail inspector stays read-only. Timeline events belong to step 5.

## Non goals

Do not build any of these. They belong to later steps.

- Attachments, comments, timeline writes, or editable inspector fields. Step 5.
- Carry dots on rows. Step 6.
- Drag from Unscheduled onto a day column (cross-route drag). Step 7.
- JIRA key parsing in the add row (paste makes a plain task until step 10).
- Command palette or global ⌘N (step 8). Wire ⌘N only when the add row is focused or
  Today is visible via a local `useEffect` keydown handler.
- Enforcing the Now cap (nudge only, never block a move).
- Restore/undo for deleted tasks (database soft-deletes with no restore route).

## Design reference

Open the local artifact in a browser:

`file:///Users/rraj/Documents/work/tudu_designs/Tudu.artifact.html`

Upstream: https://claude.ai/code/artifact/26712a88-3eed-429a-b4ed-6bc11c15b3fa

Screens in scope:

| Screen | What to match |
|---|---|
| A1 Today | Add row, grabbed row, subtask rows, Now cap badge, bucket helper text |
| A2b Past midnight | Over-cap Now badge (`6 / 5`, white on accent) |
| C6 First run | Add my first task button |

### Decisions already made

See `docs/plans/README.md` step 4 decisions. Summary:

1. Right-click menu for rename/delete/move/unschedule. Double-click title renames.
2. Completed tasks stay in place, struck through and faded.
3. Add row creates at bottom of Later (selected date) or undated (Unscheduled).
4. "Add a subtask" faint line on selected row only.
5. Subtasks folded behind count on unselected rows.
6. Delete confirms via `alert-dialog`.
7. Drag handle always visible.
8. `DEFAULT_NOW_SOFT_CAP = 5`.

### Invented (recorded as deviations 9 to 13 in README)

- 2px ink drop insertion line while dragging.
- Lifted-row shadow on the drag overlay.
- Completed parent row strikethrough/fade.
- Right-click menu and add-subtask line (mockup draws neither).

---

## Task 1: Fix the Now soft cap constant

Edit `packages/shared/src/tasks.ts`:

```ts
export const DEFAULT_NOW_SOFT_CAP = 5;
```

Update the comment above it to say "3 to 5 range" for step 11.

Run `pnpm --filter @tudu/shared test` to confirm nothing breaks.

---

## Task 2: Lane reorder helper

Create `packages/ui/src/lib/reorder.ts`. This is pure logic, testable without jsdom
drag simulation.

```ts
import { BUCKETS, type Bucket, type Lane, type Task } from "@tudu/shared";

export type LaneKey = {
  scheduledDate: string | null;
  bucket: Bucket | null;
};

export function laneKey({ scheduledDate, bucket }: LaneKey): string {
  return `${scheduledDate ?? "null"}|${bucket ?? "null"}`;
}

export function groupTasksByLane(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();

  for (const task of tasks) {
    const key = laneKey({
      scheduledDate: task.scheduledDate,
      bucket: task.bucket,
    });
    const lane = map.get(key) ?? [];
    lane.push(task);
    map.set(key, lane);
  }

  for (const [, laneTasks] of map) {
    laneTasks.sort((a, b) => a.position - b.position);
  }

  return map;
}

export function orderedIds(tasks: Task[]): string[] {
  return [...tasks].sort((a, b) => a.position - b.position).map((t) => t.id);
}

/** Move one task within or across lanes. Returns only the lanes that changed. */
export function buildReorderLanes(args: {
  tasks: Task[];
  activeId: string;
  target: LaneKey;
  targetIndex: number;
}): Lane[] {
  const { tasks, activeId, target, targetIndex } = args;
  const grouped = groupTasksByLane(tasks);
  const active = tasks.find((t) => t.id === activeId);
  if (!active) {
    throw new Error(`Task ${activeId} not found`);
  }

  const sourceKey = laneKey({
    scheduledDate: active.scheduledDate,
    bucket: active.bucket,
  });
  const targetKey = laneKey(target);

  const sourceIds = orderedIds(grouped.get(sourceKey) ?? []).filter(
    (id) => id !== activeId,
  );
  const targetIds = orderedIds(grouped.get(targetKey) ?? []).filter(
    (id) => id !== activeId,
  );
  targetIds.splice(targetIndex, 0, activeId);

  const lanes: Lane[] = [];

  if (sourceKey !== targetKey) {
    lanes.push({
      scheduledDate: active.scheduledDate,
      bucket: active.bucket,
      taskIds: sourceIds,
    });
  }

  lanes.push({
    scheduledDate: target.scheduledDate,
    bucket: target.bucket,
    taskIds: targetKey === sourceKey ? targetIds : targetIds,
  });

  return lanes;
}

/** Pull the first Next task into Now (product prompt). */
export function buildPullIntoNowLanes(
  tasks: Task[],
  scheduledDate: string,
): Lane[] {
  const grouped = groupTasksByLane(tasks);
  const nowKey = laneKey({ scheduledDate, bucket: "now" });
  const nextKey = laneKey({ scheduledDate, bucket: "next" });
  const nowIds = orderedIds(grouped.get(nowKey) ?? []);
  const nextIds = orderedIds(grouped.get(nextKey) ?? []);
  if (nextIds.length === 0) {
    return [];
  }
  const [first, ...rest] = nextIds;
  return [
    { scheduledDate, bucket: "now", taskIds: [...nowIds, first] },
    { scheduledDate, bucket: "next", taskIds: rest },
  ];
}

export function moveTaskToBucketLanes(
  tasks: Task[],
  taskId: string,
  targetBucket: Bucket,
  scheduledDate: string,
): Lane[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !task.bucket) {
    return [];
  }
  const grouped = groupTasksByLane(tasks);
  const targetKey = laneKey({ scheduledDate, bucket: targetBucket });
  const targetIds = orderedIds(grouped.get(targetKey) ?? []);
  targetIds.push(taskId);
  return buildReorderLanes({
    tasks,
    activeId: taskId,
    target: { scheduledDate, bucket: targetBucket },
    targetIndex: targetIds.length - 1,
  });
}

export function unscheduleTaskLanes(tasks: Task[], taskId: string): Lane[] {
  const grouped = groupTasksByLane(tasks);
  const unscheduledKey = laneKey({ scheduledDate: null, bucket: null });
  const unscheduledIds = orderedIds(grouped.get(unscheduledKey) ?? []);
  unscheduledIds.push(taskId);
  return buildReorderLanes({
    tasks,
    activeId: taskId,
    target: { scheduledDate: null, bucket: null },
    targetIndex: unscheduledIds.length - 1,
  });
}

export function scheduleToTodayLanes(
  dayTasks: Task[],
  unscheduledTasks: Task[],
  taskId: string,
  today: string,
): Lane[] {
  const all = [...dayTasks, ...unscheduledTasks];
  const grouped = groupTasksByLane(all);
  const laterKey = laneKey({ scheduledDate: today, bucket: "later" });
  const laterIds = orderedIds(grouped.get(laterKey) ?? []);
  laterIds.push(taskId);
  return buildReorderLanes({
    tasks: all,
    activeId: taskId,
    target: { scheduledDate: today, bucket: "later" },
    targetIndex: laterIds.length - 1,
  });
}
```

Create `packages/ui/src/lib/reorder.test.ts` covering:

- Reorder within one bucket (positions rewrite).
- Move across buckets on the same day.
- Move into an empty bucket.
- `buildPullIntoNowLanes` moves first Next id into Now.
- `unscheduleTaskLanes` sends task to null/null lane.
- Refuse duplicate ids (server throws; helper should not produce duplicates).

---

## Task 3: Optimistic RTK Query updates

Replace broad `invalidatesTags: ["Task"]` on mutations with optimistic cache patches
in `packages/store/src/api/tasksApi.ts`. Keep `providesTags: ["Task"]` on queries.

Add helper functions at the top of the file (same module, not exported):

```ts
import type { Task, TasksResponse } from "@tudu/shared";
import type { Patch } from "@reduxjs/toolkit";

function patchTasksCache(
  dispatch: AppDispatch,
  getState: () => RootState,
  updater: (draft: Task[]) => Task[],
): Patch[] {
  const patches: Patch[] = [];
  const state = getState();
  const apiState = state[baseApi.reducerPath];

  for (const entry of Object.values(apiState.queries)) {
    if (!entry?.endpointName || !entry.originalArgs) continue;
    if (entry.endpointName === "getTasksForDay") {
      const date = entry.originalArgs as string;
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData("getTasksForDay", date, (draft) => {
            draft.tasks = updater(draft.tasks);
          }),
        ),
      );
    }
    if (entry.endpointName === "getUnscheduledTasks") {
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData("getUnscheduledTasks", undefined, (draft) => {
            draft.tasks = updater(draft.tasks);
          }),
        ),
      );
    }
  }
  return patches;
}
```

You will need to import `RootState`, `AppDispatch` from `../store.js` and export them if
not already exported.

For each mutation, use `async onQueryStarted(arg, { dispatch, queryFulfilled, getState })`:

| Mutation | Optimistic action |
|---|---|
| `createTask` | Append a temporary task with `crypto.randomUUID()` id to the correct cache (day or unscheduled). Replace with server response on fulfill; undo on reject. |
| `updateTask` | Merge `patch` into the matching task in all caches. On fulfill, replace with server task. |
| `deleteTask` | Remove task from all caches. |
| `reorderTasks` | Apply lane placements locally: rewrite `bucket`, `scheduledDate`, `position` for every id in every lane. |
| Subtask mutations | Find parent task in cache, patch its `subtasks` array. |

Remove `invalidatesTags` from all task mutations once optimistic paths work. Drag will
snap back if you leave invalidates in place.

Export `tasksApi.util` selectors if tests need them.

---

## Task 4: shadcn context-menu

From repo root:

```bash
cd packages/ui && pnpm dlx shadcn@latest add context-menu --yes
```

This creates `packages/ui/src/components/ui/context-menu.tsx`. Do not edit it by hand
after generation.

---

## Task 5: Interactive add row

Replace `packages/ui/src/components/tasks/AddTaskRow.tsx`:

Props:

```tsx
export type AddTaskRowProps = {
  onSubmit: (title: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};
```

Behavior:

- Renders the same layout as today (Plus icon, placeholder, ⌘N hint).
- Clicking anywhere on the row focuses the input.
- `<input>` styled borderless: `flex-1 bg-transparent text-[14px] outline-none
  placeholder:text-faint`.
- **Enter** trims and calls `onSubmit(title)` if non-empty, clears input, keeps focus.
- **Escape** blurs.
- Parent passes `onSubmit` that calls `createTask`.

Export a hook `useAddTaskShortcut(inputRef)` in the same file or
`packages/ui/src/hooks/useAddTaskShortcut.ts`:

```tsx
useEffect(() => {
  function onKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "n") {
      event.preventDefault();
      inputRef.current?.focus();
    }
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [inputRef]);
```

Wire in `DayTaskList` and `UnscheduledRoute`.

Create task payload for Today:

```tsx
createTask({
  title,
  scheduledDate: selectedDate,
  bucket: "later",
});
```

For Unscheduled:

```tsx
createTask({ title, scheduledDate: null, bucket: null });
```

---

## Task 6: Task row interactions

This is the largest change. Refactor `packages/ui/src/components/tasks/TaskRow.tsx`.

### New props

```tsx
export type TaskRowProps = {
  task: Task;
  bucket: Bucket;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
  sortableId: string;
  disabled?: boolean;
  menuVariant: "day" | "unscheduled";
  onComplete: (completed: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onMoveToBucket: (bucket: Bucket) => void;
  onUnschedule: () => void;
  onScheduleToToday: () => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
  onAddSubtask: (title: string) => void;
};
```

Parent components pass mutation callbacks from RTK hooks.

### Always-on drag handle

Every row uses the same grid:

```tsx
className={cn(
  "grid cursor-default border-b border-hair outline-none",
  "grid-cols-[13px_19px_minmax(0,1fr)] gap-x-[12px]",
  selected
    ? "bg-foreground/[0.03] py-[14px] pl-[13px] pr-[28px] shadow-[inset_2px_0_0_var(--foreground)]"
    : "px-[28px] py-[15px] hover:bg-foreground/[0.02]",
  isLater && !selected && "items-center py-[12px]",
  isCompleted && "opacity-70",
)}
```

Render `<DragHandleDots />` always. Attach `{...attributes} {...listeners}` from
`useSortable` **only to the handle div**, not the whole row, so click-to-select still
works. Handle gets `cursor-grab active:cursor-grabbing touch-none`.

Wrap the row in `ContextMenu` + `ContextMenuTrigger` (asChild on the outer div).

### Checkbox

Replace `aria-hidden` div with a `<button type="button">` wrapping the checkbox visual.
`onClick` stops propagation and calls `onComplete(!isCompleted)`.
`aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}`.

### Completed title styling

When `task.completedAt !== null`, title gets `line-through text-faint` regardless of
bucket.

### Double-click rename

Local state `isEditing`. On title `onDoubleClick`, set editing true and show an
`<input>` replacing the title span. Enter commits via `onRename`, Escape cancels.
Stop propagation on the input so row does not re-select.

### Context menu items

**Day variant:**

- Rename (sets editing mode)
- Separator
- Move to Now / Next / Later (disable the current bucket item)
- Unschedule
- Separator
- Delete (opens confirm dialog, not immediate)

**Unscheduled variant:**

- Rename
- Schedule to today
- Separator
- Delete

Create `packages/ui/src/components/tasks/TaskDeleteDialog.tsx`:

```tsx
export type TaskDeleteDialogProps = {
  open: boolean;
  title: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};
```

Copy:

- Title: `Delete this task?`
- Description: `This cannot be undone.`
- Cancel / Delete buttons using `AlertDialog` from `@/components/ui/alert-dialog`.

### Subtasks

When `selected`:

- Always show subtask list (even if empty, show only the add line).
- Each subtask checkbox is a button calling `onToggleSubtask`.
- Below the list, faint add line:

```tsx
<button
  type="button"
  className="mt-[6px] text-[13px] text-faint hover:text-muted-foreground"
  onClick={() => setAddingSubtask(true)}
>
  Add a subtask
</button>
```

When adding, show inline input. Enter calls `onAddSubtask(title)`.

When not selected, hide subtask titles (count stays in meta line via existing
`taskMetaSegments`).

### useSortable

```tsx
const {
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  isDragging,
} = useSortable({ id: sortableId, disabled });

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.4 : undefined,
};
```

Apply `ref={setNodeRef} style={style}` on the outer row div.

Remove the dead ternary in `titleClass` for `now` bucket (both branches were identical).

---

## Task 7: Bucket section with SortableContext and cap badge

Update `packages/ui/src/components/tasks/BucketSection.tsx`.

New props:

```tsx
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
  nowCount?: number;
  nowSoftCap?: number;
  // pass-through row action callbacks (same signatures as TaskRowProps)
  rowActions: Omit<TaskRowProps, "task" | "bucket" | "selected" | "selectedDate" | "onSelect" | "sortableId" | "menuVariant">;
};
```

Wrap the task list in:

```tsx
<SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
  ...
</SortableContext>
```

Each section is also a droppable target. Use `useDroppable({ id: \`bucket-${bucket}\` })`
on the section element so empty buckets accept drops. Minimum height when empty:
`min-h-[48px]` so there is a hit target beyond the placeholder text.

**Now cap badge** in the header when `bucket === "now" && showNowHelper`:

```tsx
const overCap = (nowCount ?? 0) > (nowSoftCap ?? DEFAULT_NOW_SOFT_CAP);
<span
  className={cn(
    "text-[11px] font-bold tabular-nums leading-none whitespace-nowrap px-[6px] py-[2px]",
    overCap
      ? "bg-primary font-extrabold text-primary-foreground"
      : "border border-hair text-faint",
  )}
>
  {nowCount} / {nowSoftCap}
</span>
```

Import `DEFAULT_NOW_SOFT_CAP` from `@tudu/shared`.

---

## Task 8: DayTaskList with DndContext

Replace `packages/ui/src/components/tasks/DayTaskList.tsx`.

Imports from `@dnd-kit/core` and `@dnd-kit/sortable`. Use
`closestCorners` collision detection and `@dnd-kit/modifiers` `restrictToVerticalAxis`
if needed.

Structure:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCorners}
  onDragStart={...}
  onDragOver={...}
  onDragEnd={handleDragEnd}
  onDragCancel={...}
>
  {BUCKETS.map(... BucketSection ...)}
  <DragOverlay>...</DragOverlay>
</DndContext>
<AddTaskRow onSubmit={handleCreate} inputRef={addInputRef} />
```

`handleDragEnd`:

1. Resolve active task id and over bucket + index from `over.id` (droppable ids like
   `bucket-now` or sortable task ids).
2. Call `buildReorderLanes(...)`.
3. Fire `reorderTasks({ lanes })`.

`handlePullIntoNow`:

Replace the toast with:

```tsx
const lanes = buildPullIntoNowLanes(tasks, selectedDate);
if (lanes.length > 0) {
  reorderTasks({ lanes });
}
```

Wire mutations:

```tsx
const [createTask] = useCreateTaskMutation();
const [updateTask] = useUpdateTaskMutation();
const [deleteTask] = useDeleteTaskMutation();
const [reorderTasks] = useReorderTasksMutation();
const [createSubtask] = useCreateSubtaskMutation();
const [updateSubtask] = useUpdateSubtaskMutation();
```

Pass row action callbacks into each `BucketSection`.

**Drop indicator:** while dragging, render a 2px inset bar (`h-[2px] bg-foreground`)
above the row under the pointer. Simplest approach: track `overId` in state during
`onDragOver` and render the bar inside the target `TaskRow` when
`overId === task.id && activeId !== task.id`.

**DragOverlay:** clone the row title + checkbox at reduced opacity with
`shadow-[0_8px_24px_rgba(0,0,0,0.12)]`.

Register `useAddTaskShortcut(addInputRef)` in this component.

---

## Task 9: Unscheduled route

Rewrite `packages/ui/src/routes/UnscheduledRoute.tsx` to mirror day-list editing:

- Add `selectedTaskId` state local to the route (or reuse `daySlice` only for Today;
  **use local `useState` for Unscheduled** so switching tabs does not leak selection).
- Single lane sortable list with `DndContext` (reorder within backlog only).
- `AddTaskRow` at bottom creating undated tasks.
- `TaskRow` with `menuVariant="unscheduled"`.
- Schedule to today calls `scheduleToTodayLanes` + `reorderTasks`, using `todayIso()`
  from store.
- No three-pane layout, no inspector.

Empty state copy stays: `Nothing unscheduled. Tasks without a day land here.`

---

## Task 10: Today first-run

Update `packages/ui/src/components/today/TodayFirstRun.tsx`:

1. Replace toast on "Add my first task" with the same create flow as the add row
   (opens inline input or focuses a hidden add row). Simplest: render `AddTaskRow`
   inline and hide the bordered button, **or** button focuses the add input in
   `TodayRoute` via ref callback. Recommended: accept `onAddFirst` prop from
   `TodayRoute` that creates a Later task for `todayIso()` and invalidates/refetches so
   first-run disappears.

2. Fix tip 1 copy: change **Next** to **Later**:

```tsx
Type a task and it lands in <span className="font-semibold">Later</span>.
Drag it up into <span className="font-semibold">Now</span> when it is what
you are actually doing.
```

`TodayRoute` passes the create handler and refetches after first task.

---

## Task 11: Tests

Add or extend:

| File | Cases |
|---|---|
| `packages/ui/src/lib/reorder.test.ts` | All helper cases from task 2 |
| `packages/ui/src/components/tasks/TaskRow.test.tsx` | Completed styling, always-visible handle column count, rename input on double-click |
| `packages/ui/src/components/tasks/BucketSection.test.tsx` | Cap badge normal and over-cap classes |
| `packages/ui/src/components/tasks/AddTaskRow.test.tsx` | Enter submits, empty Enter ignored |
| `packages/store/src/api/tasksApi.test.ts` (optional) | Optimistic patch shape for reorder |

Use `@testing-library/user-event` for Enter key tests. Match existing vitest style.

---

## Task 12: Verification

Run from repo root:

```bash
pnpm build
pnpm test
pnpm lint:copy
```

Manual check with `pnpm dev:all`:

1. Sign in. Today shows tasks in three buckets.
2. Add row: type a task, Enter. It appears at bottom of Later.
3. Drag a task within Later, across to Next, into Now. Order persists after reload.
4. Now badge shows `N / 5`. Drag a sixth into Now: badge turns accent (`6 / 5`).
5. Click "Pull the next thing in?" when Now is empty: top Next task moves to Now.
6. Click checkbox: task strikes through, stays in place. Click again: restores.
7. Double-click title: rename. Right-click: menu moves bucket, unschedules, deletes
   (confirm dialog).
8. Select row: subtasks visible. "Add a subtask" works. Toggle subtask checkbox.
9. Drag handle visible without selecting row.
10. Unscheduled tab: add, reorder, schedule to today, delete.
11. First-run: Add my first task creates a Later task and leaves first-run screen.
12. ⌘N focuses add row when on Today or Unscheduled.

---

## Task 13: Roadmap

Edit `docs/plans/README.md` step 4 row: Status **Done**.

Edit this file: Status **Done**.

---

## Things most likely to go wrong

1. **Leaving `invalidatesTags` on mutations.** Drag snaps back for one frame. Remove it.
2. **Putting `{...listeners}` on the whole row.** Breaks click-to-select and checkbox.
   Listeners go on the handle only.
3. **Forgetting to patch both `getTasksForDay` and `getUnscheduledTasks` caches** when
   a drag crosses scheduled/unscheduled boundary.
4. **Sending partial lane lists to reorder.** Server expects the full ordered id list
   for every lane you touch, not just the moved task.
5. **Creating tasks in Next instead of Later.** Product decision is Later.
6. **Hand-editing `context-menu.tsx`.** Use shadcn CLI.
7. **Em-dash in dialog copy.** Run `pnpm lint:copy` before commit.
8. **Nesting buttons.** Checkbox and row selection must stop propagation correctly.
