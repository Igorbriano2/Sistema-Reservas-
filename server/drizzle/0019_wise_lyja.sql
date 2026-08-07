DROP INDEX "conversas_unidade_sender_unq";--> statement-breakpoint
ALTER TABLE "conversas" ALTER COLUMN "unidade_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_empresa_sender_unq" ON "conversas" USING btree ("empresa_id","ig_sender_id");