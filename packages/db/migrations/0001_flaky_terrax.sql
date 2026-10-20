CREATE TABLE "applied_mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"day" date,
	"position" double precision NOT NULL,
	"done_at" timestamp with time zone,
	"carried_from" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"clocks" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "task_prefix" text DEFAULT 'ME' NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "task_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "rolled_to" date;--> statement-breakpoint
ALTER TABLE "applied_mutations" ADD CONSTRAINT "applied_mutations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_space_number" ON "tasks" USING btree ("space_id","number");--> statement-breakpoint
CREATE INDEX "tasks_space_day" ON "tasks" USING btree ("space_id","day","position");