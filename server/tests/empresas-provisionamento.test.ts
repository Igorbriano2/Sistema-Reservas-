import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { agenteConfig } from "../src/db/schema/index.js";
import { criarEmpresaComOwner } from "../src/lib/empresas.js";
import { closeDb, truncateAll } from "./helpers/db.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("lib/empresas criarEmpresaComOwner (doc 24 - agente master auto-provisiona por cliente)", () => {
  it("cria o agenteConfig da empresa automaticamente, ja com instrucoes de comportamento humano", async () => {
    const { empresa } = await criarEmpresaComOwner(db, {
      nomeEmpresa: "Restaurante Novo",
      ownerNome: "Dono",
      ownerEmail: "dono-novo@teste.com",
      ownerSenha: "senha-123456",
    });

    const [config] = await db.select().from(agenteConfig).where(eq(agenteConfig.empresaId, empresa.id)).limit(1);
    expect(config).toBeDefined();
    expect(config.nomeDoAgente).toBeTruthy();
    expect(config.tomDeVoz.toLowerCase()).toContain("natural");
    expect(config.saudacao).toBeTruthy();
  });
});
