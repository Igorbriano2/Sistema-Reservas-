CREATE TYPE "public"."pesquisa_pergunta_tipo" AS ENUM('escala', 'texto_curto');--> statement-breakpoint
CREATE TABLE "pesquisa_perguntas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"tipo" "pesquisa_pergunta_tipo" NOT NULL,
	"texto" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pesquisa_respostas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"pergunta_id" uuid NOT NULL,
	"valor_escala" integer,
	"valor_texto" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pesquisa_respostas_valor_escala_check" CHECK ("pesquisa_respostas"."valor_escala" IS NULL OR ("pesquisa_respostas"."valor_escala" BETWEEN 1 AND 5))
);
--> statement-breakpoint
ALTER TABLE "pesquisa_perguntas" ADD CONSTRAINT "pesquisa_perguntas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesquisa_respostas" ADD CONSTRAINT "pesquisa_respostas_feedback_id_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesquisa_respostas" ADD CONSTRAINT "pesquisa_respostas_pergunta_id_pesquisa_perguntas_id_fk" FOREIGN KEY ("pergunta_id") REFERENCES "public"."pesquisa_perguntas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pesquisa_perguntas_empresa_id_idx" ON "pesquisa_perguntas" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "pesquisa_respostas_feedback_id_idx" ON "pesquisa_respostas" USING btree ("feedback_id");