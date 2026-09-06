# Step 5: Detail pane, Comments and Timeline

Status: Done
Depends on: step 4
Blocks: step 6

## Read this first

You are working in a pnpm monorepo at `/Users/rraj/Documents/work/tudu`.

- `packages/db` holds Drizzle schema and query functions.
- `packages/shared` holds zod schemas used by client and server.
- `packages/store` holds RTK Query and the `day` slice.
- `packages/ui` holds all inspector UI. **Most of your work happens here.**
- `apps/server` mounts Hono routes. Add a new activity route; refactor task handlers
  to batch timeline writes.

Read `.cursor/rules/database.mdc`, `.cursor/rules/server-api.mdc`,
`.cursor/rules/redux-store.mdc`, and `.cursor/rules/react-ui.mdc` before you start.

### Rules you will break if you are not careful

1. **No em-dash characters (U+2014) anywhere.** `pnpm lint:copy` greps the whole
   working tree and fails the build.
2. TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`.
3. No `rounded-*` classes. Radius is `0` project-wide.
4. New UI lives in `packages/ui`. Do not add screens to `apps/desktop` or `apps/web`.
5. Cross package imports use workspace names: `@tudu/db`, `@tudu/shared`, `@tudu/store`.
   Never relative paths across packages.
6. `packages/db`, `packages/store`, and `apps/server` relative imports carry `.js`
   extensions. `packages/ui` uses `@/` with no extension.
7. **`components/ui/*` is shadcn generated.** Do not hand-edit.

## Goal

After this step:

- The inspector has three working tabs: Details, Comments, Timeline.
- Every task-level mutation from step 4 onward writes an append-only timeline row.
- Comments can be created, edited in place, and deleted (with confirm).
- The Comments tab badge shows the live `commentCount` from the task payload.
- Tab choice survives changing the selected task.
- The X on the tab strip clears the selection.
- Details shows a "Latest" two-event preview and a "Make private" footer.
- Tasks created before step 5 show a synthetic Created line from `task.createdAt`.
- Timeline loads the newest 50 events with a "Show older" button.

## Non goals

Do not build any of these. They belong to later steps.

- Attachments, file upload, drop zone, paste-to-attach. Deferred until storage exists.
- JIRA row or "Shared with" row in Details. Steps 10 and 9.
- "Marcus is notified in Tudu" footer on Comments. Step 9.
- Subtask-level timeline events (added, ticked, renamed, deleted).
- Manager-visible comments or cross-user threads. Step 9.
- Rollover-generated timeline rows. Step 6.
- Editable Details fields (bucket, dates) in the inspector. Still read-only display;
  changes continue through the task list and context menu from step 4.
- Real-time push or websockets for new comments.

## Design reference

Open the local artifact in a browser:

`file:///Users/rraj/Documents/work/tudu_designs/Tudu.artifact.html`

Upstream: https://claude.ai/code/artifact/26712a88-3eed-429a-b4ed-6bc11c15b3fa

Screens in scope:

| Screen | What to match |
|---|---|
| A1 Today | Inspector tab strip, Details fields, Latest preview block |
| A3 Comments | Comment rows, composer, avatars |
| A3 Timeline | Event grid, dots, visibility footer |

### Layout numbers

| Region | Spec |
|---|---|
| Tab strip | `h-[44px]`, `gap-[18px]`, `px-[24px]`, `text-[12.5px]`, `border-b border-hair` |
| Active tab | `font-bold shadow-[inset_0_-2px_0_var(--foreground)]`, `py-[13px]` |
| Content padding | `px-[24px] py-[22px]` |
| Title | `text-[19px] font-extrabold leading-[1.3] tracking-[-0.018em]` |
| Field grid | `grid-cols-[78px_minmax(0,1fr)] gap-x-[16px] gap-y-[13px] text-[13px]` |
| Comment avatar | 28×28px square, `text-[11.5px] font-extrabold` |
| Comment body | `text-[13.5px] leading-[1.55] text-muted-foreground` |
| Timeline grid | `grid-cols-[46px_11px_minmax(0,1fr)]`, dot 7×7px, connector 1px `border-hair` |
| Section headers | `text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint` |

### Decisions already made

See `docs/plans/README.md` step 5 decisions. Summary:

1. Attachments deferred.
2. Comments now, single-player.
3. Task-level timeline only.
4. No JIRA / Shared with rows; Latest + Make private built.
5. `commentCount` on task payload.
6. Sticky tab across task change.
7. Edit + delete comments with "edited" marker.
8. Synthetic Created for old tasks.
9. Timeline page size 50.
10. `db.batch()` for atomic writes.
11. Close X wired.
12. "Add a comment…", Enter sends, one row per change.

### Invented (recorded as deviations 15 to 24 in README)

- Attachments cut, composer copy, omitted notify footer, owner-only visibility copy,
  omitted JIRA/Shared rows, one row per change, editable comments, paging, synthetic
  Created, wired close X.

---

## Task 1: Activity schema

Create `packages/db/src/activity-schema.ts`:

```ts
import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { tasks } from "./tasks-schema.js";

export const timelineEventType = pgEnum("timeline_event_type", [
  "created",
  "renamed",
  "completed",
  "reopened",
  "moved",
  "rescheduled",
  "deadline_changed",
  "start_changed",
  "privacy_changed",
  "commented",
  "comment_edited",
  "comment_deleted",
]);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("comments_task_idx").on(table.taskId, table.createdAt),
    index("comments_author_idx").on(table.authorId),
  ],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Null means a system event (rollover rows land here in step 6). */
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: timelineEventType("type").notNull(),
    /** Structured diff. Rendered to English in the UI, never stored as prose. */
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("timeline_events_task_idx").on(table.taskId, table.createdAt),
  ],
);

