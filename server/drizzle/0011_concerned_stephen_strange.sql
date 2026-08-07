CREATE TYPE "public"."tipo_elemento_salao" AS ENUM('parede', 'porta', 'janela', 'planta', 'balcao', 'banheiro', 'cozinha', 'cadeira');--> statement-breakpoint
CREATE TABLE "salao_elementos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salao_id" uuid NOT NULL,
	"tipo" "tipo_elemento_salao" NOT NULL,
	"nome" text NOT NULL,
	"pos_x" real NOT NULL,
	"pos_y" real NOT NULL,
	"largura" real NOT NULL,
	"altura" real NOT NULL,
	"rotacao" real DEFAULT 0 NOT NULL,
	"capacidade" integer,
	CONSTRAINT "salao_elementos_dimensoes_check" CHECK ("salao_elementos"."largura" > 0 AND "salao_elementos"."altura" > 0),
	CONSTRAINT "salao_elementos_capacidade_check" CHECK ("salao_elementos"."capacidade" IS NULL OR "salao_elementos"."capacidade" > 0)
);
--> statement-breakpoint
ALTER TABLE "salao_elementos" ADD CONSTRAINT "salao_elementos_salao_id_saloes_id_fk" FOREIGN KEY ("salao_id") REFERENCES "public"."saloes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "salao_elementos_salao_id_idx" ON "salao_elementos" USING btree ("salao_id");