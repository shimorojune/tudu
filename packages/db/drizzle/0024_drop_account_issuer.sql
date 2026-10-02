DROP INDEX IF EXISTS "account_issuer_accountId_uidx";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "alg" text;--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "crv" text;
