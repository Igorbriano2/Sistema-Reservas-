ALTER TYPE "public"."papel_usuario" ADD VALUE 'gerente' BEFORE 'funcionario';--> statement-breakpoint
CREATE TABLE "usuario_unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"permissoes_extra" jsonb,
	CONSTRAINT "usuario_unidades_usuario_unidade_unique" UNIQUE("usuario_id","unidade_id")
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "unidade_id" uuid;--> statement-breakpoint
ALTER TABLE "usuario_unidades" ADD CONSTRAINT "usuario_unidades_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_unidades" ADD CONSTRAINT "usuario_unidades_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usuario_unidades_usuario_id_idx" ON "usuario_unidades" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "usuario_unidades_unidade_id_idx" ON "usuario_unidades" USING btree ("unidade_id");--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinaturas_unidade_id_idx" ON "assinaturas" USING btree ("unidade_id");