CREATE TABLE "bloqueios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"mesa_id" uuid,
	"salao_id" uuid,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueios_alvo_unico_check" CHECK (("bloqueios"."mesa_id" IS NOT NULL AND "bloqueios"."salao_id" IS NULL) OR ("bloqueios"."mesa_id" IS NULL AND "bloqueios"."salao_id" IS NOT NULL)),
	CONSTRAINT "bloqueios_periodo_check" CHECK ("bloqueios"."data_fim" >= "bloqueios"."data_inicio")
);
--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_salao_id_saloes_id_fk" FOREIGN KEY ("salao_id") REFERENCES "public"."saloes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueios_unidade_id_idx" ON "bloqueios" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "bloqueios_mesa_id_idx" ON "bloqueios" USING btree ("mesa_id");--> statement-breakpoint
CREATE INDEX "bloqueios_salao_id_idx" ON "bloqueios" USING btree ("salao_id");--> statement-breakpoint
CREATE INDEX "bloqueios_unidade_periodo_idx" ON "bloqueios" USING btree ("unidade_id","data_inicio","data_fim");