export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;
export type TimelineEventRow = typeof timelineEvents.$inferSelect;
export type NewTimelineEventRow = typeof timelineEvents.$inferInsert;

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
}));

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  task: one(tasks, { fields: [timelineEvents.taskId], references: [tasks.id] }),
  actor: one(user, { fields: [timelineEvents.actorId], references: [user.id] }),
}));
```

Re-export from `packages/db/src/schema.ts`:

```ts
export * from "./activity-schema.js";
```

Run from repo root:

```bash
pnpm db:generate
```

Commit the generated SQL under `packages/db/drizzle/`. Do not edit it by hand.

---

## Task 2: Timeline diff planner (pure)

Create `packages/shared/src/timeline.ts` with event types and the diff builder.
Export from `packages/shared/src/index.ts`.

```ts
import type { Bucket } from "./tasks.js";

export const TIMELINE_EVENT_TYPES = [
  "created",
  "renamed",
  "completed",
  "reopened",
  "moved",
  "rescheduled",
  "deadline_changed",
  "start_changed",
  "privacy_changed",
  "commented",
  "comment_edited",
  "comment_deleted",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineEventDraft = {
  type: TimelineEventType;
  data: Record<string, unknown>;
};

export type TaskSnapshot = {
  title: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
  startDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  isPrivate: boolean;
};

/** Compare before and after a task patch. Returns zero or more event drafts.
    Pure: no I/O, fully unit testable. */
export function planTaskTimelineEvents(args: {
  before: TaskSnapshot;
  after: TaskSnapshot;
}): TimelineEventDraft[] {
  const { before, after } = args;
  const events: TimelineEventDraft[] = [];

  if (before.title !== after.title) {
    events.push({
      type: "renamed",
      data: { from: before.title, to: after.title },
    });
  }

  if (!before.completedAt && after.completedAt) {
    events.push({ type: "completed", data: {} });
  }
  if (before.completedAt && !after.completedAt) {
    events.push({ type: "reopened", data: {} });
  }

  if (
    before.scheduledDate !== after.scheduledDate ||
    before.bucket !== after.bucket
  ) {
    if (
      before.scheduledDate === after.scheduledDate &&
      before.bucket !== after.bucket
    ) {
      events.push({
        type: "moved",
        data: { from: before.bucket, to: after.bucket },
      });
    } else {
      events.push({
        type: "rescheduled",
        data: {
          fromDate: before.scheduledDate,
          fromBucket: before.bucket,
          toDate: after.scheduledDate,
          toBucket: after.bucket,
        },
      });
    }
  }

  if (before.startDate !== after.startDate) {
    events.push({
      type: "start_changed",
      data: { from: before.startDate, to: after.startDate },
    });
  }

  if (before.deadline !== after.deadline) {
    events.push({
      type: "deadline_changed",
      data: { from: before.deadline, to: after.deadline },
    });
  }

  if (before.isPrivate !== after.isPrivate) {
    events.push({
      type: "privacy_changed",
      data: { toPrivate: after.isPrivate },
    });
  }

  return events;
}
```

Create `packages/shared/src/timeline.test.ts` with cases for: rename only,
complete only, bucket move within same day, reschedule across days, combined
rename + complete (two events), no-op patch (zero events).

Run `pnpm --filter @tudu/shared test`.

---

## Task 3: Activity query functions

Create `packages/db/src/activity.ts`. Re-export from `packages/db/src/index.ts`.

Implement:

```ts
export type CommentWithAuthor = CommentRow & {
  author: { id: string; name: string; email: string };
};

export async function listCommentsForTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<CommentWithAuthor[]>;

export async function createComment(
  db: Db,
  userId: string,
  taskId: string,
  body: string,
): Promise<CommentWithAuthor>;

export async function updateComment(
  db: Db,
  userId: string,
  commentId: string,
  body: string,
): Promise<CommentWithAuthor | undefined>;

export async function softDeleteComment(
  db: Db,
  userId: string,
  commentId: string,
): Promise<boolean>;

export async function countCommentsForTask(
  db: Db,
  taskId: string,
): Promise<number>;

export async function listTimelineForTask(
  db: Db,
  userId: string,
  taskId: string,
  args: { before?: string; limit: number },
): Promise<TimelineEventRow[]>;

export async function insertTimelineEvents(
  db: Db,
  taskId: string,
  actorId: string | null,
  drafts: TimelineEventDraft[],
): Promise<void>;
```

Rules:

- Every query scopes through `findTaskById(db, userId, taskId)` first. Return `[]` or
  `undefined` when the task is not owned.
- Comments filter `isNull(comments.deletedAt)`, ordered `asc(comments.createdAt)`.
- Timeline has no soft delete. Order `desc(timelineEvents.createdAt)`.
- `before` is an ISO datetime cursor: return rows strictly older than that timestamp.
- `createComment` batches: insert comment + insert `{ type: "commented", data: { commentId } }`.
- `updateComment` only if `authorId === userId`. Sets `editedAt`. Batches comment
  update + `{ type: "comment_edited", data: { commentId } }`.
- `softDeleteComment` only if `authorId === userId`. Batches soft delete +
  `{ type: "comment_deleted", data: { commentId } }`.

Add a helper in the same file:

```ts
export function taskRowToSnapshot(row: TaskRow): TaskSnapshot;
```

Map `deadline` and `completedAt` with `.toISOString() ?? null`.

---

## Task 4: Batch timeline writes into task mutations

Refactor `packages/db/src/tasks.ts` so every mutating function that changes task
fields also appends timeline rows in the same `db.batch()`.

### 4a: `createTask`

After insert, batch a `created` event:

```ts
await db.batch([
  db.insert(timelineEvents).values({
    taskId: row.id,
    actorId: input.userId,
    type: "created",
    data: {},
  }),
]);
```

If the insert and event must be atomic, use a single batch with both statements.
Adjust `createTask` to build the insert as a statement, not `.returning()` first,
or batch insert + select. Simplest pattern that works on Neon:

```ts
const [row] = await db.insert(tasks).values({ ...input, position }).returning();
await insertTimelineEvents(db, row.id, input.userId, [{ type: "created", data: {} }]);
```

Accept that create + event is two round trips unless you refactor to a single batch
with a CTE. **Preferred:** one batch:

```ts
const insertTask = db.insert(tasks).values({ ...input, position }).returning();
// drizzle batch: first statement returns, second uses taskId from application layer
// Practical approach: keep insert.returning(), then batch only the timeline insert.
// Document as acceptable: create is one user action, partial failure leaves a task
// without a created row; synthetic Created UI covers it.
```

For step 5, **createTask** may use insert then `insertTimelineEvents` in sequence.
**updateTask**, **softDeleteTask**, and **reorderTasks** must use `db.batch()` when
both task write and timeline inserts happen.

### 4b: `updateTask`

Before update, load the current row. After computing `patch`, derive `after` snapshot.
Call `planTaskTimelineEvents({ before, after })`. If events exist:

```ts
const updateStmt = db.update(tasks).set(patch).where(...).returning();
// Build timeline insert statements from drafts.
await db.batch([updateStmt, ...timelineInserts]);
```

If no events (no-op patch), skip the update entirely and return the existing row.

### 4c: `softDeleteTask`

Append `{ type: "comment_deleted" }` is wrong here. Task delete does **not** write a
timeline row in step 5. The task vanishes from lists; history goes with cascade delete.
Document this in a code comment.

### 4d: `reorderTasks`

When `scheduledDate` or `bucket` changes for any placement, load each affected task's
before state, compute after from placement, plan events, batch all updates + inserts
together (same pattern as today, plus timeline inserts per moved task).

Subtask mutations (`createSubtask`, `updateSubtask`, `softDeleteSubtask`,
`reorderSubtasks`) do **not** write timeline rows in step 5.

---

## Task 5: `commentCount` on task lists

In `packages/db/src/tasks.ts`, extend `listTasksForDay`, `listUnscheduledTasks`, and
`findTaskById` to include `commentCount`.

Use a subquery or lateral join:

```ts
commentCount: sql<number>`(
  select count(*)::int from ${comments}
  where ${comments.taskId} = ${tasks.id}
  and ${comments.deletedAt} is null
)`.as("comment_count"),
```

Import `comments` from `./activity-schema.js`.

Update `apps/server/src/routes/tasks.ts` `toTask()`:

```ts
commentCount: row.commentCount,
```

Update `packages/shared/src/tasks.ts`:

```ts
commentCount: z.number().int(),
```

Add to `taskSchema` object. Update any test fixtures that construct `Task` objects.

Run `pnpm --filter @tudu/shared test` and fix breakages.

---

## Task 6: Shared activity schemas

Create `packages/shared/src/activity.ts`:

```ts
import { z } from "zod";
import { TIMELINE_EVENT_TYPES } from "./timeline.js";

export const timelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES);

