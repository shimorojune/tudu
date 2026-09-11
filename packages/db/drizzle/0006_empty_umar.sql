CREATE TABLE "sync_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"recipient_user_id" text NOT NULL,
	"client_mutation_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"user_id" text NOT NULL,
	"client_mutation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_events_recipient_id_idx" ON "sync_events" USING btree ("recipient_user_id","id");--> statement-breakpoint
CREATE INDEX "sync_events_mutation_idx" ON "sync_events" USING btree ("recipient_user_id","client_mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_mutations_user_mutation_uidx" ON "sync_mutations" USING btree ("user_id","client_mutation_id");