ALTER TABLE "unidades" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "redes_sociais" jsonb DEFAULT '[]'::jsonb NOT NULL;