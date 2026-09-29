ALTER TABLE "orgs" ADD COLUMN "key_prefix" text;--> statement-breakpoint
CREATE TABLE "user_space_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"personal_key_prefix" text DEFAULT 'ME' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "space_key_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "space_key_prefix_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"org_id" uuid,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "task_number" integer;--> statement-breakpoint
INSERT INTO "user_space_settings" ("user_id", "personal_key_prefix")
SELECT "id", 'ME' FROM "user"
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
UPDATE "orgs"
SET "key_prefix" = UPPER(LEFT(REGEXP_REPLACE("name", '[^a-zA-Z0-9]', '', 'g'), 4))
WHERE "key_prefix" IS NULL;--> statement-breakpoint
UPDATE "orgs" SET "key_prefix" = 'ORG' WHERE "key_prefix" IS NULL OR LENGTH("key_prefix") < 2;--> statement-breakpoint
WITH ranked AS (
  SELECT "id",
    ROW_NUMBER() OVER (PARTITION BY "key_prefix" ORDER BY "created_at", "id") AS rn
  FROM "orgs"
)
UPDATE "orgs" o
SET "key_prefix" = LEFT(o."key_prefix", 3) || ranked.rn::text
FROM ranked
WHERE o."id" = ranked."id" AND ranked.rn > 1;--> statement-breakpoint
WITH numbered AS (
  SELECT "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id", "org_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS num
  FROM "tasks"
)
UPDATE "tasks" t
SET "task_number" = numbered.num
FROM numbered
WHERE t."id" = numbered."id";--> statement-breakpoint
INSERT INTO "space_key_counters" ("user_id", "org_id", "next_number")
SELECT "user_id", "org_id", COALESCE(MAX("task_number"), 0) + 1
FROM "tasks"
GROUP BY "user_id", "org_id";--> statement-breakpoint
ALTER TABLE "orgs" ALTER COLUMN "key_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "task_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_space_settings" ADD CONSTRAINT "user_space_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_key_counters" ADD CONSTRAINT "space_key_counters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_key_counters" ADD CONSTRAINT "space_key_counters_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_key_prefix_history" ADD CONSTRAINT "space_key_prefix_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_key_prefix_history" ADD CONSTRAINT "space_key_prefix_history_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_key_prefix_uidx" ON "orgs" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "space_key_counters_personal_uidx" ON "space_key_counters" USING btree ("user_id") WHERE "org_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "space_key_counters_org_uidx" ON "space_key_counters" USING btree ("org_id") WHERE "org_id" is not null;--> statement-breakpoint
CREATE INDEX "space_key_counters_user_idx" ON "space_key_counters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "space_key_prefix_history_user_idx" ON "space_key_prefix_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "space_key_prefix_history_org_idx" ON "space_key_prefix_history" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "space_key_prefix_history_prefix_idx" ON "space_key_prefix_history" USING btree ("prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_personal_number_uidx" ON "tasks" USING btree ("user_id","task_number") WHERE "org_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_org_number_uidx" ON "tasks" USING btree ("org_id","task_number") WHERE "org_id" is not null;
