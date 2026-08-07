CREATE TYPE "public"."status_pagamento" AS ENUM('nao_exigido', 'pendente', 'pago', 'reembolsado');--> statement-breakpoint
ALTER TABLE "regras_horario" ADD COLUMN "exige_deposito" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "regras_horario" ADD COLUMN "valor_deposito_centavos" integer;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "status_pagamento" "status_pagamento" DEFAULT 'nao_exigido' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "regras_horario" ADD CONSTRAINT "regras_horario_deposito_check" CHECK (NOT "regras_horario"."exige_deposito" OR "regras_horario"."valor_deposito_centavos" > 0);