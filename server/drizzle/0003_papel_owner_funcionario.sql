ALTER TABLE "usuarios" ALTER COLUMN "papel" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "papel" SET DEFAULT 'owner'::text;--> statement-breakpoint
-- Migra qualquer linha com o antigo valor 'admin' (unico papel do MVP anterior) para 'owner'.
UPDATE "usuarios" SET "papel" = 'owner' WHERE "papel" = 'admin';--> statement-breakpoint
DROP TYPE "public"."papel_usuario";--> statement-breakpoint
CREATE TYPE "public"."papel_usuario" AS ENUM('owner', 'funcionario');--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "papel" SET DEFAULT 'owner'::"public"."papel_usuario";--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "papel" SET DATA TYPE "public"."papel_usuario" USING "papel"::"public"."papel_usuario";