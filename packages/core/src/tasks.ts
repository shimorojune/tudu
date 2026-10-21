import { z } from 'zod';
import { isIsoDate, type IsoDate } from './dates';
import { COMMENT_MAX, NOTES_MAX } from './notes';
import { projectColorSchema, projectNameSchema } from './projects';

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
  /** The deadline, a separate fact from the day it is planned for. */
  due: IsoDate | null;
  /** Who sees it in a team space: everyone, or only you. Personal is yours either way. */
  visibility: TaskVisibility;
  /** The project it belongs to, if any (the coloured dot). */
  projectId: string | null;
  /** Its subtasks in order, for the fold under the row; the counts are what the byline says. */
  subtasks: Subtask[];
  subsDone: number;
  subsTotal: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskVisibility = 'space' | 'me';

/** A project: a name and a muted colour, within one space. */
export interface Project {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  position: number;
  createdAt: string;
}

/** A file in object storage, as the API answers an upload. */
export interface Attachment {
  id: string;
  spaceId: string;
  taskId: string | null;
  name: string;
  size: number;
  type: string;
  createdAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  position: number;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentAuthor {
  id: string;
  name: string;
  email: string;
}

export interface Comment {
  id: string;
  taskId: string;
  author: CommentAuthor;
  /** Cleaned HTML. */
  html: string;
  createdAt: string;
  /** Set once it has been edited. */
  editedAt: string | null;
}

/** What the server records as a task changes hands and days, for the History fold. */
export type HistoryEvent =
  | { id: number; at: string; kind: 'created'; source?: 'quick-add' | null }
  | { id: number; at: string; kind: 'due.set'; due: IsoDate }
  | { id: number; at: string; kind: 'due.cleared' }
  | { id: number; at: string; kind: 'moved'; from: IsoDate | null; to: IsoDate | null }
  | { id: number; at: string; kind: 'carried'; from: IsoDate }
  | { id: number; at: string; kind: 'crossed' }
  | { id: number; at: string; kind: 'uncrossed' }
  | { id: number; at: string; kind: 'restored' };

export type HistoryKind = HistoryEvent['kind'];

/** One task in full, as the panel shows it. */
export interface TaskDetail extends Task {
  notes: string;
  subtasks: Subtask[];
  comments: Comment[];
  history: HistoryEvent[];
}

/** Where a task ref ("ME-52") points: its task and the day it is on. */
export interface TaskRefResponse {
  taskId: string;
  spaceId: string;
  day: IsoDate | null;
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
export const SUBTASK_MAX = 500;

const isoDay = z.string().refine(isIsoDate, 'Not a calendar day');
const title = z.string().trim().min(1, 'A task needs a title.').max(TITLE_MAX);
const subTitle = z.string().trim().min(1, 'A subtask needs some words.').max(SUBTASK_MAX);
const id = z.string().min(1).max(64);
const position = z.number().finite();
const notes = z.string().max(NOTES_MAX, 'Those notes are too long.');
const commentHtml = z
  .string()
  .trim()
  .min(1, 'A comment needs some words.')
  .max(COMMENT_MAX, 'That comment is too long.');
const visibility = z.enum(['space', 'me']);
const projectId = id.nullable();

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
 * | task.restore  | deleted (Undo)           |
 * | task.due      | due                      |
 * | task.notes    | notes                    |
 * | task.visibility | visibility             |
 * | subtask.*     | one subtask's title, done, position or deleted (its own clocks) |
 * | comment.*     | one comment, by its author (no clocks: the author's last word stands) |
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
      /** Quick Add can give a task its due day, project, notes and files at birth. */
      due: isoDay.nullable().optional(),
      projectId: projectId.optional(),
      notes: notes.optional(),
      /** Ids of files uploaded before the task existed; they become its attachments. */
      attachments: z.array(id).max(20).optional(),
      source: z.enum(['quick-add']).optional(),
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
  z.object({ type: z.literal('task.restore'), payload: z.object({ id }) }),
  z.object({ type: z.literal('task.due'), payload: z.object({ id, due: isoDay.nullable() }) }),
  z.object({ type: z.literal('task.notes'), payload: z.object({ id, notes }) }),
  z.object({ type: z.literal('task.visibility'), payload: z.object({ id, visibility }) }),
  z.object({ type: z.literal('task.project'), payload: z.object({ id, projectId }) }),
  z.object({
    type: z.literal('project.create'),
    payload: z.object({ id, spaceId: id, name: projectNameSchema, color: projectColorSchema.optional() }),
  }),
  z.object({
    type: z.literal('project.update'),
    payload: z.object({
      id,
      spaceId: id,
      name: projectNameSchema.optional(),
      color: projectColorSchema.optional(),
      position: position.optional(),
    }),
  }),
  z.object({ type: z.literal('project.delete'), payload: z.object({ id, spaceId: id }) }),
  z.object({
    type: z.literal('subtask.create'),
    payload: z.object({ id, taskId: id, title: subTitle, position: position.nullable() }),
  }),
  z.object({ type: z.literal('subtask.rename'), payload: z.object({ id, taskId: id, title: subTitle }) }),
  z.object({ type: z.literal('subtask.cross'), payload: z.object({ id, taskId: id, done: z.boolean() }) }),
  z.object({ type: z.literal('subtask.place'), payload: z.object({ id, taskId: id, position }) }),
  z.object({ type: z.literal('subtask.delete'), payload: z.object({ id, taskId: id }) }),
  z.object({ type: z.literal('comment.create'), payload: z.object({ id, taskId: id, html: commentHtml }) }),
  z.object({ type: z.literal('comment.edit'), payload: z.object({ id, taskId: id, html: commentHtml }) }),
  z.object({ type: z.literal('comment.delete'), payload: z.object({ id, taskId: id }) }),
]);

/** The task a mutation is about, whatever it names; a project change names its project instead. */
export function taskIdOf(m: TaskMutationBody): string {
  return 'taskId' in m.payload ? m.payload.taskId : m.payload.id;
}

export function isProjectMutation(
  m: TaskMutationBody,
): m is Extract<TaskMutationBody, { type: `project.${string}` }> {
  return m.type.startsWith('project.');
}

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

/** The live event a space's people get after any change: which days and which tasks to refresh. */
export interface TasksChangedEvent {
  spaceId: string;
  days: Array<IsoDate | null>;
  tasks: string[];
  clientId: string | null;
}

export const TASKS_CHANGED = 'tasks.changed';

/** A space's projects changed: read them again. */
export interface ProjectsChangedEvent {
  spaceId: string;
  clientId: string | null;
}
export const PROJECTS_CHANGED = 'projects.changed';
