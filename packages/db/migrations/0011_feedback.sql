CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"report_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"details" jsonb,
	"screenshot_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_report" ON "feedback" USING btree ("user_id","report_id");--> statement-breakpoint
CREATE INDEX "feedback_user_created" ON "feedback" USING btree ("user_id","created_at");