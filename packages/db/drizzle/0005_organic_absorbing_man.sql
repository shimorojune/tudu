CREATE TYPE "public"."inbox_item_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."manager_invite_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'inbox_sent';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'inbox_accepted';--> statement-breakpoint
ALTER TYPE "public"."timeline_event_type" ADD VALUE 'inbox_declined';--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" "inbox_item_status" DEFAULT 'pending' NOT NULL,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "manager_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_user_id" text NOT NULL,
	"report_email" text NOT NULL,
	"report_user_id" text,
	"status" "manager_invite_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "manager_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_user_id" text NOT NULL,
	"report_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "manager_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_link_id" uuid NOT NULL,
	"can_see_day" boolean DEFAULT true NOT NULL,
	"can_send_inbox" boolean DEFAULT true NOT NULL,
	"can_comment" boolean DEFAULT true NOT NULL,
	"can_reorder" boolean DEFAULT true NOT NULL,
	"can_delete" boolean DEFAULT true NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_complete" boolean DEFAULT false NOT NULL,
	"can_see_private" boolean DEFAULT false NOT NULL,
	"can_edit_deadlines" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manager_permissions_manager_link_id_unique" UNIQUE("manager_link_id")
);
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_invites" ADD CONSTRAINT "manager_invites_inviter_user_id_user_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_invites" ADD CONSTRAINT "manager_invites_report_user_id_user_id_fk" FOREIGN KEY ("report_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_links" ADD CONSTRAINT "manager_links_manager_user_id_user_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_links" ADD CONSTRAINT "manager_links_report_user_id_user_id_fk" FOREIGN KEY ("report_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_permissions" ADD CONSTRAINT "manager_permissions_manager_link_id_manager_links_id_fk" FOREIGN KEY ("manager_link_id") REFERENCES "public"."manager_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_items_to_status_idx" ON "inbox_items" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "inbox_items_task_idx" ON "inbox_items" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_invites_pending_uidx" ON "manager_invites" USING btree ("inviter_user_id","report_email") WHERE "manager_invites"."status" = 'pending' and "manager_invites"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "manager_invites_email_idx" ON "manager_invites" USING btree ("report_email");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_links_one_manager_uidx" ON "manager_links" USING btree ("report_user_id") WHERE "manager_links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "manager_links_manager_idx" ON "manager_links" USING btree ("manager_user_id");