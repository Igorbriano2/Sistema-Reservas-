ALTER TABLE "unidades" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill: deriva o slug de cada unidade existente a partir do nome (mesma logica de
-- derivarSlugDoNome em lib/empresas.ts - minusculo, sem acento, so letras/numeros/
-- hifen), desambiguando duplicatas com um sufixo numerico (-2, -3, ...) na ordem de
-- criacao. Sem isso a coluna ficaria NULL pra toda unidade ja existente (o app so gera
-- slug em unidades NOVAS a partir de agora).
WITH base AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        regexp_replace(
          regexp_replace(
            lower(
              translate(
                nome,
                'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
              )
            ),
            '[^a-z0-9]+', '-', 'g'
          ),
          '(^-+)|(-+$)', '', 'g'
        ),
        ''
      ),
      'unidade'
    ) AS base_slug
  FROM "unidades"
),
numerado AS (
  SELECT id, base_slug, row_number() OVER (PARTITION BY base_slug ORDER BY id) AS rn
  FROM base
)
UPDATE "unidades" u
SET slug = CASE WHEN numerado.rn = 1 THEN numerado.base_slug ELSE numerado.base_slug || '-' || numerado.rn::text END
FROM numerado
WHERE u.id = numerado.id;
--> statement-breakpoint
ALTER TABLE "unidades" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unidades_slug_idx" ON "unidades" USING btree ("slug");
