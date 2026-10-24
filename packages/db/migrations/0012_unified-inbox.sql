ALTER TYPE "public"."inbox_kind" ADD VALUE 'invite';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE 'notice';--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_space_id_spaces_id_fk";
--> statement-breakpoint
ALTER TABLE "inbox_items" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "space_name" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "invite_id" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "notice" jsonb;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_invite_id_space_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."space_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_items_user_cleared" ON "inbox_items" USING btree ("user_id","cleared_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_invite" ON "inbox_items" USING btree ("user_id","invite_id");--> statement-breakpoint
UPDATE "inbox_items" SET "space_name" = "spaces"."name" FROM "spaces" WHERE "spaces"."id" = "inbox_items"."space_id";
