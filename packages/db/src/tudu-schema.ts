import { sql } from 'drizzle-orm';
import {
  check,
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
  vector,
} from 'drizzle-orm/pg-core';
import { CONNECTOR_PROVIDERS, type ConnectorProvider } from '@tudu/core';
import { user } from './auth-schema';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/** How many numbers the embedding model answers with (all-MiniLM-L6-v2). A model of another width is a migration. */
export const EMBEDDING_DIMENSIONS = 384;

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
    | 'title'
    | 'done'
    | 'place'
    | 'carried'
    | 'deleted'
    | 'due'
    | 'notes'
    | 'visibility'
    | 'project'
    /** A link to an outside issue, one clock per connector (its provider's name). */
    | ConnectorProvider,
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
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    /** Whose list it is on. In a team space every page shows your own tasks; People shows everyone's. */
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    clocks: jsonb('clocks').$type<TaskClocks>().notNull().default({}),
    /**
     * What the task means (chunk 13): a vector from its title and the first of its notes, for close matches. Null
     * until the embedder has seen it; nulled again by any write that changes the title or the notes.
     */
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    /** The exact text the vector was made from, so a change to the words is a change to the vector. */
    embeddedText: text('embedded_text'),
  },
  (t) => [
    uniqueIndex('tasks_space_number').on(t.spaceId, t.number),
    index('tasks_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('tasks_space_day').on(t.spaceId, t.day, t.position),
    index('tasks_owner_day').on(t.ownerId, t.spaceId, t.day),
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
  'link.added',
  'link.removed',
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

/**
 * A file in object storage. Uploaded before or after its task exists; swept when nothing refers to it. A file in
 * your Notebook (chunk 22) has no space: it is its owner's alone (`owner_id`), kept while a note refers to it.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
    noteId: text('note_id').references((): AnyPgColumn => notes.id, { onDelete: 'set null' }),
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
    index('attachments_note').on(t.noteId),
    check('attachments_one_home', sql`(${t.spaceId} is null) <> (${t.ownerId} is null)`),
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

export const inboxKind = pgEnum('inbox_kind', ['request', 'comment', 'answer', 'invite', 'notice']);

/** Why a notice is in the Inbox: you were taken out of a space, or the space itself went. */
export interface InboxNotice {
  type: 'removed' | 'deleted';
  /** Who did it, by name, when known. */
  by: string | null;
}

/**
 * One thing in someone's Inbox: a request to answer, a comment on their task, an answer to a request they sent, an
 * invite to a space, or a notice that a space went. One Inbox across every space (chunk 08, unified Inbox): a
 * notice outlives its space, so `space_id` is set null when the space is deleted and `space_name` keeps its name.
 */
export const inboxItems = pgTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: text('space_id').references(() => spaces.id, { onDelete: 'set null' }),
    /** The space's name when the item was made, for when the space is gone. */
    spaceName: text('space_name'),
    kind: inboxKind('kind').notNull(),
    requestId: text('request_id').references(() => requests.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    commentId: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    inviteId: text('invite_id').references(() => spaceInvites.id, { onDelete: 'cascade' }),
    notice: jsonb('notice').$type<InboxNotice>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    /** Deleted or cleared by its person; Undo puts it back. Swept after 30 days. */
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inbox_items_user').on(t.userId, t.spaceId, t.createdAt),
    index('inbox_items_user_cleared').on(t.userId, t.clearedAt, t.createdAt),
    uniqueIndex('inbox_items_invite').on(t.userId, t.inviteId),
  ],
);

/** The apps a person can connect (Jira first). A second one is a new value here and its adapter on the server. */
export const connectorProvider = pgEnum('connector_provider', CONNECTOR_PROVIDERS);
export const connectionState = pgEnum('connection_state', ['ok', 'expired']);

/**
 * Your connection to an app, for your account: the site and a personal access token, encrypted (AES-256-GCM, a
 * key derived from AUTH_SECRET). One per person per app, used in every space where you turn it on; a colleague
 * connects their own. Nobody else's reads ever go through it.
 */
export const connections = pgTable(
  'connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: connectorProvider('provider').notNull(),
    /** The app's address without a trailing slash, "https://jira.northwind.io". */
    site: text('site').notNull(),
    /** The token, sealed: never sent back, never logged. */
    tokenSealed: text('token_sealed').notNull(),
    /** Who the token is in the app (its name and email), from the app's own answer. */
    accountName: text('account_name').notNull().default(''),
    accountEmail: text('account_email').notNull().default(''),
    state: connectionState('state').notNull().default('ok'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    /** The last time the app answered a read. */
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    /** The last time Tudu asked the app anything, answered or not. */
    checkedAt: timestamp('checked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('connections_user_provider').on(t.userId, t.provider)],
);

/**
 * Where you turned an app on: a row is on, no row is off. Yours alone; a new space, one you join and one you come
 * back to all start off. Leaving a space (or being removed) deletes its rows.
 */
export const connectionSpaces = pgTable(
  'connection_spaces',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    provider: connectorProvider('provider').notNull(),
    enabledAt: timestamp('enabled_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.spaceId, t.provider] })],
);

/** A saved view in the Views menu (JQL, for Jira). It belongs to its connection and goes with it. */
export const connectionViews = pgTable(
  'connection_views',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    query: text('query').notNull(),
    position: doublePrecision('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('connection_views_name').on(t.connectionId, t.name)],
);

/**
 * A task linked to an outside issue ("TUDU-212" in Jira): only the key, as words. One per app per task. Its
 * details are always read with the viewer's own connection, never the linker's.
 */
export const taskLinks = pgTable(
  'task_links',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** The task's space, kept here so a space's links are one index away. */
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    provider: connectorProvider('provider').notNull(),
    key: text('key').notNull(),
    linkedBy: text('linked_by').references(() => user.id, { onDelete: 'set null' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.provider] }),
    index('task_links_space_key').on(t.spaceId, t.provider, t.key),
  ],
);

/** Every mutation the server has applied, by its id, so a retry never applies twice. */
/**
 * All spaces' own order (chunk 21), one person's: where they put a task among the tasks of every space. A row only
 * counts while its `day` is still the task's day, so a task moved elsewhere falls back to "no place" by itself.
 */
export const allSpacesPlaces = pgTable(
  'all_spaces_places',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** The day the place was given on; null is the Backlog. */
    day: date('day', { mode: 'string' }),
    position: doublePrecision('position').notNull(),
    /** The client's clock of the last place (last write wins). */
    clock: timestamp('clock', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.taskId] }),
    index('all_spaces_places_user_day').on(t.userId, t.day),
  ],
);

