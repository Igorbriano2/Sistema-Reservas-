CREATE TYPE "public"."modo_horario_reserva_salao" AS ENUM('turno', 'fixo', 'intervalo');--> statement-breakpoint
ALTER TABLE "saloes" ADD COLUMN "modo_horario_reserva" "modo_horario_reserva_salao" DEFAULT 'turno' NOT NULL;--> statement-breakpoint
ALTER TABLE "saloes" ADD COLUMN "horarios_fixos" text[];--> statement-breakpoint
ALTER TABLE "saloes" ADD COLUMN "intervalo_inicio" time;--> statement-breakpoint
ALTER TABLE "saloes" ADD COLUMN "intervalo_fim" time;--> statement-breakpoint
ALTER TABLE "saloes" ADD CONSTRAINT "saloes_intervalo_check" CHECK ("saloes"."intervalo_fim" IS NULL OR "saloes"."intervalo_inicio" IS NULL OR "saloes"."intervalo_fim" > "saloes"."intervalo_inicio");