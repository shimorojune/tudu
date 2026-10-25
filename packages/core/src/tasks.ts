import { z } from 'zod';
import { isIsoDate, type IsoDate } from './dates';
import { COMMENT_MAX, NOTES_MAX } from './notes';
import { DECLINE_REASON_MAX, REQUEST_NOTE_MAX } from './inbox';
import { projectColorSchema, projectNameSchema } from './projects';
import { JIRA_KEY_MAX, JIRA_KEY_PATTERN } from './jira';
import { personNameSchema, spaceColorSchema, spaceNameSchema } from './spaces';

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
  /** The Jira issue it is linked to ("TUDU-212"), if any. */
  jira: string | null;
  /** Whose list it is on. In a team space every page shows your own; People shows everyone's. */
  ownerId: string | null;
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
  | { id: number; at: string; kind: 'created'; source?: 'quick-add' | 'jira' | null; key?: string }
  | { id: number; at: string; kind: 'due.set'; due: IsoDate }
  | { id: number; at: string; kind: 'due.cleared' }
  | { id: number; at: string; kind: 'moved'; from: IsoDate | null; to: IsoDate | null }
  | { id: number; at: string; kind: 'carried'; from: IsoDate }
  | { id: number; at: string; kind: 'crossed' }
  | { id: number; at: string; kind: 'uncrossed' }
  | { id: number; at: string; kind: 'restored' }
  /** The task came as a request: "Sent by Meera, accepted"; or it came back: "Sent to Meera, taken back". */
  | { id: number; at: string; kind: 'accepted'; from: string }
  | { id: number; at: string; kind: 'withdrawn'; to: string }
  | { id: number; at: string; kind: 'jira.linked'; key: string }
  | { id: number; at: string; kind: 'jira.unlinked'; key: string };

export type HistoryKind = HistoryEvent['kind'];

/** One task in full, as the panel shows it. */
export interface TaskDetail extends Task {
  notes: string;
  subtasks: Subtask[];
  comments: Comment[];
  history: HistoryEvent[];
  /** Whose task it is; null when that person is gone. */
  owner: { id: string; name: string; email: string; color: string | null } | null;
}

/** Where a task ref ("ME-52") points: its task, its space (and the space's part of the address) and the day it is on. */
export interface TaskRefResponse {
  taskId: string;
  spaceId: string;
  /** `me` for Personal, the slug for a team space. */
  slug: string;
  day: IsoDate | null;
}

/** One day as the API sends it: the tasks in order and the counts the progress ring needs. */
export interface DayResponse {
  day: IsoDate;
  tasks: Task[];
  counts: { total: number; done: number };
}

/** A week as the API sends it: seven days, Monday first, and the Backlog, in one answer. */
export interface WeekResponse {
  /** The week's Monday. */
  monday: IsoDate;
  days: DayResponse[];
  backlog: Task[];
}

