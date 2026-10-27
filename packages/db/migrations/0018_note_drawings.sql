CREATE TABLE "note_drawings" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scene" jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"preview_light" text,
	"preview_dark" text,
	"rev" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"orphaned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "note_drawings" ADD CONSTRAINT "note_drawings_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_drawings" ADD CONSTRAINT "note_drawings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_drawings" ADD CONSTRAINT "note_drawings_preview_light_attachments_id_fk" FOREIGN KEY ("preview_light") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_drawings" ADD CONSTRAINT "note_drawings_preview_dark_attachments_id_fk" FOREIGN KEY ("preview_dark") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_drawings_note" ON "note_drawings" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_drawings_orphaned" ON "note_drawings" USING btree ("orphaned_at");