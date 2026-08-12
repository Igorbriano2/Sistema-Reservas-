CREATE TABLE "suporte_acessos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plataforma_admin_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_acessado_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "reset_senha_token_hash" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "reset_senha_expira_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plataforma_admins" ADD COLUMN "reset_senha_token_hash" text;--> statement-breakpoint
ALTER TABLE "plataforma_admins" ADD COLUMN "reset_senha_expira_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suporte_acessos" ADD CONSTRAINT "suporte_acessos_plataforma_admin_id_plataforma_admins_id_fk" FOREIGN KEY ("plataforma_admin_id") REFERENCES "public"."plataforma_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suporte_acessos" ADD CONSTRAINT "suporte_acessos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suporte_acessos" ADD CONSTRAINT "suporte_acessos_usuario_acessado_id_usuarios_id_fk" FOREIGN KEY ("usuario_acessado_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suporte_acessos_empresa_id_idx" ON "suporte_acessos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "suporte_acessos_plataforma_admin_id_idx" ON "suporte_acessos" USING btree ("plataforma_admin_id");