/** The Backlog: tasks with no day, in their order. */
export interface BacklogResponse {
  tasks: Task[];
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
const jiraKey = z
  .string()
  .max(JIRA_KEY_MAX)
  .transform((k) => k.trim().toUpperCase())
  .refine((k) => JIRA_KEY_PATTERN.test(k), 'That isn’t a Jira issue key.');

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
 * | task.jira     | the linked Jira key (link, unlink) |
 * | subtask.*     | one subtask's title, done, position or deleted (its own clocks) |
 * | comment.*     | one comment, by its author (no clocks: the author's last word stands) |
 * | me.rename     | your name (the last word stands)  |
 * | space.update  | a team space's name or colour, by an admin |
 * | project.restore | a deleted project, back on the tasks it was taken off (Undo) |
 * | all.place     | your place for a task in All spaces' own order (yours alone; the task is untouched) |
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
      /** Made from a Jira issue: linked to its key, "Created from KEY" in its history. */
      jira: jiraKey.optional(),
      source: z.enum(['quick-add', 'jira']).optional(),
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
  z.object({ type: z.literal('task.jira'), payload: z.object({ id, jira: jiraKey.nullable() }) }),
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
  z.object({ type: z.literal('project.restore'), payload: z.object({ id, spaceId: id }) }),
  /** Your name; `id` is your user id. */
  z.object({ type: z.literal('me.rename'), payload: z.object({ id, name: personNameSchema }) }),
  /** A team space's name or colour; `id` is the space. */
  z.object({
    type: z.literal('space.update'),
    payload: z.object({ id, name: spaceNameSchema.optional(), color: spaceColorSchema.optional() }),
  }),
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
  /** Send someone a task: a request in their Inbox, not a task until they accept it. */
  z.object({
    type: z.literal('request.send'),
    payload: z.object({
      id,
      spaceId: id,
      toId: id,
      title,
      note: z.string().max(REQUEST_NOTE_MAX, 'That note is too long.').optional(),
      askedDay: isoDay.nullable(),
      due: isoDay.nullable().optional(),
      projectId: projectId.optional(),
      attachments: z.array(id).max(20).optional(),
    }),
  }),
  /** Accept a request onto a day (null is the Backlog): the task is made with the id the client chose. */
  z.object({
    type: z.literal('request.accept'),
    payload: z.object({ id, taskId: id, day: isoDay.nullable() }),
  }),
  z.object({
    type: z.literal('request.decline'),
    payload: z.object({
      id,
      reason: z.string().trim().min(1, 'Say why.').max(DECLINE_REASON_MAX, 'That reason is too long.'),
    }),
  }),
  /** Take a request back (or Do it myself): a task of your own on the day, the Backlog for null. */
  z.object({
    type: z.literal('request.withdraw'),
    payload: z.object({ id, taskId: id, day: isoDay.nullable() }),
  }),
  z.object({ type: z.literal('inbox.read'), payload: z.object({ id }) }),
  z.object({ type: z.literal('inbox.unread'), payload: z.object({ id }) }),
  /** Kept for one release: clients from before the one Inbox still send it. */
  z.object({ type: z.literal('inbox.readAll'), payload: z.object({ id, spaceId: id }) }),
  /** Delete one item (requests waiting for an answer can't be). */
  z.object({ type: z.literal('inbox.delete'), payload: z.object({ id }) }),
  /** Clear all: exactly the items the client showed, so nothing that arrived since goes with them. */
  z.object({ type: z.literal('inbox.clear'), payload: z.object({ id, ids: z.array(id).min(1).max(500) }) }),
  /** Undo a delete or a Clear all. */
  z.object({ type: z.literal('inbox.restore'), payload: z.object({ id, ids: z.array(id).min(1).max(500) }) }),
  /**
   * All spaces' own order (chunk 21): where you put a task among every space's tasks on its day. `id` is the task;
   * only your place changes, never the task's position in its space. `day` must be the task's day.
   */
  z.object({
    type: z.literal('all.place'),
    payload: z.object({ id, day: isoDay.nullable(), position }),
  }),
]);

/** The task a mutation is about, whatever it names; a project change names its project instead. */
export function taskIdOf(m: TaskMutationBody): string {
  return 'taskId' in m.payload ? m.payload.taskId : m.payload.id;
}

/** A request or Inbox change: not about a task of yours (until an accept makes one). */
export function isInboxMutation(
  m: TaskMutationBody,
): m is Extract<TaskMutationBody, { type: `request.${string}` | `inbox.${string}` }> {
  return m.type.startsWith('request.') || m.type.startsWith('inbox.');
}

/** A change to All spaces' order: yours alone, no task or list of a space changes. */
export function isAllMutation(m: TaskMutationBody): m is Extract<TaskMutationBody, { type: `all.${string}` }> {
  return m.type.startsWith('all.');
}

export function isProjectMutation(
  m: TaskMutationBody,
): m is Extract<TaskMutationBody, { type: `project.${string}` }> {
  return m.type.startsWith('project.');
}

/** A change to you or to a space itself: no task, no list. */
export function isSettingsMutation(
  m: TaskMutationBody,
): m is Extract<TaskMutationBody, { type: `me.${string}` | `space.${string}` }> {
  return m.type.startsWith('me.') || m.type.startsWith('space.');
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

/** Your All spaces order changed (in another tab of yours): read the places of these days again. */
export interface AllSpacesChangedEvent {
  days: Array<IsoDate | null>;
  clientId: string | null;
}
export const ALL_SPACES_CHANGED = 'all-spaces.changed';

/** Where you put a task in All spaces, on its day (null is the Backlog). */
export interface AllSpacesPlace {
  taskId: string;
  day: IsoDate | null;
  position: number;
}

export interface AllSpacesPlacesResponse {
  places: AllSpacesPlace[];
}

/** A space's projects changed: read them again. */
export interface ProjectsChangedEvent {
  spaceId: string;
  clientId: string | null;
}
export const PROJECTS_CHANGED = 'projects.changed';
