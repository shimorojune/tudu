# Step 6: Rollover, carry dots, slipping

Status: Planned
Depends on: step 5
Blocks: step 7

## Read this first

You are working in a pnpm monorepo at `/Users/rraj/Documents/work/tudu`.

- `packages/shared` holds day-boundary helpers and zod schemas.
- `packages/db` holds `rollOverTasks` and the `rolled_over` enum value.
- `packages/store` holds the rollover mutation and cache invalidation.
- `packages/ui` holds banners, carry dots, and the focus hook. **Most work is here.**
- `apps/server` adds `POST /tasks/rollover`.

Read `.cursor/rules/database.mdc`, `.cursor/rules/server-api.mdc`,
`.cursor/rules/redux-store.mdc`, `.cursor/rules/react-ui.mdc`, and
`.cursor/rules/ui-review.mdc` before you start.

### Rules you will break if you are not careful

1. **No em-dash characters (U+2014) anywhere.** `pnpm lint:copy` greps the whole tree.
2. TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`.
3. No `rounded-*` classes. Radius is `0` project-wide. Carry dots use square pixels
   with `border-radius: 50%` inline only if the mockup requires circles (5×5px dots).
4. New UI lives in `packages/ui`.
5. Cross package imports use workspace names. Never relative paths across packages.
6. `packages/db`, `packages/store`, and `apps/server` relative imports carry `.js`.
7. **`components/ui/*` is shadcn generated.** Do not hand-edit.

## Goal

After this step:

- Unfinished tasks on past dates roll forward to the effective today on first app focus
  after 04:00 local, bucket preserved, carry counters updated.
- Each rolled task gets a system `rolled_over` timeline row (`actorId: null`).
- A2 recap banner shows when carried tasks landed today (dismissible, localStorage).
- A2b midnight banner shows between 00:00 and 04:00 when calendar date advanced but
  rollover has not run (with Start / Stay actions).
- Task rows show carry dots (right column, up to 3, tooltip with day count).
- Slipping tasks get accent-red dots; overdue deadlines show accent meta copy.
- "Push all to Later" demotes every carried Now task to the bottom of Later in one click.
- Manual user reschedule clears carry counters.

## Non goals

Do not build any of these. They belong to later steps.

- Server cron or background worker. Rollover is client-triggered only.
- User preferences table or editable day-start hour. Step 11.
- "Trim Now…" dialog with per-task checkboxes. Use Push all to Later instead.
- Rollover undo via Cmd+Z. Step 8.
- Manager slipping banner or "slipping" label on personal rows. Step 9 reuses helpers.
- Week view "2 carried forward" column badge. Step 7.
- Push all to Later on non-today selected dates (banner only shows on effective today).
- Rollover of Unscheduled backlog tasks (they have no `scheduledDate`).

## Design reference

Open the local artifact in a browser:

`file:///Users/rraj/Documents/work/tudu_designs/Tudu.artifact.html`

Screens in scope:

| Screen | What to match |
|---|---|
| A2 Rollover | Left-pane recap banner, carry dots in row right column, over-cap Now badge |
| A2b Past midnight | Full-width boundary banner, clock copy, Start / Stay buttons |

### A2 recap banner (left pane, above Now header)

| Property | Value |
|---|---|
| Placement | Inside task-list column, above bucket sections |
| Layout | `flex items-center gap-[16px] px-[28px] py-[13px]` |
| Background | `#f6f4f3` (use `bg-[#f6f4f3]` or nearest token) |
| Border | `border-b border-hair` |
| Left decoration | Two 5×5px ink circles, `gap-[3px]` |
| Body | `text-[13px] leading-[1.45] text-muted-foreground` |
| Emphasis | `font-bold text-foreground` for counts |
| Primary button | `text-[12.5px] font-bold text-primary-foreground bg-primary px-[12px] py-[6px]` |
| Secondary button | `text-[12.5px] text-muted-foreground border border-rule px-[12px] py-[5px]` |
| Dismiss | 14×14 X, `text-ghost`, `aria-label="Dismiss rollover recap"` |

Copy templates (no em dashes):

- Over cap: `{n} tasks came with you from yesterday, so Now holds **{nowCount} of {cap}**. Something here will slip. Decide which now, not at 17:00.`
- At cap: same without the slip sentence; no action buttons except dismiss.
- Singular: `1 task came with you…`
- Multi-day carry: `from earlier days` when not all carries are exactly one day.

Buttons when over cap: **Push all to Later**, **Keep {nowCount}**, dismiss X.

### A2b midnight banner (full width, above three panes)

| Property | Value |
|---|---|
| Placement | `TodayRoute`, above `TodayPanelLayout`, spans main content width |
| Layout | Same flex row as A2 |
| Background | `bg-card` |
| Border | `border-b-2 border-foreground` |
| Icon | 16×16 clock circle, `text-foreground` |
| Primary | **Start {calendarDay}** (rolls early) |
| Secondary | **Stay on {viewingDay}** (dismiss for tonight) |

Copy: `It's **{time} on {calendarDayName}**, and you're still on {viewingDayName}'s list. Nothing has moved.`

### Carry dots (task row, right column)

| Property | Value |
|---|---|
| Size | 5×5px each, `gap-[3px]` |
| Max | 3 dots (`min(carriedDays, 3)`) |
| Normal | `bg-foreground` |
| Slipping | `bg-primary` (accent red) |
| Tooltip | `carried {n} day` / `carried {n} days` |

Row grid becomes `grid-cols-[13px_19px_minmax(0,1fr)_auto] gap-x-[12px]`. The dots
column is always rendered (empty spacer when `carriedDays === 0`) so nothing shifts.

### Overdue meta (A2b)

Replace deadline segment with accent bold:
`overdue, was due {HH:mm}`

### Decisions already made

See `docs/plans/README.md` step 6 decisions (12 items). Deviations 25 to 30.

---

## Task 1: Shared day helpers

Create `packages/shared/src/day.ts`:

```ts
/** Hour (0-23) when the logical day starts. Step 11 makes this a preference. */
export const DAY_START_HOUR = 4;

