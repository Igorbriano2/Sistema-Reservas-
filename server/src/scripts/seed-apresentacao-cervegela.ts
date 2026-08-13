// Script de demonstracao (NAO faz parte do seed padrao) - popula o banco LOCAL com
// uma copia fiel (nomes/enderecos/cardapio reais, dados operacionais ficticios) da
// configuracao real da Espetaria Cervegela em producao, so para gerar prints de tela
// para a apresentacao comercial (doc "apresentacao"). Nunca toca o banco de producao.
// Uso: cd server && npx tsx src/scripts/seed-apresentacao-cervegela.ts
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
import { criarEmpresaComOwner, derivarSlugDoNome, gerarSlugDisponivel } from "../lib/empresas.js";

const EMAIL_OWNER = "acesso@espetariacervegela.com";
const SENHA_OWNER = "Cervegela@123";

// Amostra real do cardapio de Londrina (categoria, item, preco em centavos, descricao).
const CARDAPIO_LONDRINA: Array<[string, string, number, string | null]> = [
  ["Rodízio", "Rodízio Adulto — Segunda a Quinta", 5990, "Espetinhos à vontade (mais de 10 tipos, incluindo doces) + buffet completo de guarnições. Bebidas não inclusas."],
  ["Rodízio", "Rodízio Adulto — Sexta, Sábado, Domingo e Feriados", 6990, "Espetinhos à vontade (mais de 10 tipos, incluindo doces) + buffet completo de guarnições. Bebidas não inclusas."],
  ["Rodízio", "Rodízio Criança (6 a 12 anos) — Segunda a Quinta", 2990, "Meia-porção do rodízio adulto."],
  ["Rodízio", "Rodízio Criança (6 a 12 anos) — Sexta, Sábado, Domingo e Feriados", 3490, "Meia-porção do rodízio adulto."],
  ["Rodízio", "Criança até 5 anos", 0, "Não paga."],
  ["Espetinhos — Tradicionais", "Carne", 1100, null],
  ["Espetinhos — Tradicionais", "Carne c/ bacon", 1200, null],
  ["Espetinhos — Tradicionais", "Frango", 900, null],
  ["Espetinhos — Tradicionais", "Kafta", 900, null],
  ["Espetinhos — Tradicionais", "Linguiça toscana", 900, null],
  ["Espetinhos — Tradicionais", "Panceta", 900, null],
  ["Espetinhos — Especiais", "Queijo", 1100, null],
  ["Espetinhos — Especiais", "Med. Romeu e Julieta", 1200, null],
  ["Espetinhos — Especiais", "Uva c/ chocolate", 1290, null],
  ["Porções — Tradicionais", "Batata Frita (Média)", 2990, null],
  ["Porções — Tradicionais", "Batata Frita c/ Queijo e Bacon (Grande)", 3990, null],
  ["Porções — Tradicionais", "Calabresa (Média)", 3390, null],
  ["Porções — Tradicionais", "Isca de frango (Média)", 3490, null],
  ["Porções — Tradicionais", "Isca de peixe (Grande)", 5290, null],
  ["Sobremesas", "Petit Gâteau", 1990, null],
  ["Bebidas — Chopp", "Queens (300 ml)", 990, null],
  ["Bebidas — Chopp", "Brahma (500 ml)", 1690, null],
  ["Bebidas — Cervejas Long Neck", "Corona (Long Neck)", 1290, "Normal ou zero"],
  ["Bebidas — Cervejas Long Neck", "Stella Artois (Long Neck)", 1290, null],
  ["Bebidas — Bebidas especiais", "Caipirinha", 2190, "Opções: vodka, cachaça ou saquê; fruta, gelo e açúcar"],
  ["Bebidas — Bebidas especiais", "Aperol Spritz", 2390, null],
];