export const commentAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const commentSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  authorId: z.string(),
  body: z.string(),
  editedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  author: commentAuthorSchema,
});

export type Comment = z.infer<typeof commentSchema>;

export const timelineEventSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  actorId: z.string().nullable(),
  type: timelineEventTypeSchema,
  data: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const createCommentRequestSchema = z.object({
  body: z.string().trim().min(1, "A comment needs text").max(5000),
});

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const updateCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;

export const timelineQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export type CommentsResponse = { comments: Comment[] };
export type CommentResponse = { comment: Comment };
export type TimelineResponse = {
  events: TimelineEvent[];
  hasMore: boolean;
};
```

Export from `packages/shared/src/index.ts`:

```ts
export * from "./activity.js";
export * from "./timeline.js";
```

---

## Task 7: Activity routes

Create `apps/server/src/routes/activity.ts`:

```ts
export function createActivityRoute(db: Db) {
  const app = new Hono<SessionEnv>();
  // Same auth middleware pattern as tasks.ts
  ...
  return app;
}
```

Endpoints:

| Method | Path | Handler |
|---|---|---|
| GET | `/tasks/:id/comments` | List comments for owned task |
| POST | `/tasks/:id/comments` | Create comment + timeline row |
| PATCH | `/comments/:id` | Edit own comment + timeline row |
| DELETE | `/comments/:id` | Soft delete own comment + timeline row |
| GET | `/tasks/:id/timeline` | Paginated timeline (`before`, `limit`) |

Use the same `jsonBody` / `queryParams` validator wrappers as `tasks.ts`.

For timeline GET, set `hasMore: events.length === limit` (if you got a full page,
there may be more).

Mount in `apps/server/src/index.ts`:

```ts
app.route("/", createActivityRoute(db));
```

---

## Task 8: Store - activity API and inspector tab

### 8a: `inspectorTab` in day slice

Edit `packages/store/src/slices/daySlice.ts`:

```ts
export type InspectorTab = "details" | "comments" | "timeline";

