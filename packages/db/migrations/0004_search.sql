ALTER TABLE "tasks" ADD COLUMN "notes_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "notes_text" = btrim(regexp_replace(regexp_replace("notes", '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')) WHERE "notes" <> '';
