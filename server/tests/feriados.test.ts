import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/client.js";
import { excecoesHorario } from "../src/db/schema/index.js";
import { resolverTierDoRodizio } from "../src/lib/feriados.js";
import { criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("resolverTierDoRodizio (doc 26)", () => {
  it("segunda a quinta e dia_util", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    // 2026-08-10 e uma segunda-feira.
    const segunda = await resolverTierDoRodizio(db, unidade.id, "2026-08-10");
    expect(segunda.tier).toBe("dia_util");
    const quinta = await resolverTierDoRodizio(db, unidade.id, "2026-08-13");
    expect(quinta.tier).toBe("dia_util");
  });

  it("sexta, sabado e domingo sao fim_de_semana_feriado", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    expect((await resolverTierDoRodizio(db, unidade.id, "2026-08-14")).tier).toBe("fim_de_semana_feriado"); // sexta
    expect((await resolverTierDoRodizio(db, unidade.id, "2026-08-15")).tier).toBe("fim_de_semana_feriado"); // sabado
    expect((await resolverTierDoRodizio(db, unidade.id, "2026-08-16")).tier).toBe("fim_de_semana_feriado"); // domingo
  });

  it("feriado nacional fixo que cai num dia de semana (Tiradentes, terca em 2026) conta como fim_de_semana_feriado", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const resultado = await resolverTierDoRodizio(db, unidade.id, "2026-04-21");
    expect(resultado.tier).toBe("fim_de_semana_feriado");
    expect(resultado.motivo).toContain("feriado");
  });

  it("vespera de feriado nacional conta como fim_de_semana_feriado mesmo em dia util", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    // Tiradentes 2026 (21/04) cai numa terca-feira - a vespera (20/04, segunda) deve
    // contar como fim de semana/feriado so por causa da vespera.
    const vespera = await resolverTierDoRodizio(db, unidade.id, "2026-04-20");
    expect(vespera.tier).toBe("fim_de_semana_feriado");
    expect(vespera.motivo).toContain("vespera");
  });

  it("feriado municipal cadastrado em excecoes_horario conta como fim_de_semana_feriado", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    // 2026-08-11 (terca) - dia util normal, sem cadastro nenhum.
    const antes = await resolverTierDoRodizio(db, unidade.id, "2026-08-11");
    expect(antes.tier).toBe("dia_util");

    await db.insert(excecoesHorario).values({ unidadeId: unidade.id, data: "2026-08-11", nome: "Aniversario da cidade" });

    const depois = await resolverTierDoRodizio(db, unidade.id, "2026-08-11");
    expect(depois.tier).toBe("fim_de_semana_feriado");
    expect(depois.motivo).toContain("Aniversario da cidade");
  });

  it("feriado municipal de OUTRA unidade nao afeta esta unidade (isolamento por loja)", async () => {
    const { unidade: unidadeA } = await criarEmpresaComAdmin({ nomeEmpresa: "Empresa A", emailAdmin: "a@teste.com" });
    const { unidade: unidadeB } = await criarEmpresaComAdmin({ nomeEmpresa: "Empresa B", emailAdmin: "b@teste.com" });

    await db.insert(excecoesHorario).values({ unidadeId: unidadeA.id, data: "2026-08-11", nome: "Feriado so da loja A" });

    expect((await resolverTierDoRodizio(db, unidadeA.id, "2026-08-11")).tier).toBe("fim_de_semana_feriado");
    expect((await resolverTierDoRodizio(db, unidadeB.id, "2026-08-11")).tier).toBe("dia_util");
  });
});
