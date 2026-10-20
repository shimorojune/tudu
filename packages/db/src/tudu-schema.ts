import { sql } from 'drizzle-orm';
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/** A space is its own Tudu: Personal is yours alone; a team space is shared. */
export const spaceKind = pgEnum('space_kind', ['personal', 'team']);
export const memberRole = pgEnum('member_role', ['admin', 'member']);

export const spaces = pgTable(
  'spaces',
  {
    id: text('id').primaryKey(),
    kind: spaceKind('kind').notNull(),
    name: text('name').notNull(),
    /** A muted swatch for team spaces; personal has none. */
    color: text('color'),
    /** The person a personal space belongs to; null for team spaces. */
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
    /** Task IDs read prefix and number: Personal is ME, so a task reads ME-58. */
    taskPrefix: text('task_prefix').notNull().default('ME'),
    /** The last task number given out. Taken under the row's lock, so numbers never repeat. */
    taskSeq: integer('task_seq').notNull().default(0),
    /** The last day unfinished tasks were carried forward to, so carrying happens once a day. */
    rolledTo: date('rolled_to', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('spaces_personal_owner')
      .on(t.ownerId)
      .where(sql`kind = 'personal'`),
  ],
);

export const spaceMembers = pgTable(
  'space_members',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] }), index('space_members_user').on(t.userId)],
);

/** One row per sign-in code sent, so a mailbox cannot be flooded: at most five in ten minutes. */
export const otpSends = pgTable(
  'otp_sends',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_sends_email_sent').on(t.email, t.sentAt)],
);

/**
 * The clock of the last write to each field, from the client that made it (last write wins per field).
 * `place` covers the day and the position together.
 */
export type TaskClocks = Partial<
  Record<'title' | 'done' | 'place' | 'carried' | 'deleted' | 'due' | 'notes' | 'visibility', string>
>;

export const taskVisibility = pgEnum('task_visibility', ['space', 'me']);

export const tasks = pgTable(
  'tasks',
  {
    /** Made by the client, so a task can be changed before its save has landed. */
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    /** The day it is planned for; null is the Backlog. */
    day: date('day', { mode: 'string' }),
    position: doublePrecision('position').notNull(),
    /** When it was crossed off, by the client's clock; null while it is open. */
    doneAt: timestamp('done_at', { withTimezone: true }),
    /** The day it was first carried over from, while it still carries the marker. */
    carriedFrom: date('carried_from', { mode: 'string' }),
    /** The deadline, separate from the day it is planned for. */
    dueDay: date('due_day', { mode: 'string' }),
    /** Rich text, as cleaned HTML. */
    notes: text('notes').notNull().default(''),
    /** In a team space: everyone, or only its owner. */
    visibility: taskVisibility('visibility').notNull().default('space'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    clocks: jsonb('clocks').$type<TaskClocks>().notNull().default({}),
  },
  (t) => [
    uniqueIndex('tasks_space_number').on(t.spaceId, t.number),
    index('tasks_space_day').on(t.spaceId, t.day, t.position),
  ],
);

/** The clock of the last write to each field of a subtask. */
export type SubtaskClocks = Partial<Record<'title' | 'done' | 'position' | 'deleted', string>>;

export const subtasks = pgTable(
  'subtasks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: doublePrecision('position').notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    clocks: jsonb('clocks').$type<SubtaskClocks>().notNull().default({}),
  },
  (t) => [index('subtasks_task').on(t.taskId, t.position)],
);

export const comments = pgTable(
  'comments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Cleaned HTML. */
    html: text('html').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('comments_task').on(t.taskId, t.createdAt)],
);

export const historyKind = pgEnum('history_kind', [
  'created',
  'due.set',
  'due.cleared',
  'moved',
  'carried',
  'crossed',
  'uncrossed',
  'restored',
]);

/** What happened to a task, written by the server as it applies changes, so every device reads the same history. */
export const taskEvents = pgTable(
  'task_events',
  {
    id: serial('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    kind: historyKind('kind').notNull(),
    /** The event's facts: { due }, { from, to }. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_events_task').on(t.taskId, t.id)],
);

/** Every mutation the server has applied, by its id, so a retry never applies twice. */
export const appliedMutations = pgTable('applied_mutations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
