CREATE TYPE "public"."assinatura_status" AS ENUM('em_teste', 'ativo', 'cancelado', 'suspenso');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('novo', 'contatado', 'convertido', 'descartado');--> statement-breakpoint
CREATE TABLE "plataforma_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "assinatura_status" "assinatura_status" DEFAULT 'em_teste' NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "observacoes" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "eh_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_leads" ADD COLUMN "status" "lead_status" DEFAULT 'novo' NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_leads" ADD COLUMN "convertido_empresa_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "plataforma_admins_email_idx" ON "plataforma_admins" USING btree ("email");--> statement-breakpoint
ALTER TABLE "waitlist_leads" ADD CONSTRAINT "waitlist_leads_convertido_empresa_id_empresas_id_fk" FOREIGN KEY ("convertido_empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;