CREATE TABLE "space_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "space_invites_token" ON "space_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "space_invites_space" ON "space_invites" USING btree ("space_id","email");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_slug" ON "spaces" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tasks_owner_day" ON "tasks" USING btree ("owner_id","space_id","day");--> statement-breakpoint
UPDATE "tasks" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL;--> statement-breakpoint
UPDATE "spaces" SET "slug" = btrim(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '-') || '-' || substr("id", 1, 4) WHERE "kind" = 'team' AND "slug" IS NULL;--> statement-breakpoint
UPDATE "user" SET "color" = (ARRAY['#3d5a80','#5b7553','#8a5a00','#7a4e7a','#2f6f6f','#a0522d','#4a6670','#6b5b3e'])[mod(abs(hashtext("id")), 8) + 1] WHERE "color" IS NULL;
