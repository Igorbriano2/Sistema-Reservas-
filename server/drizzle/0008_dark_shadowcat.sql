CREATE TYPE "public"."assinatura_gateway" AS ENUM('stripe');--> statement-breakpoint
CREATE TYPE "public"."assinatura_status_gateway" AS ENUM('trialing', 'ativa', 'atrasada', 'cancelada');--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"gateway" "assinatura_gateway" DEFAULT 'stripe' NOT NULL,
	"customer_id_gateway" text NOT NULL,
	"subscription_id_gateway" text NOT NULL,
	"status" "assinatura_status_gateway" DEFAULT 'trialing' NOT NULL,
	"trial_termina_em" timestamp with time zone,
	"proxima_cobranca_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinaturas_empresa_id_idx" ON "assinaturas" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_subscription_id_gateway_idx" ON "assinaturas" USING btree ("subscription_id_gateway");