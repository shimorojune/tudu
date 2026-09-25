ALTER TABLE "jira_issue_watch_state" ADD COLUMN "assigned_to_me" boolean;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "regular_enabled" boolean;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "regular_interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "events_enabled" boolean;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "events_jira" boolean;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "events_inbox" boolean;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "events_comments" boolean;--> statement-breakpoint
UPDATE "notification_preferences" SET
  "regular_enabled" = COALESCE("reminders", true),
  "regular_interval_minutes" = CASE
    WHEN "focus_check_in_minutes" <= 22 THEN 15
    WHEN "focus_check_in_minutes" <= 45 THEN 30
    WHEN "focus_check_in_minutes" <= 90 THEN 60
    ELSE 120
  END,
  "events_enabled" = (
    COALESCE("inbox", true)
    AND COALESCE("comments", true)
    AND COALESCE("task_changes", true)
    AND COALESCE("jira", true)
    AND COALESCE("jira_assigned", true)
    AND COALESCE("jira_unassigned", true)
    AND COALESCE("jira_comment", true)
    AND COALESCE("jira_updated", true)
  ),
  "events_jira" = COALESCE("jira", true),
  "events_inbox" = COALESCE("inbox", true),
  "events_comments" = COALESCE("comments", true);--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "regular_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "regular_enabled" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "regular_interval_minutes" SET DEFAULT 60;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "regular_interval_minutes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_enabled" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_jira" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_jira" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_inbox" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_inbox" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_comments" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "events_comments" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" RENAME COLUMN "next_reminder_check_at" TO "next_regular_at";--> statement-breakpoint
UPDATE "notifications" SET "deleted_at" = now() WHERE "kind" IN (
  'reminder_digest',
  'reminder_focus',
  'reminder_late',
  'reminder_deadline'
) AND "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "inbox";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "comments";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "task_changes";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "jira";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "jira_assigned";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "jira_unassigned";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "jira_comment";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "jira_updated";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "reminders";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "reminders_focus";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "reminders_digest";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "reminders_deadline";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "reminders_slipping";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "focus_check_in_minutes";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "work_hours_enabled";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "app_update";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "quiet_hours_start";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "quiet_hours_end";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "digest_time_local";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "late_reminder_minutes";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "deadline_nudge_hours";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP COLUMN "approaching_requires_in_progress";