type DayState = {
  selectedDate: string;
  selectedTaskId: string | null;
  inspectorTab: InspectorTab;
};

const initialState: DayState = {
  selectedDate: todayIso(),
  selectedTaskId: null,
  inspectorTab: "details",
};

// Add reducer:
setInspectorTab(state, action: PayloadAction<InspectorTab>) {
  state.inspectorTab = action.payload;
},

// Do NOT reset inspectorTab in setSelectedDate, shiftSelectedDate, goToToday,
// or setSelectedTaskId. Tab is sticky across task change.
```

Export `setInspectorTab` from `packages/store/src/index.ts`.

Add `daySlice.test.ts` case: change task id, tab stays.

### 8b: activityApi

Create `packages/store/src/api/activityApi.ts`. Register tag types in `baseApi.ts`:

```ts
tagTypes: ["Health", "Me", "Task", "Comment", "Timeline"],
```

Endpoints:

```ts
getComments: builder.query<CommentsResponse, string>({
  query: (taskId) => `/tasks/${taskId}/comments`,
  providesTags: (_result, _err, taskId) => [{ type: "Comment", id: taskId }],
}),

createComment: builder.mutation<CommentResponse, { taskId: string; body: string }>({
  ...
  invalidatesTags: (_r, _e, { taskId }) => [
    { type: "Comment", id: taskId },
    { type: "Timeline", id: taskId },
    "Task",
  ],
}),

