CREATE TYPE "public"."fila_espera_status" AS ENUM('esperando', 'chamado', 'sentado', 'desistiu');--> statement-breakpoint
CREATE TABLE "fila_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"cliente_nome" text NOT NULL,
	"cliente_telefone" text,
	"num_pessoas" integer NOT NULL,
	"status" "fila_espera_status" DEFAULT 'esperando' NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"chamado_em" timestamp with time zone,
	"finalizado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fila_espera" ADD CONSTRAINT "fila_espera_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fila_espera_unidade_id_idx" ON "fila_espera" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "fila_espera_unidade_status_idx" ON "fila_espera" USING btree ("unidade_id","status");