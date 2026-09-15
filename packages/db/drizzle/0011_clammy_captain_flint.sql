ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_linked';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_unlinked';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_summary_changed';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_description_changed';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_due_date_changed';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_assignee_changed';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_commented';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'jira_external_overwrite';--> statement-breakpoint
CREATE TABLE "jira_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_key" text NOT NULL,
	"component_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_auth_tag" text NOT NULL,
	"display_name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_issue_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"issue_key" text NOT NULL,
	"comment_id" text NOT NULL,
	"author" jsonb NOT NULL,
	"body" text NOT NULL,
	"remote_created_at" timestamp with time zone NOT NULL,
	"remote_updated_at" timestamp with time zone NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"key" text NOT NULL,
	"summary" text NOT NULL,
	"description" text,
	"status_id" text NOT NULL,
	"status_name" text NOT NULL,
	"status_category" text NOT NULL,
	"issue_type" text,
	"priority" text,
	"assignee_account_id" text,
	"assignee_name" text,
	"assignee_email" text,
	"due_date" text,
	"components" jsonb NOT NULL,
	"browse_url" text NOT NULL,
	"remote_updated_at" timestamp with time zone NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_refresh_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"view_key" text NOT NULL,
	"cursor_updated_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"issue_id" text NOT NULL,
	"issue_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jira_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"user_key" text,
	"name" text,
	"display_name" text NOT NULL,
	"email_address" text,
	"active" boolean DEFAULT true NOT NULL,
	"avatar_url" text,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jira_components" ADD CONSTRAINT "jira_components_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_connections" ADD CONSTRAINT "jira_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_issue_comments" ADD CONSTRAINT "jira_issue_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_issues" ADD CONSTRAINT "jira_issues_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_projects" ADD CONSTRAINT "jira_projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_refresh_cursors" ADD CONSTRAINT "jira_refresh_cursors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_task_links" ADD CONSTRAINT "jira_task_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_task_links" ADD CONSTRAINT "jira_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_users" ADD CONSTRAINT "jira_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_components_user_project_component_uidx" ON "jira_components" USING btree ("user_id","project_key","component_id") WHERE "jira_components"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_components_user_project_idx" ON "jira_components" USING btree ("user_id","project_key");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_comments_user_issue_comment_uidx" ON "jira_issue_comments" USING btree ("user_id","issue_id","comment_id") WHERE "jira_issue_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_comments_user_issue_idx" ON "jira_issue_comments" USING btree ("user_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_issues_user_issue_uidx" ON "jira_issues" USING btree ("user_id","issue_id") WHERE "jira_issues"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_issues_user_key_uidx" ON "jira_issues" USING btree ("user_id","key") WHERE "jira_issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_issues_user_updated_idx" ON "jira_issues" USING btree ("user_id","remote_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_projects_user_key_uidx" ON "jira_projects" USING btree ("user_id","key") WHERE "jira_projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_projects_user_idx" ON "jira_projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_refresh_cursors_user_view_uidx" ON "jira_refresh_cursors" USING btree ("user_id","view_key");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_task_links_live_uidx" ON "jira_task_links" USING btree ("user_id","task_id","issue_id") WHERE "jira_task_links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_task_links_task_idx" ON "jira_task_links" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "jira_task_links_user_issue_idx" ON "jira_task_links" USING btree ("user_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_users_user_account_uidx" ON "jira_users" USING btree ("user_id","account_id") WHERE "jira_users"."account_id" is not null and "jira_users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jira_users_user_email_idx" ON "jira_users" USING btree ("user_id","email_address");