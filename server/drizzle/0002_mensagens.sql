CREATE TYPE "public"."papel_mensagem" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"papel" "papel_mensagem" NOT NULL,
	"conteudo" text NOT NULL,
	"ig_message_id" text,
	"enviado_por_humano" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_conversa_id_idx" ON "mensagens" USING btree ("conversa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_ig_message_id_unq" ON "mensagens" USING btree ("ig_message_id") WHERE "mensagens"."ig_message_id" is not null;