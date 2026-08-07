import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { mensagensMarketingLog, whatsappConfig } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarCliente, criarConexaoWhatsapp, criarMesa, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";

vi.mock("../src/lib/whatsapp-api.js", () => ({
  enviarTemplateWhatsapp: vi.fn().mockResolvedValue("wamid.teste"),
  verificarAssinaturaDoWebhookWhatsapp: vi.fn(() => true),
}));

const { enviarTemplateWhatsapp } = await import("../src/lib/whatsapp-api.js");
const { executarRotinaFeedback, executarRotinaAniversario, executarRotinaRecuperacao } = await import(
  "../src/lib/whatsapp-scheduler.js"
);

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarTemplateWhatsapp).mockClear().mockResolvedValue("wamid.teste");
});

afterAll(async () => {
  await closeDb();
});

function dataOffset(offsetDias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

async function setupBase() {
  const { empresa, unidade } = await criarEmpresaComAdmin();
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarConexaoWhatsapp(empresa.id, null);
  return { empresa, unidade, salao, mesa };
}

describe("Rotina de feedback", () => {
  it("envia feedback pra reserva concluida ONTEM de cliente com opt-in", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11911112222", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-1", { data: dataOffset(-1), clienteNome: "Cliente Feedback" });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11911112222' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaFeedback(db);
    expect(resultado.enviados).toBe(1);
    expect(resultado.falhas).toBe(0);
    expect(enviarTemplateWhatsapp).toHaveBeenCalledTimes(1);

    const logs = await db.select().from(mensagensMarketingLog).where(eq(mensagensMarketingLog.tipo, "feedback"));
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("enviado");
  });

  it("NAO envia feedback quando o cliente nunca deu opt-in", async () => {
    const { unidade, mesa } = await setupBase();
    await criarReservaDireta(unidade.id, mesa.id, "ig-2", { data: dataOffset(-1) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11900000000' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaFeedback(db);
    expect(resultado.enviados).toBe(0);
    expect(enviarTemplateWhatsapp).not.toHaveBeenCalled();
  });

  it("NAO envia feedback pra reserva de HOJE (so o dia anterior conta)", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11933334444", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-3", { data: dataOffset(0) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11933334444' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaFeedback(db);
    expect(resultado.enviados).toBe(0);
  });

  it("NUNCA envia a mesma campanha de feedback duas vezes pra mesma reserva", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11955556666", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-4", { data: dataOffset(-1) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11955556666' WHERE unidade_id = ${unidade.id}`);

    const primeira = await executarRotinaFeedback(db);
    expect(primeira.enviados).toBe(1);
    const segunda = await executarRotinaFeedback(db);
    expect(segunda.enviados).toBe(0);
    expect(enviarTemplateWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("respeita whatsapp_config.feedback_ativo = false", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await db.insert(whatsappConfig).values({ empresaId: empresa.id, feedbackAtivo: false });
    await criarCliente(empresa.id, "11977778888", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-5", { data: dataOffset(-1) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11977778888' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaFeedback(db);
    expect(resultado.enviados).toBe(0);
    expect(enviarTemplateWhatsapp).not.toHaveBeenCalled();
  });
});

describe("Rotina de aniversario", () => {
  it("envia pra cliente com opt-in cujo dia/mes de nascimento e hoje", async () => {
    const { empresa } = await setupBase();
    const hoje = new Date();
    const mesDia = `${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-${String(hoje.getUTCDate()).padStart(2, "0")}`;
    await criarCliente(empresa.id, "11911110000", { whatsappOptIn: true, dataNascimento: `1990-${mesDia}` });

    const resultado = await executarRotinaAniversario(db);
    expect(resultado.enviados).toBe(1);
    expect(enviarTemplateWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("NAO envia pra cliente com nascimento em outro dia", async () => {
    const { empresa } = await setupBase();
    await criarCliente(empresa.id, "11922221111", { whatsappOptIn: true, dataNascimento: "1990-01-01" });

    const resultado = await executarRotinaAniversario(db);
    // So falha o teste se hoje for exatamente 1o de janeiro - improvavel o bastante
    // pra nao mascarar (documentado aqui pra quem ler o teste no futuro).
    expect(resultado.enviados).toBe(0);
  });

  it("NAO envia duas vezes no MESMO ano pro mesmo cliente", async () => {
    const { empresa } = await setupBase();
    const hoje = new Date();
    const mesDia = `${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-${String(hoje.getUTCDate()).padStart(2, "0")}`;
    await criarCliente(empresa.id, "11933332222", { whatsappOptIn: true, dataNascimento: `1985-${mesDia}` });

    const primeira = await executarRotinaAniversario(db);
    expect(primeira.enviados).toBe(1);
    const segunda = await executarRotinaAniversario(db);
    expect(segunda.enviados).toBe(0);
  });

  it("NAO envia pra cliente sem opt-in mesmo com aniversario hoje", async () => {
    const { empresa } = await setupBase();
    const hoje = new Date();
    const mesDia = `${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-${String(hoje.getUTCDate()).padStart(2, "0")}`;
    await criarCliente(empresa.id, "11944443333", { whatsappOptIn: false, dataNascimento: `1990-${mesDia}` });

    const resultado = await executarRotinaAniversario(db);
    expect(resultado.enviados).toBe(0);
  });
});

describe("Rotina de recuperacao", () => {
  it("envia pra cliente com opt-in cuja ultima reserva concluida foi ha mais de N dias (default 60)", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11955550000", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-rec-1", { data: dataOffset(-70) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11955550000' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaRecuperacao(db);
    expect(resultado.enviados).toBe(1);
  });

  it("NAO envia quando a ultima reserva concluida foi recente (dentro do prazo)", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11966660000", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-rec-2", { data: dataOffset(-10) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11966660000' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaRecuperacao(db);
    expect(resultado.enviados).toBe(0);
  });

  it("NAO envia pra cliente que nunca teve reserva concluida", async () => {
    const { empresa } = await setupBase();
    await criarCliente(empresa.id, "11977770000", { whatsappOptIn: true });

    const resultado = await executarRotinaRecuperacao(db);
    expect(resultado.enviados).toBe(0);
  });

  it("respeita o numero de dias de inatividade configurado por empresa", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await db.insert(whatsappConfig).values({ empresaId: empresa.id, diasInatividadeRecuperacao: 100 });
    await criarCliente(empresa.id, "11988880000", { whatsappOptIn: true });
    // 70 dias atras: passa do default (60) mas NAO passa do configurado (100).
    await criarReservaDireta(unidade.id, mesa.id, "ig-rec-3", { data: dataOffset(-70) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11988880000' WHERE unidade_id = ${unidade.id}`);

    const resultado = await executarRotinaRecuperacao(db);
    expect(resultado.enviados).toBe(0);
  });

  it("NAO envia de novo dentro do periodo de cooldown apos uma tentativa recente", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11999990000", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-rec-4", { data: dataOffset(-70) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11999990000' WHERE unidade_id = ${unidade.id}`);

    const primeira = await executarRotinaRecuperacao(db);
    expect(primeira.enviados).toBe(1);
    const segunda = await executarRotinaRecuperacao(db);
    expect(segunda.enviados).toBe(0);
    expect(enviarTemplateWhatsapp).toHaveBeenCalledTimes(1);
  });
});

describe("Falha no envio (sem conexao WhatsApp ativa)", () => {
  it("registra falha no log em vez de lancar erro quando a empresa nao tem conexao", async () => {
    // Sem criarConexaoWhatsapp aqui de proposito.
    const { empresa } = await criarEmpresaComAdmin();
    const hoje = new Date();
    const mesDia = `${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-${String(hoje.getUTCDate()).padStart(2, "0")}`;
    await criarCliente(empresa.id, "11900002222", { whatsappOptIn: true, dataNascimento: `1990-${mesDia}` });

    const resultado = await executarRotinaAniversario(db);
    expect(resultado.enviados).toBe(0);
    expect(resultado.falhas).toBe(1);
    const logs = await db.select().from(mensagensMarketingLog).where(eq(mensagensMarketingLog.status, "falhou"));
    expect(logs).toHaveLength(1);
  });
});
