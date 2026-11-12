ALTER TABLE "empresas" ADD COLUMN "orbita_tenant_id" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_orbita_tenant_id_unique" UNIQUE("orbita_tenant_id");