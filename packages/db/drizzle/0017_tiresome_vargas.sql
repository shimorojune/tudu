ALTER TYPE "public"."notification_kind" ADD VALUE 'jira_assigned';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'jira_unassigned';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'jira_comment';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'jira_updated';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'reminder_digest';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'reminder_late';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'reminder_deadline';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'app_update';--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"os_enabled" boolean DEFAULT false NOT NULL,
	"inbox" boolean DEFAULT true NOT NULL,
	"comments" boolean DEFAULT true NOT NULL,
	"task_changes" boolean DEFAULT true NOT NULL,
	"jira" boolean DEFAULT true NOT NULL,
	"jira_assigned" boolean DEFAULT true NOT NULL,
	"jira_unassigned" boolean DEFAULT true NOT NULL,
	"jira_comment" boolean DEFAULT true NOT NULL,
	"jira_updated" boolean DEFAULT true NOT NULL,
	"reminders" boolean DEFAULT true NOT NULL,
	"app_update" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"quiet_hours_start" text DEFAULT '22:00' NOT NULL,
	"quiet_hours_end" text DEFAULT '07:00' NOT NULL,
	"jira_poll_active_minutes" integer DEFAULT 3 NOT NULL,
	"jira_poll_idle_minutes" integer DEFAULT 20 NOT NULL,
	"digest_time_local" text DEFAULT '09:00' NOT NULL,
	"late_reminder_minutes" integer DEFAULT 120 NOT NULL,
	"deadline_nudge_hours" jsonb DEFAULT '[24,4]'::jsonb NOT NULL,
	"approaching_requires_in_progress" boolean DEFAULT true NOT NULL,
	"last_active_at" timestamp with time zone,
	"last_jira_poll_at" timestamp with time zone,
	"next_jira_poll_at" timestamp with time zone,
	"next_reminder_check_at" timestamp with time zone,
	"next_version_check_at" timestamp with time zone,
	"client_app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jira_issue_watch_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"issue_key" text NOT NULL,
	"assignee_account_id" text,
	"status_name" text,
	"priority_name" text,
	"due_at" timestamp with time zone,
	"summary" text,
	"description_hash" text,
	"last_comment_id" text,
	"last_comment_updated_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_delivery_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delivery_key" text NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "jira_issue_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "jira_issue_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_issue_watch_state" ADD CONSTRAINT "jira_issue_watch_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_delivery_state" ADD CONSTRAINT "reminder_delivery_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_issue_watch_user_issue_uidx" ON "jira_issue_watch_state" USING btree ("user_id","issue_id");--> statement-breakpoint
CREATE INDEX "jira_issue_watch_user_idx" ON "jira_issue_watch_state" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_delivery_user_key_uidx" ON "reminder_delivery_state" USING btree ("user_id","delivery_key");--> statement-breakpoint
CREATE INDEX "reminder_delivery_user_idx" ON "reminder_delivery_state" USING btree ("user_id");