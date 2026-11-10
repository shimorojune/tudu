CREATE TABLE "github_issues" (
	"number" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"state" text NOT NULL,
	"state_reason" text,
	"locked" boolean DEFAULT false NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"embedding" vector(384),
	"embedded_text" text
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "plus_one_of" integer;--> statement-breakpoint
CREATE INDEX "github_issues_updated" ON "github_issues" USING btree ("updated_at");