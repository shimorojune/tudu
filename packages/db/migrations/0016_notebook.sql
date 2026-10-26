CREATE TABLE "note_links" (
	"note_id" text NOT NULL,
	"task_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_links_note_id_task_id_pk" PRIMARY KEY("note_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "notebook_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_with" text,
	"clocks" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" text,
	"title" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"position" double precision NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_with" text,
	"clocks" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "note_id" text;--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_folders" ADD CONSTRAINT "notebook_folders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_folders" ADD CONSTRAINT "notebook_folders_parent_id_notebook_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notebook_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_notebook_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."notebook_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_links_task" ON "note_links" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "notebook_folders_user_parent" ON "notebook_folders" USING btree ("user_id","parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "notebook_folders_name" ON "notebook_folders" USING btree ("user_id",coalesce("parent_id", ''),lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "notes_user_folder" ON "notes" USING btree ("user_id","folder_id","position");--> statement-breakpoint
CREATE INDEX "notes_user_updated" ON "notes" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notes_user_deleted" ON "notes" USING btree ("user_id","deleted_at");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_note" ON "attachments" USING btree ("note_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_home" CHECK (("attachments"."space_id" is null) <> ("attachments"."owner_id" is null));