updateComment: builder.mutation<...>({ ... }),
deleteComment: builder.mutation<...>({ ... }),

getTimeline: builder.query<
  TimelineResponse,
  { taskId: string; before?: string }
>({
  query: ({ taskId, before }) => ({
    url: `/tasks/${taskId}/timeline`,
    params: before ? { before, limit: 50 } : { limit: 50 },
  }),
  providesTags: (_r, _e, { taskId }) => [{ type: "Timeline", id: taskId }],
  serializeQueryArgs: ({ queryArgs }) => queryArgs.taskId,
  merge: (current, incoming, { arg }) => {
    if (arg.before) {
      current.events.push(...incoming.events);
      current.hasMore = incoming.hasMore;
      return;
    }
    return incoming;
  },
  forceRefetch: ({ currentArg, previousArg }) =>
    currentArg?.before !== previousArg?.before,
}),
```

Optimistic updates on `createComment`: append to comment cache, bump `commentCount`
on the task in all Task caches via `patchAllTaskCaches` from `taskCache.ts`.

Export hooks from `packages/store/src/index.ts`.

---

## Task 9: Timeline copy renderer

Create `packages/ui/src/lib/timelineCopy.ts`:

```ts
import type { TimelineEvent } from "@tudu/shared";
import { bucketLabel } from "@/lib/buckets";

export type TimelineCopyContext = {
  viewerName: string;
  isToday: boolean;
  selectedDate: string;
};

/** Pure: turns one event + context into { timeLabel, bodyNodes }. */
export function formatTimelineEvent(
  event: TimelineEvent,
  ctx: TimelineCopyContext,
): { timeLabel: string; isSystem: boolean; parts: TimelinePart[] };

export type TimelinePart =
  | { kind: "text"; text: string; muted?: boolean; bold?: boolean; accent?: boolean }
  | { kind: "mono"; text: string };
```

Implement copy for each event type. Examples:

- `created` → system line: "Created by you"
- `renamed` → "**You** renamed this"
- `moved` → "**You** moved this from Next to **Now**" (use `bucketLabel`)
- `commented` → "**You** commented"
- `deadline_changed` → "**You** set the deadline to …"

Time column: same-day events show `HH:mm`. Older events show `d MMM` (e.g. `30 Aug`).
Use `date-fns`. Match the mockup's monospace tabular time column.

Create `packages/ui/src/lib/timelineCopy.test.ts` with one case per event type.

---

## Task 10: Inspector tab strip

Create `packages/ui/src/components/inspector/InspectorTabs.tsx`:

```tsx
export type InspectorTab = "details" | "comments" | "timeline";

