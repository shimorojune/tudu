ALTER TYPE "public"."notification_kind" ADD VALUE 'reminder_focus' BEFORE 'reminder_late';--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "reminders_focus" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "reminders_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "reminders_deadline" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "reminders_slipping" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "focus_check_in_minutes" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "work_hours_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "work_hours_start" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "work_hours_end" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "work_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL;