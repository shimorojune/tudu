CREATE TYPE "public"."space_color" AS ENUM('vermilion', 'amber', 'ochre', 'moss', 'jade', 'teal', 'cobalt', 'iris', 'plum', 'rose', 'graphite', 'ink');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."org_invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."org_join_request_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."org_audit_kind" AS ENUM('org_created', 'renamed', 'color_changed', 'logo_changed', 'logo_removed', 'join_link_enabled', 'join_link_disabled', 'join_link_regenerated', 'domains_changed', 'invite_sent', 'invite_resent', 'invite_revoked', 'invite_accepted', 'join_requested', 'join_approved', 'join_declined', 'role_changed', 'member_removed', 'member_left', 'ownership_transferred', 'task_moved_in', 'task_reassigned', 'tasks_handed_over');--> statement-breakpoint
CREATE TYPE "public"."task_request_kind" AS ENUM('new_task', 'reassign', 'edit');--> statement-breakpoint
CREATE TYPE "public"."task_request_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn', 'outdated', 'returned_resolved');--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color" "space_color" DEFAULT 'vermilion' NOT NULL,
	"logo_storage_key" text,
	"join_link_enabled" boolean DEFAULT false NOT NULL,
	"join_code" text NOT NULL,
	"allowed_domains" text[] DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "orgs_join_code_unique" UNIQUE("join_code")
);--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "org_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" NOT NULL,
	"invited_by" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "org_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "org_invites_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE TABLE "org_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "org_join_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "org_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" text,
	"kind" "org_audit_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "task_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "task_request_kind" NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"status" "task_request_status" DEFAULT 'pending' NOT NULL,
	"proposal" jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"message" text,
	"decline_reason" text,
	"accepted_fields" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
UPDATE "user" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pending_request_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "request_id" uuid;--> statement-breakpoint
UPDATE "tasks" SET "scheduled_date" = NULL, "bucket" = NULL
FROM "inbox_items"
WHERE "inbox_items"."task_id" = "tasks"."id"
  AND "inbox_items"."status" = 'pending'
  AND "inbox_items"."deleted_at" IS NULL;--> statement-breakpoint
UPDATE "tasks" SET "user_id" = "inbox_items"."to_user_id"
FROM "inbox_items"
WHERE "inbox_items"."task_id" = "tasks"."id"
  AND "inbox_items"."status" = 'pending'
  AND "inbox_items"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "color_new" "space_color";--> statement-breakpoint
UPDATE "projects" SET "color_new" = CASE "color"::text
  WHEN 'ember' THEN 'vermilion'::"space_color"
  WHEN 'rust' THEN 'rose'::"space_color"
  WHEN 'clay' THEN 'amber'::"space_color"
  WHEN 'ink' THEN 'ink'::"space_color"
  WHEN 'stone' THEN 'graphite'::"space_color"
  WHEN 'moss' THEN 'moss'::"space_color"
  ELSE 'vermilion'::"space_color"
END;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "color";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "color_new" TO "color";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
DROP TYPE "public"."project_color";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_inbox_item_id_inbox_items_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "inbox_item_id";--> statement-breakpoint
DROP TABLE IF EXISTS "manager_permissions";--> statement-breakpoint
DROP TABLE IF EXISTS "inbox_items";--> statement-breakpoint
DROP TABLE IF EXISTS "manager_links";--> statement-breakpoint
DROP TABLE IF EXISTS "manager_invites";--> statement-breakpoint
DROP TYPE IF EXISTS "inbox_item_status";--> statement-breakpoint
DROP TYPE IF EXISTS "manager_invite_status";--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_join_requests" ADD CONSTRAINT "org_join_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_join_requests" ADD CONSTRAINT "org_join_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_join_requests" ADD CONSTRAINT "org_join_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_audit_log" ADD CONSTRAINT "org_audit_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_audit_log" ADD CONSTRAINT "org_audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_task_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."task_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orgs_created_by_idx" ON "orgs" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_live_uidx" ON "org_members" USING btree ("org_id","user_id") WHERE "left_at" is null;--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_pending_uidx" ON "org_invites" USING btree ("org_id","email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "org_invites_org_idx" ON "org_invites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_join_requests_pending_uidx" ON "org_join_requests" USING btree ("org_id","user_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "org_audit_log_org_created_idx" ON "org_audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "task_requests_to_status_idx" ON "task_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "task_requests_from_status_idx" ON "task_requests" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE INDEX "task_requests_task_status_idx" ON "task_requests" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_org_day_idx" ON "tasks" USING btree ("user_id","org_id","scheduled_date","bucket","position");--> statement-breakpoint
DROP INDEX IF EXISTS "projects_owner_name_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_name_uidx" ON "projects" USING btree ("user_id",lower("name")) WHERE "deleted_at" is null and "org_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_name_uidx" ON "projects" USING btree ("org_id",lower("name")) WHERE "deleted_at" is null and "org_id" is not null;--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_not_private" CHECK ("org_id" is null or "is_private" = false);