const CARDAPIO_MARINGA: Array<[string, string, number, string | null]> = [
  ["Rodízio", "Rodízio Adulto — Segunda a Quinta", 5990, "Espetinhos à vontade (mais de 10 tipos, incluindo doces) + buffet completo de guarnições. Bebidas não inclusas."],
  ["Rodízio", "Rodízio Adulto — Sexta, Sábado, Domingo e Feriados", 6990, "Espetinhos à vontade (mais de 10 tipos, incluindo doces) + buffet completo de guarnições. Bebidas não inclusas."],
  ["Espetinhos — Tradicionais", "Carne", 1100, null],
  ["Espetinhos — Tradicionais", "Frango", 900, null],
  ["Espetinhos — Tradicionais", "Kafta", 900, null],
  ["Porções — Tradicionais", "Batata Frita (Média)", 2990, null],
  ["Porções — Tradicionais", "Calabresa (Média)", 3390, null],
  ["Sobremesas", "Petit Gâteau", 1990, null],
  ["Bebidas — Chopp", "Brahma (500 ml)", 1690, null],
  ["Bebidas — Bebidas especiais", "Caipirinha", 2190, "Opções: vodka, cachaça ou saquê; fruta, gelo e açúcar"],
];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function seedCardapio(unidadeId: string, itens: Array<[string, string, number, string | null]>) {
  const categoriasPorNome = new Map<string, string>();
  let ordemCategoria = 0;
  for (const [categoria, nome, precoCentavos, descricao] of itens) {
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
    capacidadeTotal: 200,
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

  const { empresa, unidade: londrina } = await criarEmpresaComOwner(db, {
    nomeEmpresa: "Espetaria Cervegela",
    ownerNome: "Cervegela",
    ownerEmail: EMAIL_OWNER,
    ownerSenha: SENHA_OWNER,
    unidadeNome: "Cervegela Londrina",
    plano: "ativo",
  });

  await db
    .update(unidades)
    .set({
      endereco: "Av. Harry Prochet, 1370 — Jardim São Jorge, Londrina-PR, CEP 86047-440",
      redesSociais: [
        { rede: "Instagram", link: "https://instagram.com/espetariacervegela" },
        { rede: "Site", link: "https://espetariacervegela.com.br" },
      ],
    })
    .where(eq(unidades.id, londrina.id));

  const slugMaringa = await gerarSlugDisponivel(db, derivarSlugDoNome("Cervegela Maringá"));
  const [maringa] = await db
    .insert(unidades)
    .values({
      empresaId: empresa.id,
      nome: "Cervegela Maringá",
      slug: slugMaringa,
      endereco: "Av. Mandacaru, 2175 — Jardim Real, Maringá-PR",
      redesSociais: [
        { rede: "Instagram", link: "https://instagram.com/espetariacervegela" },
        { rede: "Site", link: "https://espetariacervegela.com.br" },
      ],
    })
    .returning();

  console.log(`Empresa "${empresa.nome}" criada (${londrina.nome} + ${maringa.nome}).`);

  await seedSalaoERegras(londrina.id);
  await seedSalaoERegras(maringa.id);
  console.log("Saloes + regras de horario (seg-sab, 19h fixo, antecedencia 3h) criados.");

  await seedCardapio(londrina.id, CARDAPIO_LONDRINA);
  await seedCardapio(maringa.id, CARDAPIO_MARINGA);
  console.log("Cardapio criado (Londrina + Maringa).");

  // Funcionaria da recepcao - so acesso a unidade Londrina, so ve/edita reservas do dia.
  const senhaFuncionario = await hashPassword("recepcao123");
  const [funcionaria] = await db
    .insert(usuarios)
    .values({
      empresaId: empresa.id,
      nome: "Camila (Recepção)",
      username: "camila.recepcao",
      senhaHash: senhaFuncionario,
      papel: "funcionario",
    })
    .returning();
  await db.insert(usuarioUnidades).values({ usuarioId: funcionaria.id, unidadeId: londrina.id });
  console.log("Usuario funcionario criado (camila.recepcao / recepcao123).");

  const hoje = hojeISO();
  const [salaoLondrina] = await db.select().from(saloes).where(eq(saloes.unidadeId, londrina.id)).limit(1);

  await db.insert(reservas).values([
    {
      unidadeId: londrina.id,
      salaoId: salaoLondrina.id,
      clienteNome: "Marina Ribeiro",
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
      unidadeId: londrina.id,
      salaoId: salaoLondrina.id,
      clienteNome: "Igor Briano",
      clienteTelefone: "43998887777",
      numPessoas: 4,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "20:30",
      status: "confirmada",
      canalOrigem: "instagram",
    },
    {
      unidadeId: londrina.id,
      salaoId: salaoLondrina.id,
      clienteNome: "Família Souza",
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
      unidadeId: londrina.id,
      salaoId: salaoLondrina.id,
      clienteNome: "Rafael Torres",
      clienteTelefone: "43994443333",
      numPessoas: 3,
      data: hoje,
      horaInicio: "19:00",
      horaFim: "20:30",
      status: "confirmada",
      canalOrigem: "instagram",
    },
    {
      unidadeId: londrina.id,
      salaoId: salaoLondrina.id,
      clienteNome: "Aniversário — Grupo Duda",
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
  console.log("5 reservas de hoje criadas em Londrina.");

  await db.insert(filaEspera).values([
    { unidadeId: londrina.id, clienteNome: "Bruno Almeida", clienteTelefone: "43992221111", numPessoas: 2, status: "esperando" },
    { unidadeId: londrina.id, clienteNome: "Casal Fernandes", numPessoas: 2, status: "chamado" },
  ]);
  console.log("Fila de espera (walk-in) criada.");

  const [conversaAtendida] = await db
    .insert(conversas)
    .values({ empresaId: empresa.id, unidadeId: londrina.id, igSenderId: "ig_demo_marina_9931", nomeCliente: "Marina Ribeiro" })
    .returning();
  await db.insert(mensagens).values([
    { conversaId: conversaAtendida.id, papel: "user", conteudo: "Boa noite! Vocês têm mesa pra 2 pessoas hoje às 19h?" },
    {
      conversaId: conversaAtendida.id,
      papel: "assistant",
      conteudo:
        "Boa noite, Marina! Temos sim 😊 O rodízio começa às 19h e a reserva é bem rápida — só confirmar pelo link aqui: https://queroreservar.com/r/abc123. Qualquer dúvida, me chama!",
    },
    { conversaId: conversaAtendida.id, papel: "user", conteudo: "Perfeito, já reservei! Obrigada 🙏" },
  ]);

  const [conversaAtencao] = await db
    .insert(conversas)
    .values({
      empresaId: empresa.id,
      unidadeId: londrina.id,
      igSenderId: "ig_demo_grupoduda_4471",
      nomeCliente: "Duda Ferreira",
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

  console.log("\nSeed de apresentacao concluido.");
  console.log(`Login owner: ${EMAIL_OWNER} / ${SENHA_OWNER}`);
  console.log("Login funcionario: camila.recepcao / recepcao123");

  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao rodar seed de apresentacao:", err);
  process.exit(1);
});
