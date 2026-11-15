ALTER TYPE "public"."history_kind" ADD VALUE 'time.set';--> statement-breakpoint
ALTER TYPE "public"."history_kind" ADD VALUE 'time.cleared';--> statement-breakpoint
ALTER TYPE "public"."history_kind" ADD VALUE 'span.set';--> statement-breakpoint
ALTER TYPE "public"."history_kind" ADD VALUE 'span.cleared';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "due_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "end_day" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "start_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "places" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_space_end_day" ON "tasks" USING btree ("space_id","end_day");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_span_after_day" CHECK ("tasks"."end_day" IS NULL OR ("tasks"."day" IS NOT NULL AND "tasks"."end_day" > "tasks"."day"));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_time_pair" CHECK (("tasks"."start_time" IS NULL) = ("tasks"."end_time" IS NULL));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_time_needs_day" CHECK ("tasks"."start_time" IS NULL OR "tasks"."day" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_time_needs_day" CHECK ("tasks"."due_time" IS NULL OR "tasks"."due_day" IS NOT NULL);