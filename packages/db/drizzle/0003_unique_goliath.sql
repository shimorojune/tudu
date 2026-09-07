ALTER TYPE "public"."timeline_event_type" ADD VALUE 'description_changed' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description" text;