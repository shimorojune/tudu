CREATE TABLE "jira_jql_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"jql" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jira_jql_presets" ADD CONSTRAINT "jira_jql_presets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_jql_presets_user_name_uidx" ON "jira_jql_presets" USING btree ("user_id","name") WHERE "jira_jql_presets"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_jql_presets_user_default_uidx" ON "jira_jql_presets" USING btree ("user_id") WHERE "jira_jql_presets"."is_default" = true and "jira_jql_presets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_jql_presets_user_idx" ON "jira_jql_presets" USING btree ("user_id");