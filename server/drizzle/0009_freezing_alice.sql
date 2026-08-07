CREATE TABLE "stripe_webhook_eventos" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "atrasada_desde" timestamp with time zone;