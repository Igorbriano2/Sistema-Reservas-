CREATE TYPE "public"."papel_usuario" AS ENUM('admin');--> statement-breakpoint
CREATE TYPE "public"."instagram_connection_status" AS ENUM('ativo', 'inativo');--> statement-breakpoint
CREATE TYPE "public"."mesa_formato" AS ENUM('redonda', 'quadrada', 'retangular');--> statement-breakpoint
CREATE TYPE "public"."canal_origem" AS ENUM('instagram', 'manual');--> statement-breakpoint
CREATE TYPE "public"."reserva_status" AS ENUM('pendente', 'confirmada', 'cancelada', 'concluida', 'no_show');--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"plano" text DEFAULT 'trial' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"endereco" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" "papel_usuario" DEFAULT 'admin' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"unidade_id" uuid,
	"ig_business_account_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"status" "instagram_connection_status" DEFAULT 'ativo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saloes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"capacidade_min" integer NOT NULL,
	"capacidade_max" integer NOT NULL,
	"formato" "mesa_formato" DEFAULT 'redonda' NOT NULL,
	"combinavel_com" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "mesas_capacidade_check" CHECK ("mesas"."capacidade_min" > 0 AND "mesas"."capacidade_max" >= "mesas"."capacidade_min")
);
--> statement-breakpoint
CREATE TABLE "regras_horario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"dia_semana" integer NOT NULL,
	"hora_abertura" time NOT NULL,
	"hora_fechamento" time NOT NULL,
	"duracao_padrao_min" integer DEFAULT 90 NOT NULL,
	"buffer_min" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "regras_horario_dia_semana_check" CHECK ("regras_horario"."dia_semana" BETWEEN 0 AND 6),
	CONSTRAINT "regras_horario_intervalo_check" CHECK ("regras_horario"."hora_fechamento" > "regras_horario"."hora_abertura")
);
--> statement-breakpoint
CREATE TABLE "excecoes_horario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"data" date NOT NULL,
	"fechado" boolean DEFAULT false NOT NULL,
	"hora_abertura" time,
	"hora_fechamento" time
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"mesa_id" uuid NOT NULL,
	"ig_sender_id" text,
	"cliente_nome" text NOT NULL,
	"cliente_telefone" text,
	"num_pessoas" integer NOT NULL,
	"data" date NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"status" "reserva_status" DEFAULT 'confirmada' NOT NULL,
	"observacoes" text,
	"canal_origem" "canal_origem" DEFAULT 'manual' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservas_num_pessoas_check" CHECK ("reservas"."num_pessoas" > 0),
	CONSTRAINT "reservas_horario_check" CHECK ("reservas"."hora_fim" > "reservas"."hora_inicio")
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"ig_sender_id" text NOT NULL,
	"agent_paused" boolean DEFAULT false NOT NULL,
	"ultima_atividade_humana_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agente_config" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"nome_do_agente" text DEFAULT 'Assistente' NOT NULL,
	"descricao_restaurante" text DEFAULT '' NOT NULL,
	"tom_de_voz" text DEFAULT 'cordial e objetivo' NOT NULL,
	"saudacao" text DEFAULT '' NOT NULL,
	"despedida" text DEFAULT '' NOT NULL,
	"politicas_reserva" text DEFAULT '' NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topicos_proibidos" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saloes" ADD CONSTRAINT "saloes_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_salao_id_saloes_id_fk" FOREIGN KEY ("salao_id") REFERENCES "public"."saloes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_horario" ADD CONSTRAINT "regras_horario_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_horario" ADD CONSTRAINT "excecoes_horario_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agente_config" ADD CONSTRAINT "agente_config_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unidades_empresa_id_idx" ON "unidades" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_idx" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "instagram_connections_empresa_id_idx" ON "instagram_connections" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "instagram_connections_unidade_id_idx" ON "instagram_connections" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "instagram_connections_ig_account_idx" ON "instagram_connections" USING btree ("ig_business_account_id");--> statement-breakpoint
CREATE INDEX "saloes_unidade_id_idx" ON "saloes" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "mesas_salao_id_idx" ON "mesas" USING btree ("salao_id");--> statement-breakpoint
CREATE INDEX "regras_horario_unidade_id_idx" ON "regras_horario" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "excecoes_horario_unidade_id_idx" ON "excecoes_horario" USING btree ("unidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "excecoes_horario_unidade_data_unq" ON "excecoes_horario" USING btree ("unidade_id","data");--> statement-breakpoint
CREATE INDEX "reservas_unidade_id_idx" ON "reservas" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "reservas_mesa_id_idx" ON "reservas" USING btree ("mesa_id");--> statement-breakpoint
CREATE INDEX "reservas_ig_sender_id_idx" ON "reservas" USING btree ("ig_sender_id");--> statement-breakpoint
CREATE INDEX "reservas_unidade_data_idx" ON "reservas" USING btree ("unidade_id","data");--> statement-breakpoint
CREATE INDEX "conversas_empresa_id_idx" ON "conversas" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "conversas_unidade_id_idx" ON "conversas" USING btree ("unidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_unidade_sender_unq" ON "conversas" USING btree ("unidade_id","ig_sender_id");