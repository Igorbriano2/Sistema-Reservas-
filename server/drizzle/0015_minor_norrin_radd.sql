ALTER TYPE "public"."instagram_connection_status" ADD VALUE 'expirada';--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD COLUMN "handle" text;