/** Carried this many days or more counts as slipping. Step 11 may expose as preference. */
export const SLIPPING_CARRY_DAYS = 2;

/** ISO date for the logical "today" given a clock reading. Before DAY_START_HOUR the
    effective day is still yesterday. */
export function effectiveDayIso(now: Date = new Date()): string {
  const shifted = new Date(now);
  if (shifted.getHours() < DAY_START_HOUR) {
    shifted.setDate(shifted.getDate() - 1);
  }
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Calendar date (wall clock), ignoring day-start offset. */
export function calendarDayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function carriedDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function isSlipping(args: {
  carriedDays: number;
  deadline: string | null;
  now?: Date;
}): boolean {
  const { carriedDays, deadline, now = new Date() } = args;
  if (carriedDays >= SLIPPING_CARRY_DAYS) {
    return true;
  }
  if (!deadline) {
    return false;
  }
  return new Date(deadline).getTime() < now.getTime();
}

/** True between midnight and DAY_START_HOUR when calendar date > effective viewing day. */
export function isMidnightBoundary(args: {
  selectedDate: string;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  if (now.getHours() >= DAY_START_HOUR) {
    return false;
  }
  return calendarDayIso(now) > args.selectedDate;
}
```

Export from `packages/shared/src/index.ts`:

```ts
export * from "./day.js";
```

Add `packages/shared/src/day.test.ts` with fake timers covering:
- 03:59 → effective yesterday
- 04:00 → effective today
- `carriedDaysBetween("2026-09-01", "2026-09-06") === 5`
- `isSlipping` at 1 vs 2 carried days and past deadline

Run `pnpm --filter @tudu/shared test`.

---

## Task 2: `rolled_over` timeline type

Edit `packages/shared/src/timeline.ts`: add `"rolled_over"` to `TIMELINE_EVENT_TYPES`.

Edit `packages/db/src/activity-schema.ts`: add `"rolled_over"` to the `pgEnum` array.

Run:

```bash
pnpm db:generate
```

Commit the generated `packages/db/drizzle/0002_*.sql`.

Add a `formatTimelineEvent` case in `packages/ui/src/lib/timelineCopy.ts`:

```ts
case "rolled_over": {
  const from = formatIsoDate((data.from as string | null) ?? null);
  const days = data.carriedDays as number | undefined;
  const suffix =
    days && days > 1 ? `, ${days} days carried` : days === 1 ? ", first day carried" : "";
  return {
    timeLabel,
    isSystem: true,
    parts: [
      { kind: "text", text: `Rolled over from ${from}${suffix}`, muted: true },
    ],
  };
}
```

Extend `packages/ui/src/lib/timelineCopy.test.ts`.

---

## Task 3: Rollover wire types

Edit `packages/shared/src/tasks.ts`:

```ts
export const rolloverRequestSchema = z.object({
  toDate: isoDateSchema,
});

export type RolloverRequest = z.infer<typeof rolloverRequestSchema>;

export type RolloverResponse = {
  movedCount: number;
  taskIds: string[];
};
```

---

## Task 4: Pure rollover planner

Create `packages/db/src/rollover.ts` (export pure helpers first, DB function in Task 5).

```ts
import type { Bucket } from "@tudu/shared";
import { carriedDaysBetween } from "@tudu/shared";

export type RolloverCandidate = {
  id: string;
  scheduledDate: string;
  bucket: Bucket;
  position: number;
  carriedSince: string | null;
};

export type RolloverPlacement = {
  taskId: string;
  scheduledDate: string;
  bucket: Bucket;
  position: number;
  carriedDays: number;
  carriedSince: string;
};

/** Groups candidates by bucket, sorts each group by old scheduledDate then position,
    then assigns positions at the top of each bucket on toDate. */
export function planRolloverPlacements(args: {
  candidates: RolloverCandidate[];
  toDate: string;
}): RolloverPlacement[] {
  // Implementation: for each bucket, filter candidates, sort by scheduledDate asc,
  // position asc, assign positions 0..n-1 at top; existing toDate tasks in that bucket
  // shift down by candidates.length (handled in DB pass two).
}
```

Add `packages/db/src/rollover.test.ts` with cases:
- Three tasks on two past dates land in correct bucket order
- `carriedDays` recomputed from `carriedSince`
- Empty candidates → empty placements

Export from `packages/db/src/index.ts`:

```ts
export * from "./rollover.js";
```

---

## Task 5: `rollOverTasks` database function

In `packages/db/src/rollover.ts`:

```ts
export async function rollOverTasks(
  db: Db,
  userId: string,
  toDate: string,
): Promise<{ movedCount: number; taskIds: string[] }> {
  // 1. Select unfinished tasks where scheduled_date < toDate, not deleted.
  // 2. If none, return { movedCount: 0, taskIds: [] }.
  // 3. planRolloverPlacements(candidates, toDate).
  // 4. For each bucket on toDate, bump existing tasks' positions by incoming count.
  // 5. db.batch([...updates, ...timelineInserts]) where timeline rows use:
  //    type: "rolled_over", actorId: null, data: { from, to: toDate, carriedDays }.
  // 6. Return moved task ids.
}
```

Idempotency: after a successful run no rows match `scheduled_date < toDate`, so a
second call on the same day is a no-op.

Use `lt(tasks.scheduledDate, toDate)` from drizzle-orm. Skip rows where
`completedAt` is set.

Run `pnpm --filter @tudu/db test`.

---

## Task 6: Clear carry on manual reschedule

Edit `packages/db/src/activity.ts` in `applyTaskPatch` (or `updateTask` before
`applyTaskPatch`):

When `"scheduledDate" in fields` and the new date differs from `before.scheduledDate`,
and the change is not part of rollover (rollover sets carry explicitly in its own
path), set:

```ts
carriedDays: 0,
carriedSince: null,
```

Also apply when `reorderTasks` moves a task to a different `scheduledDate` via lane
change (inspect `reorderTasks` in `packages/db/src/tasks.ts` and clear carry on any
placement whose `scheduledDate` changed from the task's previous date).

Add a test in `packages/db/src/tasks.test.ts` or `rollover.test.ts`.

---

## Task 7: `POST /tasks/rollover` route

Edit `apps/server/src/routes/tasks.ts`:

```ts
app.post("/tasks/rollover", async (c) => {
  const userId = c.get("userId");
  const body = rolloverRequestSchema.parse(await c.req.json());
  const result = await rollOverTasks(db, userId, body.toDate);
  return c.json(result satisfies RolloverResponse);
});
```

Mount is already on `/` via `createTasksRoute`. Protect with the same session middleware
as other task routes.

The client sends `{ toDate: effectiveDayIso() }`. Server trusts the date string but
only rolls tasks strictly before that date for this user.

---

## Task 8: Store rollover mutation

Edit `packages/store/src/api/tasksApi.ts`:

```ts
rollover: builder.mutation<RolloverResponse, RolloverRequest>({
  query: (body) => ({ url: "/tasks/rollover", method: "POST", body }),
  invalidatesTags: (result) => [
    "Task",
    ...(result?.taskIds.map((id) => ({ type: "Timeline" as const, id })) ?? []),
  ],
}),
```

Export `useRolloverMutation` from `packages/store/src/index.ts`.

After fulfillment, if `selectedDate` in Redux is before `toDate`, dispatch
`setSelectedDate(toDate)` so the list shows the rolled-into day.

---

## Task 9: localStorage rollover state

Create `packages/ui/src/lib/rolloverState.ts`:

Keys (prefix `tudu.rollover.`):

| Key | Purpose |
|---|---|
| `lastRunEffectiveDay` | Last effective day rollover ran for |
| `dismissRecap:{isoDate}` | A2 banner dismissed for that effective day |
| `dismissMidnight:{calendarIsoDate}` | A2b dismissed for that calendar night |
| `dayOverride` | User chose "Stay on Tuesday" (stores the date to keep viewing) |

Pure functions: `readLastRun()`, `writeLastRun(iso)`, `isRecapDismissed(iso)`,
`dismissRecap(iso)`, `isMidnightDismissed(iso)`, `dismissMidnight(iso)`,
`readDayOverride()`, `writeDayOverride(iso | null)`.

Add `packages/ui/src/lib/rolloverState.test.ts` using a mock `localStorage`.

---

## Task 10: `useRolloverOnFocus` hook

Create `packages/ui/src/hooks/useRolloverOnFocus.ts`:

```ts
export function useRolloverOnFocus() {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const [rollover] = useRolloverMutation();

  const maybeRollover = useCallback(async () => {
    const now = new Date();
    const effective = effectiveDayIso(now);
    const last = readLastRun();
    if (last === effective) {
      return;
    }
    const result = await rollover({ toDate: effective }).unwrap();
    writeLastRun(effective);
    if (selectedDate < effective) {
      dispatch(setSelectedDate(effective));
    }
    return result;
  }, [dispatch, rollover, selectedDate]);

  useEffect(() => {
    void maybeRollover();
    const onFocus = () => void maybeRollover();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void maybeRollover();
      }
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [maybeRollover]);
}
```

Call from `TodayRoute` (and optionally `UnscheduledRoute` if you want rollover even
when not on Today; default: Today only).

Guard against double-fire with an in-flight ref.

---

## Task 11: `CarryDots` component

Create `packages/ui/src/components/tasks/CarryDots.tsx`:

```tsx
export type CarryDotsProps = {
  carriedDays: number;
  slipping?: boolean;
};

export function CarryDots({ carriedDays, slipping = false }: CarryDotsProps) {
  if (carriedDays <= 0) {
    return <span className="w-0 shrink-0" aria-hidden />;
  }
  const count = Math.min(carriedDays, 3);
  const dayWord = carriedDays === 1 ? "day" : "days";
  return (
    <span
      className="inline-flex shrink-0 gap-[3px] self-start pt-[6px]"
      title={`carried ${carriedDays} ${dayWord}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-[5px]",
            slipping ? "bg-primary" : "bg-foreground",
          )}
          style={{ borderRadius: "50%" }}
          aria-hidden
        />
      ))}
    </span>
  );
}
```

Note: mockup uses circles; repo rule says no `rounded-*` Tailwind classes. Inline
`borderRadius: "50%"` on the dot span is acceptable for the 5px circle shape.

Add `CarryDots.test.tsx`.

---

## Task 12: Meta line updates

Edit `packages/ui/src/lib/taskMeta.ts`:

1. Remove the `carriedDays` text segment block (lines 60-69 today).
2. Add optional `now?: Date` parameter (default `new Date()`).
3. In `formatDeadline`, when deadline is before `now` and on or before the selected
   calendar day context, return `{ text: "overdue, was due HH:mm", emphasis: true, accent: true }`.
   Extend `MetaSegment` with optional `accent?: boolean`.
4. In `TaskRow`, render accent segments with `text-primary font-bold`.

Add `packages/ui/src/lib/taskMeta.test.ts`.

---

## Task 13: TaskRow grid

Edit `packages/ui/src/components/tasks/TaskRow.tsx`:

- Change grid to `grid-cols-[13px_19px_minmax(0,1fr)_auto]`.
- After the title/meta column, render:

```tsx
<CarryDots
  carriedDays={task.carriedDays}
  slipping={isSlipping({
    carriedDays: task.carriedDays,
    deadline: task.deadline,
  })}
/>
```

Update `TaskRow.test.tsx` fixtures if needed.

---

## Task 14: `pushCarriedToLater`

Create `packages/ui/src/lib/pushCarriedToLater.ts`:

```ts
/** Returns reorder lanes that move every carried task (carriedDays > 0) currently in
    Now to the bottom of Later, preserving relative order among themselves. */
export function buildPushCarriedToLaterLanes(args: {
  tasks: Task[];
  scheduledDate: string;
}): Lane[] {
  // 1. Partition today's tasks by bucket.
  // 2. nowIds = tasks in Now; carriedIds = nowIds.filter(id => task.carriedDays > 0).
  // 3. laterIds = Later tasks minus reorder: append carriedIds to end of laterIds.
  // 4. Return lanes for Now (without carried) and Later (with carried appended).
}
```

Add `pushCarriedToLater.test.ts`.

Wire in `RolloverBanner`: on primary click, call `useReorderTasksMutation` with the
lanes from this helper, then `dismissRecap(effectiveDay)`.

---

## Task 15: `RolloverBanner` (A2)

Create `packages/ui/src/components/today/RolloverBanner.tsx`.

Props:

```ts
type RolloverBannerProps = {
  tasks: Task[];
  effectiveDay: string;
  nowSoftCap?: number;
  onPushAllToLater: () => void;
  onDismiss: () => void;
};
```

Derive:

- `carriedTasks = tasks.filter(t => t.carriedDays > 0)`
- `carriedCount = carriedTasks.length`
- `nowCount = tasks.filter(t => t.bucket === "now" && !t.completedAt).length`
- `overCap = nowCount > nowSoftCap`
- `allOneDay = carriedTasks.every(t => t.carriedDays === 1)` for copy variant

Hide when `carriedCount === 0` or `isRecapDismissed(effectiveDay)`.

Mount in `TodayRoute` inside the task-list column wrapper, above `DayTaskList`:

```tsx
<div className="flex h-full min-h-0 flex-col bg-card">
  <RolloverBanner ... />
  <DayTaskList ... />
</div>
```

Only show when `selectedDate === effectiveDayIso()`.

Add `RolloverBanner.test.tsx`.

---

## Task 16: `MidnightBanner` (A2b)

Create `packages/ui/src/components/today/MidnightBanner.tsx`.

Show when:

- `isMidnightBoundary({ selectedDate, now })`
- Not `isMidnightDismissed(calendarDayIso(now))`
- User has not clicked Stay (or override matches selectedDate)

Actions:

- **Start {day}**: call `maybeRollover()` immediately with `toDate = calendarDayIso()`,
  clear day override, dismiss midnight banner.
- **Stay on {day}**: `writeDayOverride(selectedDate)`, `dismissMidnight(...)`.
- **X**: dismiss only.

Mount in `TodayRoute` above `TodayPanelLayout`:

```tsx
return (
  <div className="flex h-full min-h-0 flex-col">
    <MidnightBanner ... />
    <TodayPanelLayout ... />
  </div>
);
```

Time in copy updates every minute via `useEffect` + `setInterval` (or render from
`new Date()` on each tick). Format: `HH:mm on EEEE` using date-fns.

Add `MidnightBanner.test.tsx` with fake timers.

---

## Task 17: Wire `TodayRoute`

Edit `packages/ui/src/routes/TodayRoute.tsx`:

1. Call `useRolloverOnFocus()`.
2. Compute `effectiveDay = effectiveDayIso()`.
3. Pass banner props and handlers.
4. On successful rollover refetch, day query updates automatically via tag invalidation.

Ensure rollover does not run on the first-run empty state (guard: skip when
`isFirstRun`).

---

## Task 18: Tests summary

| File | Cases |
|---|---|
| `packages/shared/src/day.test.ts` | effectiveDayIso, carriedDaysBetween, isSlipping, isMidnightBoundary |
| `packages/db/src/rollover.test.ts` | planRolloverPlacements, idempotent rollOverTasks shape |
| `packages/ui/src/lib/taskMeta.test.ts` | overdue segment, no carried text |
| `packages/ui/src/lib/pushCarriedToLater.test.ts` | lane builder |
| `packages/ui/src/lib/rolloverState.test.ts` | dismiss keys |
| `packages/ui/src/lib/timelineCopy.test.ts` | rolled_over sentence |
| `packages/ui/src/components/tasks/CarryDots.test.tsx` | 1/2/3 dots, slipping color |
| `packages/ui/src/components/today/RolloverBanner.test.tsx` | copy variants, over cap buttons |
| `packages/ui/src/components/today/MidnightBanner.test.tsx` | visibility window |

Update any `Task` test fixtures that need `carriedDays: 0, carriedSince: null`.

---

## Task 19: Verification

From repo root:

```bash
pnpm db:generate   # if 0002 migration not yet committed
pnpm lint:copy
pnpm test
pnpm build
```

### Browser verification (mandatory)

Per `.cursor/rules/ui-review.mdc`, use `chrome-devtools` MCP at
`http://localhost:5173` or desktop `http://localhost:1420`.

**Reach A2b without waiting for midnight:** temporarily set `DAY_START_HOUR = 23` in
`packages/shared/src/day.ts`, restart dev, set system clock or use fake timers in the
browser evaluate step so local hour is 22:00 on a date after `selectedDate`. Confirm
midnight banner appears. Revert `DAY_START_HOUR` to `4` before committing.

**A2 recap smoke:**

1. Seed tasks on yesterday via API with mixed buckets (unfinished).
2. Focus the window after 04:00 (or with `DAY_START_HOUR` temporarily lowered).
3. Tasks appear on today with carry dots.
4. Banner shows count and Now cap; Push all to Later demotes carried Now tasks.
5. Dismiss banner; reload; stays dismissed for today.
6. Timeline shows `Rolled over from …` system rows.

**Slipping / overdue:**

1. Task with `carriedDays >= 2` shows red dots.
2. Task with past deadline shows `overdue, was due …` in meta.

**Console:** no errors during rollover mutation and banner interactions.

---

## After this step

Step 7 adds the week grid and drag-to-reschedule. Rollover's carry dots and slipping
helpers are reused on week cards. Step 11 replaces `DAY_START_HOUR` with a stored
preference without changing rollover logic.
