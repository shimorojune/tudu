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
    /** The part of the address a team space answers to ("northwind"); Personal has none and answers to "me". */
    slug: text('slug'),
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
    uniqueIndex('spaces_slug').on(t.slug),
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

/** An invitation to a team space, sent by email with a join link; the token is the link. */
export const spaceInvites = pgTable(
  'space_invites',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: memberRole('role').notNull().default('member'),
    token: text('token').notNull(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('space_invites_token').on(t.token),
    index('space_invites_space').on(t.spaceId, t.email),
  ],
);

/** Every slug a space answered to before a rename, so old links still land. */
export const spaceSlugs = pgTable('space_slugs', {
  slug: text('slug').primaryKey(),
  spaceId: text('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leftHow = pgEnum('left_how', ['left', 'removed']);

/**
 * Someone who was in a space and is not any more: their shared tasks stay, marked Left on People. `undo` holds
 * what leaving changed (Only-me tasks deleted, requests declined, the answers that told the senders), so Undo of a
 * Remove can put it back.
 */
export const formerMembers = pgTable(
  'former_members',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }).notNull().defaultNow(),
    how: leftHow('how').notNull(),
    by: text('by').references(() => user.id, { onDelete: 'set null' }),
    undo: jsonb('undo')
      .$type<{ tasks: string[]; requests: string[]; answers: string[] }>()
      .notNull()
      .default({ tasks: [], requests: [], answers: [] }),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

/** A change of email waiting for the code sent to the new address. One at a time per person. */
export const emailChanges = pgTable('email_changes', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  Record<
    'title' | 'done' | 'place' | 'carried' | 'deleted' | 'due' | 'notes' | 'visibility' | 'project' | 'jira',
    string
  >
>;

/** A project: a name and a muted colour within one space; the coloured dot on a task. */
export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    position: doublePrecision('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** The tasks a delete took the project off, so Undo can give it back to them. */
    detached: jsonb('detached').$type<string[]>().notNull().default([]),
  },
  (t) => [index('projects_space').on(t.spaceId, t.position)],
);

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
    /** The notes' words alone, kept beside the HTML so search reads text, never markup. */
    notesText: text('notes_text').notNull().default(''),
    /** In a team space: everyone, or only its owner. */
    visibility: taskVisibility('visibility').notNull().default('space'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** The Jira issue it is linked to ("TUDU-212"); kept as words when Jira is disconnected. */
    jiraKey: text('jira_key'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    /** Whose list it is on. In a team space every page shows your own tasks; People shows everyone's. */
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    clocks: jsonb('clocks').$type<TaskClocks>().notNull().default({}),
  },
  (t) => [
    uniqueIndex('tasks_space_number').on(t.spaceId, t.number),
    index('tasks_space_day').on(t.spaceId, t.day, t.position),
    index('tasks_owner_day').on(t.ownerId, t.spaceId, t.day),
    index('tasks_space_jira')
      .on(t.spaceId, t.jiraKey)
      .where(sql`jira_key IS NOT NULL`),
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
  'accepted',
  'withdrawn',
  'jira.linked',
  'jira.unlinked',
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

/** A file in object storage. Uploaded before or after its task exists; swept when nothing refers to it. */
export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    /** The object key in the bucket. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    type: text('type').notNull(),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attachments_task').on(t.taskId),
    index('attachments_space_created').on(t.spaceId, t.createdAt),
  ],
);

export const requestState = pgEnum('request_state', ['waiting', 'accepted', 'declined', 'withdrawn']);

/** A task someone sent: its own row while it waits; accepting makes the task, declining makes none. */
export const requests = pgTable(
  'requests',
  {
    /** Made by the client, so Send works offline and never doubles. */
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    fromId: text('from_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** The sender's note, plain words. */
    note: text('note').notNull().default(''),
    /** The day the sender asked for; null for none. */
    askedDay: date('asked_day', { mode: 'string' }),
    dueDay: date('due_day', { mode: 'string' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** Files sent along; they join the task on accept. */
    attachments: jsonb('attachments').$type<string[]>().notNull().default([]),
    state: requestState('state').notNull().default('waiting'),
    reason: text('reason'),
    seenAt: timestamp('seen_at', { withTimezone: true }),
    /** The task it became (accepted), or the one Take it back made. */
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => [
    index('requests_to').on(t.toId, t.spaceId, t.state),
    index('requests_from').on(t.fromId, t.spaceId),
  ],
);

export const inboxKind = pgEnum('inbox_kind', ['request', 'comment', 'answer']);

/** One thing in someone's Inbox: a request to answer, a comment on their task, an answer to a request they sent. */
export const inboxItems = pgTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    kind: inboxKind('kind').notNull(),
    requestId: text('request_id').references(() => requests.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    commentId: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inbox_items_user').on(t.userId, t.spaceId, t.createdAt)],
);

export const jiraState = pgEnum('jira_state', ['ok', 'expired']);

/**
 * Your Jira in one space: the site and a personal access token, encrypted (AES-256-GCM, a key derived from
 * AUTH_SECRET). One per person per space; a colleague connects their own.
 */
export const jiraConnections = pgTable(
  'jira_connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    /** The Jira address without a trailing slash, "https://jira.northwind.io". */
    site: text('site').notNull(),
    /** The token, sealed: never sent back, never logged. */
    tokenSealed: text('token_sealed').notNull(),
    /** Who the token is in Jira (its name and email), from Jira's own answer. */
    jiraName: text('jira_name').notNull().default(''),
    jiraEmail: text('jira_email').notNull().default(''),
    state: jiraState('state').notNull().default('ok'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    /** The last time Jira answered a read. */
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    /** The last time Tudu asked Jira anything, answered or not. */
    checkedAt: timestamp('checked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('jira_connections_user_space').on(t.userId, t.spaceId)],
);

/** A saved JQL view in the Views menu. It belongs to its connection and goes with it. */
export const jiraViews = pgTable(
  'jira_views',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => jiraConnections.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    jql: text('jql').notNull(),
    position: doublePrecision('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('jira_views_name').on(t.connectionId, t.name)],
);

/** Every mutation the server has applied, by its id, so a retry never applies twice. */
export const appliedMutations = pgTable('applied_mutations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
