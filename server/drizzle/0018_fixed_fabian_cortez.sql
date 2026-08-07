ALTER TABLE "usuarios" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_username_idx" ON "usuarios" USING btree ("username");