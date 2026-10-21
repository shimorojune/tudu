CREATE TYPE "public"."jira_state" AS ENUM('ok', 'expired');--> statement-breakpoint
ALTER TYPE "public"."history_kind" ADD VALUE 'jira.linked';--> statement-breakpoint
ALTER TYPE "public"."history_kind" ADD VALUE 'jira.unlinked';--> statement-breakpoint
CREATE TABLE "jira_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"space_id" text NOT NULL,
	"site" text NOT NULL,
	"token_sealed" text NOT NULL,
	"jira_name" text DEFAULT '' NOT NULL,
	"jira_email" text DEFAULT '' NOT NULL,
	"state" "jira_state" DEFAULT 'ok' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_views" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"name" text NOT NULL,
	"jql" text NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "jira_key" text;--> statement-breakpoint
ALTER TABLE "jira_connections" ADD CONSTRAINT "jira_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_connections" ADD CONSTRAINT "jira_connections_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_views" ADD CONSTRAINT "jira_views_connection_id_jira_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."jira_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_connections_user_space" ON "jira_connections" USING btree ("user_id","space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_views_name" ON "jira_views" USING btree ("connection_id","name");--> statement-breakpoint
CREATE INDEX "tasks_space_jira" ON "tasks" USING btree ("space_id","jira_key") WHERE jira_key IS NOT NULL;