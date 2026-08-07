ALTER TABLE "regras_horario" ADD COLUMN "nome" text;--> statement-breakpoint
ALTER TABLE "regras_horario" ADD COLUMN "antecedencia_min_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "regras_horario" ADD COLUMN "desconto_percentual" integer;--> statement-breakpoint
ALTER TABLE "regras_horario" ADD CONSTRAINT "regras_horario_antecedencia_check" CHECK ("regras_horario"."antecedencia_min_min" >= 0);--> statement-breakpoint
ALTER TABLE "regras_horario" ADD CONSTRAINT "regras_horario_desconto_check" CHECK ("regras_horario"."desconto_percentual" IS NULL OR "regras_horario"."desconto_percentual" BETWEEN 0 AND 100);