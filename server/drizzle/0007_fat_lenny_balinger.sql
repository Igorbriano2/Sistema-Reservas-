CREATE TYPE "public"."modo_configuracao_salao" AS ENUM('simples', 'mapa');--> statement-breakpoint
ALTER TABLE "reservas" ALTER COLUMN "mesa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saloes" ADD COLUMN "modo_configuracao" "modo_configuracao_salao" DEFAULT 'simples' NOT NULL;--> statement-breakpoint
ALTER TABLE "saloes" ADD COLUMN "capacidade_total" integer;--> statement-breakpoint
-- Saloes que ja tem mesas cadastradas sao do fluxo classico (modo mapa) - o default
-- 'simples' da coluna acima vale so para saloes NOVOS a partir de agora. Sem este
-- backfill, restaurantes ja em producao com mesas cadastradas passariam a ficar
-- "invisiveis" para disponibilidade (verificarDisponibilidade so olha mesas de
-- saloes em modo mapa).
UPDATE "saloes" SET "modo_configuracao" = 'mapa' WHERE "id" IN (SELECT DISTINCT "salao_id" FROM "mesas");--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "salao_id" uuid;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_salao_id_saloes_id_fk" FOREIGN KEY ("salao_id") REFERENCES "public"."saloes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_salao_id_idx" ON "reservas" USING btree ("salao_id");--> statement-breakpoint
ALTER TABLE "saloes" ADD CONSTRAINT "saloes_capacidade_total_check" CHECK ("saloes"."capacidade_total" IS NULL OR "saloes"."capacidade_total" > 0);--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_alvo_unico_check" CHECK (("reservas"."mesa_id" IS NOT NULL AND "reservas"."salao_id" IS NULL) OR ("reservas"."mesa_id" IS NULL AND "reservas"."salao_id" IS NOT NULL));