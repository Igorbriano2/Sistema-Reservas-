import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { db } from "../src/db/client.js";
import { reservas } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarRegraHorarioTodosOsDias, criarSalao } from "./helpers/fixtures.js";

vi.mock("../src/lib/stripe.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/stripe.js")>();
  return { ...mod, obterStripe: vi.fn() };
});

const { obterStripe } = await import("../src/lib/stripe.js");
const { createApp } = await import("../src/app.js");
const { gerarTokenDeReserva } = await import("../src/lib/reservation-link.js");

const app = createApp();

function criarStripeFalso() {
  return {
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
    refunds: { create: vi.fn().mockResolvedValue({ id: "re_123" }) },
  };
}

beforeEach(async () => {
  await truncateAll();
  vi.mocked(obterStripe).mockReset();
});

afterAll(async () => {
  await closeDb();
});

async function setupComDeposito(valorDepositoCentavos = 5000) {
  const { empresa, unidade } = await criarEmpresaComAdmin();
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarRegraHorarioTodosOsDias(unidade.id, { exigeDeposito: true, valorDepositoCentavos });
  const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-1" });
  return { empresa, unidade, salao, mesa, token };
}

describe("POST /public/reservation-link/:token/deposito (doc 22)", () => {
  it("cria o PaymentIntent quando o turno exige deposito", async () => {
    const { token } = await setupComDeposito(7500);
    const stripeFalso = criarStripeFalso();
    stripeFalso.paymentIntents.create.mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret" });
    vi.mocked(obterStripe).mockReturnValue(stripeFalso as never);

    const resposta = await request(app)
      .post(`/public/reservation-link/${token}/deposito`)
      .send({ data: "2026-10-10", horaInicio: "19:00", numPessoas: 2 });

    expect(resposta.status).toBe(200);
    expect(resposta.body.clientSecret).toBe("pi_1_secret");
    expect(resposta.body.valorCentavos).toBe(7500);
    expect(stripeFalso.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 7500, currency: "brl" }),
    );
  });

  it("400 quando o horario nao exige deposito", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    await criarRegraHorarioTodosOsDias(unidade.id);
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-1" });

    const resposta = await request(app)
      .post(`/public/reservation-link/${token}/deposito`)
      .send({ data: "2026-10-10", horaInicio: "19:00", numPessoas: 2 });
    expect(resposta.status).toBe(400);
  });

  it("410 pra token invalido", async () => {
    const resposta = await request(app)
      .post("/public/reservation-link/token-invalido/deposito")
      .send({ data: "2026-10-10", horaInicio: "19:00", numPessoas: 2 });
    expect(resposta.status).toBe(410);
  });
});