export const appliedMutations = pgTable('applied_mutations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Send feedback (chunk 19): a bug or an idea, its words, the app details when the person left them on, and the
 * screenshot's object key (under `feedback/`, outside any space). `report_id` is the client's, so a retry is one row.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reportId: text('report_id').notNull(),
    kind: text('kind', { enum: ['bug', 'idea'] }).notNull(),
    text: text('text').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    screenshotKey: text('screenshot_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Its public GitHub issue: `none` (not filed: no token, or sent before issues), `pending` (waiting for GitHub;
     * the sweep retries), `filed` (number and url set) or `failed` (gave up; the mail has it).
     */
    issueState: text('issue_state', { enum: ['none', 'pending', 'filed', 'failed'] })
      .notNull()
      .default('none'),
    issueNumber: integer('issue_number'),
    issueUrl: text('issue_url'),
    issueAttempts: integer('issue_attempts').notNull().default(0),
    /** When a request or the sweep last took it to file, so two never file it at once. */
    issueClaimedAt: timestamp('issue_claimed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('feedback_report').on(t.userId, t.reportId),
    index('feedback_user_created').on(t.userId, t.createdAt),
    index('feedback_issue_pending').on(t.issueState, t.issueClaimedAt),
  ],
);

/** The clock of the last write to each field of a folder or a note (last write wins per field). */
export type NotebookClocks = Partial<Record<'name' | 'title' | 'place' | 'deleted', string>>;

/**
 * Your Notebook's folders (chunk 22): yours alone, three levels deep at most (checked on the server). A folder in
 * Trash has `deleted_at`; what went with it carries its id in `deleted_with`, so putting it back brings exactly that.
 */
export const notebookFolders = pgTable(
  'notebook_folders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => notebookFolders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: doublePrecision('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedWith: text('deleted_with'),
    clocks: jsonb('clocks').$type<NotebookClocks>().notNull().default({}),
  },
  (t) => [
    index('notebook_folders_user_parent').on(t.userId, t.parentId, t.position),
    // Two live folders in one place never share a name, whatever the case.
    uniqueIndex('notebook_folders_name')
      .on(t.userId, sql`coalesce(${t.parentId}, '')`, sql`lower(${t.name})`)
      .where(sql`deleted_at is null`),
  ],
);

/** A note: its title, its words as cleaned HTML and as text (search, the first line), and its body's rev. */
export const notes = pgTable(
  'notes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => notebookFolders.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    html: text('html').notNull().default(''),
    text: text('text').notNull().default(''),
    position: doublePrecision('position').notNull(),
    /** +1 for every body save; a save written on an older rev is turned down (stale), never merged. */
    rev: integer('rev').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedWith: text('deleted_with'),
    clocks: jsonb('clocks').$type<NotebookClocks>().notNull().default({}),
  },
  (t) => [
    index('notes_user_folder').on(t.userId, t.folderId, t.position),
    index('notes_user_updated').on(t.userId, t.updatedAt.desc()),
    index('notes_user_deleted').on(t.userId, t.deletedAt),
  ],
);

/**
 * A note linked to a task. No user here: the link is the note's, and the note its owner's. Read only through the
 * owner's routes, and only for tasks the owner can still read.
 */
export const noteLinks = pgTable(
  'note_links',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.taskId] }), index('note_links_task').on(t.taskId)],
);
