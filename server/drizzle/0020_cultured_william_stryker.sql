CREATE TABLE "cardapio_categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardapio_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"preco_centavos" integer NOT NULL,
	"imagem_url" text,
	"porcao_serve_pessoas" integer,
	"somente_maior_idade" boolean DEFAULT false NOT NULL,
	"tags" jsonb,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cardapio_categorias" ADD CONSTRAINT "cardapio_categorias_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardapio_itens" ADD CONSTRAINT "cardapio_itens_categoria_id_cardapio_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."cardapio_categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cardapio_categorias_unidade_id_idx" ON "cardapio_categorias" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "cardapio_itens_categoria_id_idx" ON "cardapio_itens" USING btree ("categoria_id");