export type InspectorTabsProps = {
  active: InspectorTab;
  commentCount: number;
  onChange: (tab: InspectorTab) => void;
  onClose: () => void;
};
```

Render the 44px strip matching current `DetailInspector` classes. Active tab gets the
inset underline. Comments tab shows live count in `tabular-nums text-faint`. Close
button: 15×15 X icon (lucide `X`), `margin-left: auto`, `aria-label="Close inspector"`.

Tabs are `<button type="button">`, not spans.

---

## Task 11: Details tab

Create `packages/ui/src/components/inspector/DetailsTab.tsx`.

Move the field grid, title, and `BucketReadOnly` from `DetailInspector.tsx` into this
file. Keep the same read-only display; do not add inputs.

Add **Latest** section at the bottom of the scroll area:

```tsx
<div className="mt-[22px] border-t border-hair pt-[18px]">
  <div className="flex items-center">
    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
      Latest
    </span>
    <button
      type="button"
      className="ml-auto text-[11.5px] text-muted-foreground"
      onClick={() => onJumpToTimeline()}
    >
      Full timeline
    </button>
  </div>
  {/* Two most recent events, mini timeline grid */}
</div>
```

Fetch timeline with `useGetTimelineQuery({ taskId })` (first page only). If empty and
no DB rows, show synthetic Created from `task.createdAt`. "Full timeline" calls
`onJumpToTimeline` which dispatches `setInspectorTab("timeline")`.

Add **visibility footer** above the existing chrome footer (or replace the current
30px footer on Details only):

```tsx
<div className="mt-auto flex items-center gap-[10px] border-t border-hair px-[24px] pt-[14px] text-[12px] text-muted-foreground">
  <span className="size-[5px] bg-primary" aria-hidden />
  {task.isPrivate ? "Only you can see this task" : "Only you can see this task"}
  <button
    type="button"
    className="ml-auto border border-rule px-[10px] py-[4px] text-[11.5px]"
    onClick={() => togglePrivate()}
  >
    {task.isPrivate ? "Make visible" : "Make private"}
  </button>
</div>
```

Wire `togglePrivate` to `useUpdateTaskMutation({ id: task.id, patch: { isPrivate: !task.isPrivate } })`.
Both states show owner-only copy until step 9.

Keep the bottom hint footer (`Panes drag to resize…`) on all tabs via the shell.

---

## Task 12: Comments tab

Create:

- `packages/ui/src/components/inspector/CommentsTab.tsx`
- `packages/ui/src/components/inspector/CommentRow.tsx`
- `packages/ui/src/components/inspector/CommentComposer.tsx`

### CommentsTab

- `useGetCommentsQuery(taskId)` when tab is active (or always when task selected).
- Scrollable list + composer pinned at bottom.
- Empty state: "No comments yet." centered, faint.

### CommentRow

Layout: `flex gap-[12px]`.

- Avatar: reuse `@/components/ui/avatar` with fallback initial from author name.
  You (current user): `border-[1.5px] border-rule`. Others (future): filled `bg-foreground text-card`.
- Author line: `text-[12.5px] font-bold`.
- Timestamp: `text-[11px] text-faint tabular-nums`. Append ` edited` in faint when
  `editedAt` is set.
- Body: click to edit in-place. Extract a shared `InlineEditableText` from the
  TaskRow pattern (or duplicate minimally in CommentRow). **Do not refactor TaskRow
  in step 5 unless needed**; copying the contentEditable block is fine.
- Right-click or a subtle "..." menu is optional. Minimum: click body to edit, context
  menu with Delete that opens `AlertDialog`.

Delete flow: reuse `alert-dialog` like task delete in step 4.

### CommentComposer

```tsx
<textarea
  placeholder="Add a comment…"
  className="w-full border border-rule bg-card px-[12px] py-[10px] text-[13px] ..."
