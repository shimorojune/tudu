CREATE TABLE "all_spaces_places" (
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"day" date,
	"position" double precision NOT NULL,
	"clock" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "all_spaces_places_user_id_task_id_pk" PRIMARY KEY("user_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "all_spaces_places" ADD CONSTRAINT "all_spaces_places_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_spaces_places" ADD CONSTRAINT "all_spaces_places_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "all_spaces_places_user_day" ON "all_spaces_places" USING btree ("user_id","day");--> statement-breakpoint
-- "all" is All spaces' address now: a team space that had it moves to the first free all-N, and the old-address
-- record for "all" goes, so /all never lands in a space.
DO $$
DECLARE
  n int := 2;
  moved int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM "spaces" WHERE "slug" = 'all') THEN
    WHILE EXISTS (SELECT 1 FROM "spaces" WHERE "slug" = 'all-' || n)
      OR EXISTS (SELECT 1 FROM "space_slugs" WHERE "slug" = 'all-' || n) LOOP
      n := n + 1;
    END LOOP;
    UPDATE "spaces" SET "slug" = 'all-' || n, "updated_at" = now() WHERE "slug" = 'all';
    moved := 1;
  END IF;
  DELETE FROM "space_slugs" WHERE "slug" = 'all';
  RAISE NOTICE 'all-spaces: % space(s) moved off the slug "all"', moved;
END $$;
