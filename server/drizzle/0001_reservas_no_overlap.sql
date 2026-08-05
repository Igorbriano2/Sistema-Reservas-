-- Garante, no nivel do banco, que a mesma mesa nao tenha duas reservas ativas
-- com horarios sobrepostos no mesmo dia. Isso e uma segunda camada de defesa
-- alem do lock transacional feito na aplicacao ao criar reservas: mesmo sob
-- concorrencia (duas requisicoes simultaneas), o Postgres rejeita o INSERT
-- que colidir com uma reserva existente cujo status ainda conta como ocupando a mesa.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_sem_sobreposicao"
  EXCLUDE USING gist (
    mesa_id WITH =,
    data WITH =,
    tsrange(data + hora_inicio, data + hora_fim) WITH &&
  )
  WHERE (status IN ('pendente', 'confirmada'));
