// Script de demonstracao (NAO faz parte do seed padrao) - popula o banco LOCAL com uma
// empresa fictícia e genérica (sem nome/endereço/Instagram de nenhum cliente real), so
// para gerar prints de tela para a página /apresentacao, que precisa ficar neutra o
// bastante pra ser usada com qualquer prospect. Nunca toca o banco de producao.
// Uso: cd server && npx tsx src/scripts/seed-apresentacao-generico.ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import {
  usuarios,
  unidades,
  saloes,
  regrasHorario,
  cardapioCategorias,
  cardapioItens,
  reservas,
  conversas,
  mensagens,
  filaEspera,
  usuarioUnidades,
} from "../db/schema/index.js";
import { hashPassword } from "../lib/password.js";
import { criarEmpresaComOwner } from "../lib/empresas.js";

const EMAIL_OWNER = "acesso@restauranteexemplo.com";
const SENHA_OWNER = "Demo@123";

const CARDAPIO: Array<[string, string, number, string | null]> = [
  ["Rodízio", "Rodízio Adulto — Segunda a Quinta", 5990, "Espetinhos à vontade + buffet completo de guarnições."],
  ["Rodízio", "Rodízio Adulto — Sexta, Sábado e Domingo", 6990, "Espetinhos à vontade + buffet completo de guarnições."],
  ["Rodízio", "Rodízio Criança (6 a 12 anos)", 2990, "Meia-porção do rodízio adulto."],
  ["Espetinhos", "Carne", 1100, null],
  ["Espetinhos", "Frango", 900, null],
  ["Espetinhos", "Kafta", 900, null],
  ["Espetinhos", "Queijo", 1100, null],
  ["Porções", "Batata Frita (Média)", 2990, null],
  ["Porções", "Calabresa (Média)", 3390, null],
  ["Porções", "Isca de frango (Média)", 3490, null],
  ["Sobremesas", "Petit Gâteau", 1990, null],
  ["Bebidas", "Água", 590, null],
  ["Bebidas", "Refrigerante lata", 790, null],
  ["Bebidas", "Chopp (300 ml)", 990, null],
  ["Bebidas", "Caipirinha", 2190, "Vodka, cachaça ou saquê; fruta, gelo e açúcar"],
];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function seedCardapio(unidadeId: string) {
  const categoriasPorNome = new Map<string, string>();
  let ordemCategoria = 0;
  for (const [categoria, nome, precoCentavos, descricao] of CARDAPIO) {
    let categoriaId = categoriasPorNome.get(categoria);
    if (!categoriaId) {
      const [nova] = await db
        .insert(cardapioCategorias)
        .values({ unidadeId, nome: categoria, ordem: ordemCategoria++ })
        .returning();
      categoriaId = nova.id;
      categoriasPorNome.set(categoria, categoriaId);
    }
    await db.insert(cardapioItens).values({ categoriaId, nome, precoCentavos, descricao, ordem: 0 });
  }
}

async function seedSalaoERegras(unidadeId: string) {
  await db.insert(saloes).values({
    unidadeId,
    nome: "Salão principal",
    modoConfiguracao: "simples",
    capacidadeTotal: 120,
    modoHorarioReserva: "fixo",
    horariosFixos: ["19:00"],
  });

  for (const diaSemana of [1, 2, 3, 4, 5, 6]) {
    const fechamento = diaSemana >= 5 ? "23:59" : "23:00";
    await db.insert(regrasHorario).values({
      unidadeId,
      diaSemana,
      nome: "Jantar",
      horaAbertura: "18:00",
      horaFechamento: fechamento,
      antecedenciaMinMin: 180,
      horariosFixos: ["19:00"],
    });
  }
}

