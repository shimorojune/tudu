CREATE TYPE "public"."connection_state" AS ENUM('ok', 'expired');--> statement-breakpoint
CREATE TYPE "public"."connector_provider" AS ENUM('jira');--> statement-breakpoint
CREATE TABLE "connection_spaces" (
	"user_id" text NOT NULL,
	"space_id" text NOT NULL,
	"provider" "connector_provider" NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_spaces_user_id_space_id_provider_pk" PRIMARY KEY("user_id","space_id","provider")
);
--> statement-breakpoint
CREATE TABLE "connection_views" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "connector_provider" NOT NULL,
	"site" text NOT NULL,
	"token_sealed" text NOT NULL,
	"account_name" text DEFAULT '' NOT NULL,
	"account_email" text DEFAULT '' NOT NULL,
	"state" "connection_state" DEFAULT 'ok' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_links" (
	"task_id" text NOT NULL,
	"space_id" text NOT NULL,
	"provider" "connector_provider" NOT NULL,
	"key" text NOT NULL,
	"linked_by" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_task_id_provider_pk" PRIMARY KEY("task_id","provider")
);
--> statement-breakpoint
ALTER TABLE "connection_spaces" ADD CONSTRAINT "connection_spaces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_spaces" ADD CONSTRAINT "connection_spaces_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_views" ADD CONSTRAINT "connection_views_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_linked_by_user_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_views_name" ON "connection_views" USING btree ("connection_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_provider" ON "connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "task_links_space_key" ON "task_links" USING btree ("space_id","provider","key");--> statement-breakpoint
-- Data: one Jira connection per person (the newest that works, else the newest), on in every space they had
-- connected to the same site and are still in; their views merged by name; every task's key as a link.
INSERT INTO "connections" ("id", "user_id", "provider", "site", "token_sealed", "account_name", "account_email", "state", "connected_at", "synced_at", "checked_at")
SELECT DISTINCT ON ("user_id") "id", "user_id", 'jira', "site", "token_sealed", "jira_name", "jira_email", "state"::text::"connection_state", "connected_at", "synced_at", "checked_at"
FROM "jira_connections"
ORDER BY "user_id", ("state" = 'ok') DESC, "connected_at" DESC, "id";--> statement-breakpoint
INSERT INTO "connection_spaces" ("user_id", "space_id", "provider", "enabled_at")
SELECT j."user_id", j."space_id", 'jira', j."connected_at"
FROM "jira_connections" j
JOIN "connections" c ON c."user_id" = j."user_id" AND c."provider" = 'jira'
WHERE j."site" = c."site"
  AND EXISTS (SELECT 1 FROM "space_members" m WHERE m."space_id" = j."space_id" AND m."user_id" = j."user_id");--> statement-breakpoint
INSERT INTO "connection_views" ("id", "connection_id", "name", "query", "position", "created_at")
SELECT "id", "connection_id", "name", "jql", 1024 * row_number() OVER (PARTITION BY "connection_id" ORDER BY "kept" DESC, "position", "created_at"), "created_at"
FROM (
  SELECT DISTINCT ON (c."id", lower(v."name")) v."id", c."id" AS "connection_id", v."name", v."jql", v."position", v."created_at", (j."id" = c."id") AS "kept"
  FROM "jira_views" v
  JOIN "jira_connections" j ON j."id" = v."connection_id"
  JOIN "connections" c ON c."user_id" = j."user_id" AND c."provider" = 'jira'
  ORDER BY c."id", lower(v."name"), (j."id" = c."id") DESC, v."created_at"
) merged;--> statement-breakpoint
INSERT INTO "task_links" ("task_id", "space_id", "provider", "key", "linked_by", "linked_at")
SELECT t."id", t."space_id", 'jira', t."jira_key", t."owner_id",
  coalesce((SELECT max(e."at") FROM "task_events" e WHERE e."task_id" = t."id" AND e."kind"::text = 'jira.linked'), t."updated_at")
FROM "tasks" t
WHERE t."jira_key" IS NOT NULL;--> statement-breakpoint
-- History: the Jira kinds become the link kinds, with the app named in their facts.
ALTER TABLE "task_events" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."history_kind";--> statement-breakpoint
CREATE TYPE "public"."history_kind" AS ENUM('created', 'due.set', 'due.cleared', 'moved', 'carried', 'crossed', 'uncrossed', 'restored', 'accepted', 'withdrawn', 'link.added', 'link.removed');--> statement-breakpoint
UPDATE "task_events" SET "kind" = 'link.added', "data" = "data" || '{"provider":"jira"}'::jsonb WHERE "kind" = 'jira.linked';--> statement-breakpoint
UPDATE "task_events" SET "kind" = 'link.removed', "data" = "data" || '{"provider":"jira"}'::jsonb WHERE "kind" = 'jira.unlinked';--> statement-breakpoint
UPDATE "task_events" SET "data" = "data" || '{"source":"connector","provider":"jira"}'::jsonb WHERE "kind" = 'created' AND "data"->>'source' = 'jira';--> statement-breakpoint
ALTER TABLE "task_events" ALTER COLUMN "kind" SET DATA TYPE "public"."history_kind" USING "kind"::"public"."history_kind";--> statement-breakpoint
-- The Jira-only tables and column go.
DROP TABLE "jira_views" CASCADE;--> statement-breakpoint
DROP TABLE "jira_connections" CASCADE;--> statement-breakpoint
DROP INDEX "tasks_space_jira";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "jira_key";--> statement-breakpoint
DROP TYPE "public"."jira_state";