/>
```

Enter sends (preventDefault), Shift+Enter newline. Send button: accent background,
`Send` label, `text-[12.5px] font-bold`. Disabled when empty.

On send: `createComment`, clear textarea.

---

## Task 13: Timeline tab

Create:

- `packages/ui/src/components/inspector/TimelineTab.tsx`
- `packages/ui/src/components/inspector/TimelineEventRow.tsx`

### TimelineTab

- Title at top: `text-[16px] font-extrabold` (A3 uses slightly smaller title than Details).
- `useGetTimelineQuery({ taskId })` for first page.
- Render events newest-first.
- If the list is empty, inject synthetic Created from `task.createdAt` at the bottom
  (oldest position).
- "Show older" button at bottom when `hasMore`. Click fetches with `before` set to
  the oldest event's `createdAt`.

### TimelineEventRow

Grid: `grid-cols-[46px_11px_minmax(0,1fr)] gap-x-[12px]`.

- Time cell: monospace, faint.
- Dot: filled for user events, hollow (`border-[1.5px] border-ghost`) for system.
- Connector line between dots except last row.
- Body from `formatTimelineEvent()`.

Visibility footer (Timeline tab only): same row as Task 11 but without duplicating
Make private on Details if you prefer it Timeline-only per mockup. **Mockup draws
visibility footer on Timeline only.** Put Make private on TimelineTab footer only;
Details gets Latest only.

---

## Task 14: Refactor DetailInspector shell

Rewrite `packages/ui/src/components/inspector/DetailInspector.tsx`:

```tsx
export function DetailInspector({ task, selectedDate }: DetailInspectorProps) {
  const dispatch = useDispatch();
  const tab = useSelector((s: RootState) => s.day.inspectorTab);

  if (!task) {
    return <DetailInspectorEmpty />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <InspectorTabs
        active={tab}
        commentCount={task.commentCount}
        onChange={(next) => dispatch(setInspectorTab(next))}
        onClose={() => dispatch(setSelectedTaskId(null))}
      />
      {tab === "details" ? (
        <DetailsTab task={task} selectedDate={selectedDate} ... />
      ) : null}
      {tab === "comments" ? <CommentsTab task={task} /> : null}
      {tab === "timeline" ? (
        <TimelineTab task={task} selectedDate={selectedDate} />
      ) : null}
      <footer className="mt-auto flex h-[30px] shrink-0 ...">
        {/* shared hint footer on every tab */}
      </footer>
    </div>
  );
}
```

Remove hardcoded `2` from the old tab strip.

---

## Task 15: Tests

Add or extend:

| File | Cases |
|---|---|
| `packages/shared/src/timeline.test.ts` | All `planTaskTimelineEvents` branches |
| `packages/ui/src/lib/timelineCopy.test.ts` | One sentence per event type |
| `packages/store/src/slices/daySlice.test.ts` | Sticky tab across task change |
| `packages/ui/src/components/inspector/InspectorTabs.test.tsx` | Renders counts, fires onChange/onClose |
| `packages/ui/src/components/inspector/CommentComposer.test.tsx` | Enter sends, Shift+Enter does not |

Update any `Task` fixtures missing `commentCount: 0`.

---

## Task 16: Verification

From repo root:

```bash
pnpm db:generate   # only if schema changed and not yet committed
pnpm lint:copy
pnpm test
pnpm build
```

Manual smoke test at `http://localhost:5173` (or desktop `1420`):

1. Select a task. Details tab shows fields and Latest preview.
2. Add a comment. Badge increments. Comment appears.
3. Click comment text, edit, see "edited". Timeline tab shows two rows.
4. Delete comment with confirm. Gone from list, timeline row added.
5. Complete task from list. Timeline shows completed row.
6. Click X. Empty inspector.
7. Select another task while on Timeline tab. Still on Timeline.
8. Toggle Make private on Timeline footer. Timeline shows privacy_changed.
9. Open a task that existed before deploy. Synthetic Created appears.
10. Task with 50+ events: "Show older" loads the next page.

Use `chrome-devtools` MCP per `.cursor/rules/ui-review.mdc` before calling step 5 done.

---

## After this step

Update `docs/plans/README.md` step 5 status to **Done**.

Step 6 adds rollover timeline rows (`Rolled over from …`). Step 9 adds manager names
to comments and visibility copy. Attachments become their own step once storage is chosen.
