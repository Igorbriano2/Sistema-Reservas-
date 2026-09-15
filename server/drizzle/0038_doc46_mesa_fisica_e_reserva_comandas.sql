CREATE TABLE "reserva_comandas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "mesa_fisica" text;--> statement-breakpoint
ALTER TABLE "reserva_comandas" ADD CONSTRAINT "reserva_comandas_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserva_comandas_reserva_id_idx" ON "reserva_comandas" USING btree ("reserva_id");