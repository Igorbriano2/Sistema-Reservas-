CREATE TYPE "public"."whatsapp_connection_status" AS ENUM('ativo', 'inativo');--> statement-breakpoint
CREATE TYPE "public"."status_campanha_marketing" AS ENUM('enviado', 'falhou', 'respondido');--> statement-breakpoint
CREATE TYPE "public"."tipo_campanha_marketing" AS ENUM('feedback', 'aniversario', 'recuperacao');--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"unidade_id" uuid,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"status" "whatsapp_connection_status" DEFAULT 'ativo' NOT NULL,
	"conectado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"telefone" text NOT NULL,
	"nome" text,
	"data_nascimento" date,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"whatsapp_opt_in_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_empresa_telefone_unique" UNIQUE("empresa_id","telefone")
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_telefone" text NOT NULL,
	"nota" integer,
	"comentario_texto" text,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedbacks_nota_check" CHECK ("feedbacks"."nota" IS NULL OR ("feedbacks"."nota" BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE TABLE "mensagens_marketing_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"reserva_id" uuid,
	"cliente_telefone" text NOT NULL,
	"tipo" "tipo_campanha_marketing" NOT NULL,
	"template_usado" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "status_campanha_marketing" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_config" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"feedback_ativo" boolean DEFAULT true NOT NULL,
	"aniversario_ativo" boolean DEFAULT true NOT NULL,
	"recuperacao_ativo" boolean DEFAULT true NOT NULL,
	"texto_aniversario" text,
	"texto_recuperacao" text,
	"dias_inatividade_recuperacao" integer DEFAULT 60 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_marketing_log" ADD CONSTRAINT "mensagens_marketing_log_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_marketing_log" ADD CONSTRAINT "mensagens_marketing_log_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_connections_empresa_id_idx" ON "whatsapp_connections" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "whatsapp_connections_unidade_id_idx" ON "whatsapp_connections" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "whatsapp_connections_phone_number_id_idx" ON "whatsapp_connections" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "clientes_empresa_id_idx" ON "clientes" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "clientes_data_nascimento_idx" ON "clientes" USING btree ("data_nascimento");--> statement-breakpoint
CREATE INDEX "feedbacks_reserva_id_idx" ON "feedbacks" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "feedbacks_empresa_id_idx" ON "feedbacks" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "mensagens_marketing_log_empresa_id_idx" ON "mensagens_marketing_log" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "mensagens_marketing_log_telefone_tipo_idx" ON "mensagens_marketing_log" USING btree ("cliente_telefone","tipo");--> statement-breakpoint
CREATE INDEX "mensagens_marketing_log_reserva_id_idx" ON "mensagens_marketing_log" USING btree ("reserva_id");