describe("POST /public/reservation-link/:token/reservations com deposito exigido (doc 22)", () => {
  it("rejeita sem paymentIntentId quando o turno exige deposito", async () => {
    const { token } = await setupComDeposito();

    const resposta = await request(app)
      .post(`/public/reservation-link/${token}/reservations`)
      .send({ data: "2026-10-10", horaInicio: "19:00", numPessoas: 2, clienteNome: "Cliente Teste" });

    expect(resposta.status).toBe(400);
    expect(await db.select().from(reservas)).toHaveLength(0);
  });

  it("cria a reserva com statusPagamento pago quando o PaymentIntent e valido (succeeded, valor e metadata batendo)", async () => {
    const { unidade, mesa, token } = await setupComDeposito(5000);
    const stripeFalso = criarStripeFalso();
    stripeFalso.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_ok",
      status: "succeeded",
      amount: 5000,
      metadata: { unidadeId: unidade.id, igSenderId: "ig-cliente-1", data: "2026-10-10", horaInicio: "19:00" },
    });
    vi.mocked(obterStripe).mockReturnValue(stripeFalso as never);

    const resposta = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Teste",
      mesaId: mesa.id,
      paymentIntentId: "pi_ok",
    });

    expect(resposta.status).toBe(201);
    const [salva] = await db.select().from(reservas).where(eq(reservas.id, resposta.body.id));
    expect(salva.statusPagamento).toBe("pago");
    expect(salva.stripePaymentIntentId).toBe("pi_ok");
  });

  it("rejeita quando o PaymentIntent ainda nao foi confirmado (status != succeeded)", async () => {
    const { mesa, token } = await setupComDeposito();
    const stripeFalso = criarStripeFalso();
    stripeFalso.paymentIntents.retrieve.mockResolvedValue({ id: "pi_pendente", status: "requires_payment_method", amount: 5000, metadata: {} });
    vi.mocked(obterStripe).mockReturnValue(stripeFalso as never);

    const resposta = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Teste",
      mesaId: mesa.id,
      paymentIntentId: "pi_pendente",
    });

    expect(resposta.status).toBe(400);
    expect(await db.select().from(reservas)).toHaveLength(0);
  });

  it("rejeita quando a metadata do PaymentIntent nao bate com o pedido (ex: deposito de outro horario)", async () => {
    const { unidade, mesa, token } = await setupComDeposito();
    const stripeFalso = criarStripeFalso();
    stripeFalso.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_trocado",
      status: "succeeded",
      amount: 5000,
      metadata: { unidadeId: unidade.id, igSenderId: "ig-cliente-1", data: "2026-12-25", horaInicio: "12:00" },
    });
    vi.mocked(obterStripe).mockReturnValue(stripeFalso as never);

    const resposta = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Teste",
      mesaId: mesa.id,
      paymentIntentId: "pi_trocado",
    });

    expect(resposta.status).toBe(400);
    expect(await db.select().from(reservas)).toHaveLength(0);
  });

  it("reembolsa automaticamente quando o deposito foi pago mas a reserva nao pode ser criada (mesa ja ocupada)", async () => {
    const { unidade, mesa, token } = await setupComDeposito();

    // Ocupa a mesa antes: reserva manual pelo painel (bypassa a exigencia de deposito,
    // igual uma reserva feita pelo dono no telefone) no MESMO horario que o cliente vai
    // tentar pagar e reservar a seguir - simula a corrida "mesa some entre pagar e confirmar".
    const { criarReserva } = await import("../src/lib/reservations.js");
    await criarReserva(db, {
      unidadeId: unidade.id,
      mesaId: mesa.id,
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Reserva Concorrente",
      canalOrigem: "manual",
    });

    const stripeFalso = criarStripeFalso();
    stripeFalso.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_pago_mas_sem_mesa",
      status: "succeeded",
      amount: 5000,
      metadata: { unidadeId: unidade.id, igSenderId: "ig-cliente-1", data: "2026-10-10", horaInicio: "19:00" },
    });
    vi.mocked(obterStripe).mockReturnValue(stripeFalso as never);

    const resposta = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Teste",
      mesaId: mesa.id,
      paymentIntentId: "pi_pago_mas_sem_mesa",
    });

    expect(resposta.status).toBe(409);
    expect(stripeFalso.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_pago_mas_sem_mesa" });
  });

  it("rejeita reenvio do MESMO paymentIntentId numa segunda reserva, sem reembolsar (doc 25)", async () => {
    const { unidade, salao, mesa, token } = await setupComDeposito(5000);
    const segundaMesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const stripeFalso = criarStripeFalso();
    const metadata = { unidadeId: unidade.id, igSenderId: "ig-cliente-1", data: "2026-10-10", horaInicio: "19:00" };
    stripeFalso.paymentIntents.retrieve.mockResolvedValue({ id: "pi_replay", status: "succeeded", amount: 5000, metadata });
    vi.mocked(obterStripe).mockReturnValue(stripeFalso as never);

    const primeira = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Teste",
      mesaId: mesa.id,
      paymentIntentId: "pi_replay",
    });
    expect(primeira.status).toBe(201);

    // Reenvia o MESMO paymentIntentId contra uma mesa DIFERENTE (ainda disponivel) -
    // sem essa protecao, um PaymentIntent so financiaria duas reservas distintas.
    const segunda = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Teste",
      mesaId: segundaMesa.id,
      paymentIntentId: "pi_replay",
    });

    expect(segunda.status).toBe(400);
    expect(await db.select().from(reservas)).toHaveLength(1);
    // Nao reembolsa: o pagamento continua legitimamente vinculado a primeira reserva,
    // que segue de pe - reembolsar aqui devolveria o dinheiro de uma reserva valida.
    expect(stripeFalso.refunds.create).not.toHaveBeenCalled();
  });
});
