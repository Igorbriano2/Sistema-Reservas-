ALTER TABLE "empresas" ADD COLUMN "comanda_habilitada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "comanda" text;