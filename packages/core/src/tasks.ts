import { z } from 'zod';
import { isIsoDate, type IsoDate } from './dates';

/** A task as the API sends it. `number` (and so `ref`, "ME-58") is assigned by the server when the task is saved. */
export interface Task {
  id: string;
  spaceId: string;
  number: number | null;
  /** The task ID people see: the space's prefix and the number, "ME-58". Null until the server has saved it. */
  ref: string | null;
  title: string;
  /** The day it is planned for; null is the Backlog. */
  day: IsoDate | null;
  position: number;
  done: boolean;
  doneAt: string | null;
  /** The day an unfinished task was first carried over from; null once it is kept or moved. */
  carriedFrom: IsoDate | null;
  createdAt: string;
  updatedAt: string;
}

/** One day as the API sends it: the tasks in order and the counts the progress ring needs. */
export interface DayResponse {
  day: IsoDate;
  tasks: Task[];
  counts: { total: number; done: number };
}

/** Tasks per day for the calendar dots and the sidebar's week: { "2026-10-19": 3 }. */
export interface MarksResponse {
  marks: Record<IsoDate, number>;
}

export const TITLE_MAX = 500;

const isoDay = z.string().refine(isIsoDate, 'Not a calendar day');
const title = z.string().trim().min(1, 'A task needs a title.').max(TITLE_MAX);
const id = z.string().min(1).max(64);
const position = z.number().finite();

/**
 * The changes a client sends. Each one names the fields it writes; the server keeps, per field, the clock of the
 * last write and ignores anything older (last write wins per field):
 *
 * | type          | writes                   |
 * | ------------- | ------------------------ |
 * | task.create   | everything               |
 * | task.rename   | title                    |
 * | task.cross    | done (cross off, uncross)|
 * | task.place    | day and position, and the carried marker when the day changes (reorder, move to a day) |
 * | task.keep     | the carried marker       |
 * | task.delete   | deleted                  |
 */
export const taskMutationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task.create'),
    payload: z.object({
      id,
      spaceId: id,
      title,
      day: isoDay.nullable(),
      /** Null puts it at the end of its day (a day this client has not loaded). */
      position: position.nullable(),
    }),
  }),
  z.object({ type: z.literal('task.rename'), payload: z.object({ id, title }) }),
  z.object({ type: z.literal('task.cross'), payload: z.object({ id, done: z.boolean() }) }),
  z.object({
    type: z.literal('task.place'),
    payload: z.object({ id, day: isoDay.nullable(), position: position.nullable() }),
  }),
  z.object({ type: z.literal('task.keep'), payload: z.object({ id }) }),
  z.object({ type: z.literal('task.delete'), payload: z.object({ id }) }),
]);

export type TaskMutationBody = z.infer<typeof taskMutationSchema>;
export type TaskMutationType = TaskMutationBody['type'];

/** A mutation on the wire: its own id (so a retry never doubles it) and the client's clock when it was made. */
export const syncMutationSchema = z.intersection(
  z.object({ id, at: z.iso.datetime({ offset: true }) }),
  taskMutationSchema,
);
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const syncRequestSchema = z.object({
  /** One per open tab, so a tab can tell its own changes from everyone else's on the live stream. */
  clientId: id,
  mutations: z.array(z.unknown()).max(200),
});

export interface SyncResult {
  id: string;
  /** `ok` applied (or already applied); `rejected` will never apply, and the client undoes it. */
  status: 'ok' | 'rejected';
  /** For a rejection: 400 bad change, 403 not yours, 404 no such task, 410 deleted. */
  code?: number;
  error?: string;
}

export interface SyncResponse {
  results: SyncResult[];
  /** The rows as they are now, after the batch: one per task the batch touched. Deleted tasks are left out. */
  tasks: Task[];
  /** Tasks the batch deleted. */
  deleted: string[];
}

/** The live event a space's people get after any change: which days to refresh. */
export interface TasksChangedEvent {
  spaceId: string;
  days: Array<IsoDate | null>;
  clientId: string | null;
}

export const TASKS_CHANGED = 'tasks.changed';
