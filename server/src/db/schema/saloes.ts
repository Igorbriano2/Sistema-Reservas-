import { pgTable, uuid, text, integer, time, date, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { unidades } from "./unidades.js";

// "simples": o dono so cadastra a capacidade total simultanea do salao (sem mesas
// individuais) - a disponibilidade soma num_pessoas das reservas ativas no horario.
// "mapa": comportamento classico de mesas individuais (capacidade_total fica sem uso).
export const modoConfiguracaoSalaoEnum = pgEnum("modo_configuracao_salao", ["simples", "mapa"]);

// Doc 29 - controla quais horarios de INICIO a reserva PUBLICA aceita para ESTE salao
// especificamente (alem da janela abertura/fechamento do turno da unidade, que sempre
// vale): "turno" (padrao) = sem restricao propria, so a janela do turno; "fixo" = so os
// horarios exatos em horariosFixos (ex: salao de rodizio que so abre reserva as 19h);
// "intervalo" = qualquer horario entre intervaloInicio/intervaloFim (ex: salao de
// eventos que so aceita reserva das 19h as 22h). Reserva manual pelo painel nunca e
// restringida por isso, mesmo criterio ja usado em regras_horario.horarios_fixos.
export const modoHorarioReservaSalaoEnum = pgEnum("modo_horario_reserva_salao", ["turno", "fixo", "intervalo"]);

export const saloes = pgTable(
  "saloes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    modoConfiguracao: modoConfiguracaoSalaoEnum("modo_configuracao").notNull().default("simples"),
    // So usada no modo "simples". Nula ate o dono configurar; nesse estado o salao
    // fica indisponivel para reservas (ver criarReservaSimples/verificarDisponibilidade).
    capacidadeTotal: integer("capacidade_total"),
    modoHorarioReserva: modoHorarioReservaSalaoEnum("modo_horario_reserva").notNull().default("turno"),
    horariosFixos: text("horarios_fixos").array(),
    intervaloInicio: time("intervalo_inicio"),
    intervaloFim: time("intervalo_fim"),
    // Doc 30 - salao de campanha (ex: "Dia dos Namorados"): quando preenchida, esse
    // salao so existe pra reserva (publica OU manual pelo painel) NESSA data - em
    // qualquer outro dia ele nao aparece como opcao, como se nao existisse ainda. Nulo
    // (padrao) = salao permanente, disponivel todos os dias normalmente.
    dataEspecifica: date("data_especifica"),
  },
  (table) => [
    index("saloes_unidade_id_idx").on(table.unidadeId),
    check("saloes_capacidade_total_check", sql`${table.capacidadeTotal} IS NULL OR ${table.capacidadeTotal} > 0`),
    check(
      "saloes_intervalo_check",
      sql`${table.intervaloFim} IS NULL OR ${table.intervaloInicio} IS NULL OR ${table.intervaloFim} > ${table.intervaloInicio}`,
    ),
  ],
);

export type Salao = typeof saloes.$inferSelect;
export type NovoSalao = typeof saloes.$inferInsert;
