CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "embedded_text" text;--> statement-breakpoint
CREATE INDEX "tasks_embedding" ON "tasks" USING hnsw ("embedding" vector_cosine_ops);