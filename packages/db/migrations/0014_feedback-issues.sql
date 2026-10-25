ALTER TABLE "feedback" ADD COLUMN "issue_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "issue_number" integer;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "issue_url" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "issue_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "issue_claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "feedback_issue_pending" ON "feedback" USING btree ("issue_state","issue_claimed_at");