async function main() {
  const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, EMAIL_OWNER)).limit(1);
  if (existente) {
    console.log(`Usuario ${EMAIL_OWNER} ja existe no banco local. Nada a fazer (rode um reset se quiser recriar).`);
    await pool.end();
    return;
  }

  const { empresa, unidade: lojaCentro } = await criarEmpresaComOwner(db, {
    nomeEmpresa: "Restaurante Exemplo",
    ownerNome: "Restaurante Exemplo",
    ownerEmail: EMAIL_OWNER,
    ownerSenha: SENHA_OWNER,
    unidadeNome: "Loja Centro",
    plano: "ativo",
  });

  await db
    .update(unidades)
    .set({
      endereco: "Rua das Palmeiras, 250 — Centro",
      redesSociais: [{ rede: "Instagram", link: "https://instagram.com/seurestaurante" }],
    })
    .where(eq(unidades.id, lojaCentro.id));

  const [lojaNorte] = await db
    .insert(unidades)
    .values({
      empresaId: empresa.id,
      nome: "Loja Zona Norte",
      endereco: "Av. das Acácias, 980 — Zona Norte",
      redesSociais: [{ rede: "Instagram", link: "https://instagram.com/seurestaurante" }],
    })
    .returning();

  console.log(`Empresa "${empresa.nome}" criada (${lojaCentro.nome} + ${lojaNorte.nome}).`);

  await seedSalaoERegras(lojaCentro.id);
  await seedSalaoERegras(lojaNorte.id);
  console.log("Saloes + regras de horario (seg-sab, 19h fixo, antecedencia 3h) criados.");

  await seedCardapio(lojaCentro.id);
  await seedCardapio(lojaNorte.id);
  console.log("Cardapio criado (Loja Centro + Loja Zona Norte).");

  const senhaFuncionario = await hashPassword("recepcao123");
  const [funcionaria] = await db
    .insert(usuarios)
    .values({
      empresaId: empresa.id,
      nome: "Ana (Recepção)",
      username: "ana.recepcao",
      senhaHash: senhaFuncionario,
      papel: "funcionario",
    })
    .returning();
  await db.insert(usuarioUnidades).values({ usuarioId: funcionaria.id, unidadeId: lojaCentro.id });
  console.log("Usuario funcionario criado (ana.recepcao / recepcao123).");

  const hoje = hojeISO();
  const [salaoCentro] = await db.select().from(saloes).where(eq(saloes.unidadeId, lojaCentro.id)).limit(1);

  await db.insert(reservas).values([
    {
      unidadeId: lojaCentro.id,
      salaoId: salaoCentro.id,
      clienteNome: "Beatriz Alves",
      clienteTelefone: "43991112222",
      numPessoas: 2,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "20:30",
      status: "confirmada",
      canalOrigem: "instagram",
      observacoes: "Reserva feita pelo agente de IA via Instagram.",
    },
    {
      unidadeId: lojaCentro.id,
      salaoId: salaoCentro.id,
      clienteNome: "Thiago Martins",
      clienteTelefone: "43998887777",
      numPessoas: 4,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "20:30",
      status: "confirmada",
      canalOrigem: "instagram",
    },
    {
      unidadeId: lojaCentro.id,
      salaoId: salaoCentro.id,
      clienteNome: "Família Pereira",
      clienteTelefone: "43996665555",
      numPessoas: 6,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "20:30",
      status: "pendente",
      canalOrigem: "manual",
      observacoes: "Cadastrada por telefone pela equipe.",
    },
    {
      unidadeId: lojaCentro.id,
      salaoId: salaoCentro.id,
      clienteNome: "Camila Rocha",
      clienteTelefone: "43994443333",
      numPessoas: 3,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "20:30",
      status: "confirmada",
      canalOrigem: "instagram",
    },
    {
      unidadeId: lojaCentro.id,
      salaoId: salaoCentro.id,
      clienteNome: "Aniversário — Grupo Fernandes",
      clienteTelefone: "43993332222",
      numPessoas: 10,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "21:00",
      status: "confirmada",
      canalOrigem: "manual",
      observacoes: "Comemoração de aniversário, pediram mesa perto da churrasqueira.",
    },
  ]);
  console.log("5 reservas de hoje criadas na Loja Centro.");

  await db.insert(filaEspera).values([
    { unidadeId: lojaCentro.id, clienteNome: "Bruno Lima", clienteTelefone: "43992221111", numPessoas: 2, status: "esperando" },
    { unidadeId: lojaCentro.id, clienteNome: "Casal Nunes", numPessoas: 2, status: "chamado" },
  ]);
  console.log("Fila de espera (walk-in) criada.");

  const [conversaAtendida] = await db
    .insert(conversas)
    .values({ empresaId: empresa.id, unidadeId: lojaCentro.id, igSenderId: "ig_demo_beatriz_9931", nomeCliente: "Beatriz Alves" })
    .returning();
  await db.insert(mensagens).values([
    { conversaId: conversaAtendida.id, papel: "user", conteudo: "Boa noite! Vocês têm mesa pra 2 pessoas hoje às 19h?" },
    {
      conversaId: conversaAtendida.id,
      papel: "assistant",
      conteudo:
        "Boa noite, Beatriz! Temos sim 😊 O rodízio começa às 19h e a reserva é bem rápida — só confirmar pelo link aqui: https://queroreservar.com/r/abc123. Qualquer dúvida, me chama!",
    },
    { conversaId: conversaAtendida.id, papel: "user", conteudo: "Perfeito, já reservei! Obrigada 🙏" },
  ]);

  const [conversaAtencao] = await db
    .insert(conversas)
    .values({
      empresaId: empresa.id,
      unidadeId: lojaCentro.id,
      igSenderId: "ig_demo_grupofernandes_4471",
      nomeCliente: "Rafael Fernandes",
      agentPaused: true,
      ultimaAtividadeHumanaEm: new Date(),
    })
    .returning();
  await db.insert(mensagens).values([
    { conversaId: conversaAtencao.id, papel: "user", conteudo: "Oi! Somos 10 pessoas pra um aniversário hoje à noite, dá pra reservar perto da churrasqueira?" },
    {
      conversaId: conversaAtencao.id,
      papel: "assistant",
      conteudo: "Que demais, parabéns antecipado! Pra um pedido especial como esse eu vou chamar alguém da equipe pra confirmar certinho com você, só um instante 🎉",
    },
    {
      conversaId: conversaAtencao.id,
      papel: "assistant",
      conteudo: "Consegui sim! Reservei a mesa 10 lugares perto da churrasqueira, às 19h. Foi um prazer ajudar na comemoração 🎂",
      enviadoPorHumano: true,
    },
  ]);
  console.log("2 conversas do Instagram criadas (1 resolvida pelo agente, 1 com atendimento humano).");

  console.log("\nSeed de apresentacao (generico) concluido.");
  console.log(`Login owner: ${EMAIL_OWNER} / ${SENHA_OWNER}`);
  console.log("Login funcionario: ana.recepcao / recepcao123");

  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao rodar seed de apresentacao generico:", err);
  process.exit(1);
});
