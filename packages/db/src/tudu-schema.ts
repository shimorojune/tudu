import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
