import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { unidades, usuarioUnidades, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { hashPassword } from "../../lib/password.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";

export const usuariosRouter = Router();

// Funcionalidades "configuraveis" que o dono liga/desliga por usuario na hora de
// criar gerente/funcionario (ver doc 17) - reservas do dia (ver/criar/editar/
// cancelar, marcar sentada/no-show) sao sempre liberadas pra quem tem acesso a
// unidade, sem precisar marcar nada aqui.
const PERMISSOES_VALIDAS = ["editar_salao", "ver_relatorios", "editar_agente", "criar_usuarios"] as const;

const criarUsuarioSchema = z.object({
  nome: z.string().min(1),
  // Sem e-mail pra gerente/funcionario (doc 17) - login e so por username+senha,
  // definidos aqui pelo dono (nao ha convite por e-mail).
  username: z
    .string()
    .trim()
    .min(3, "nome de usuario deve ter pelo menos 3 caracteres")
    .regex(/^[a-z0-9._-]+$/i, "use so letras, numeros, ponto, traco ou underscore"),
  senha: z.string().min(8, "senha deve ter pelo menos 8 caracteres"),
  papel: z.enum(["gerente", "funcionario"]),
  // Lojas/unidades que esse acesso alcanca - um gerente geral pode ter varias.
  unidadeIds: z.array(z.string().uuid()).min(1, "selecione pelo menos uma unidade"),
  permissoes: z.array(z.enum(PERMISSOES_VALIDAS)).default([]),
});

const PG_UNIQUE_VIOLATION = "23505";

function ehViolacaoDeUnicidade(err: unknown): boolean {
  return codigoDoErroPostgres(err) === PG_UNIQUE_VIOLATION;
}

// Qualquer login com a permissao "criar_usuarios" ve e cria outros logins da empresa
// diretamente (sem convite por e-mail no MVP) - requirePermissaoEmpresa aplicado no
// index.ts (owner sempre passa; gerente/funcionario so com a permissao marcada).
usuariosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        username: usuarios.username,
        papel: usuarios.papel,
        criadoEm: usuarios.criadoEm,
      })
      .from(usuarios)
      .where(eq(usuarios.empresaId, req.auth!.empresaId));

    const idsGerenteFuncionario = lista.filter((u) => u.papel !== "owner").map((u) => u.id);
    const acessos =
      idsGerenteFuncionario.length === 0
        ? []
        : await db
            .select({
              usuarioId: usuarioUnidades.usuarioId,
              unidadeId: usuarioUnidades.unidadeId,
              unidadeNome: unidades.nome,
              permissoesExtra: usuarioUnidades.permissoesExtra,
            })
            .from(usuarioUnidades)
            .innerJoin(unidades, eq(unidades.id, usuarioUnidades.unidadeId))
            .where(inArray(usuarioUnidades.usuarioId, idsGerenteFuncionario));

    const resultado = lista.map((u) => ({
      ...u,
      unidades: acessos
        .filter((a) => a.usuarioId === u.id)
        .map((a) => ({ id: a.unidadeId, nome: a.unidadeNome })),
      permissoes: acessos.find((a) => a.usuarioId === u.id)?.permissoesExtra ?? [],
    }));

    res.json(resultado);
  }),
);

usuariosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarUsuarioSchema.parse(req.body);

    // As unidades escolhidas precisam pertencer a MESMA empresa do dono logado -
    // nunca confia em IDs vindos do corpo sem confirmar isso (evitaria um dono
    // conceder acesso a unidade de outra empresa so adivinhando o UUID). Mesma
    // mensagem generica pra "nao existe" e "existe mas nao e sua".
    const idsDaEmpresa = new Set(
      (
        await db
          .select({ id: unidades.id })
          .from(unidades)
          .where(eq(unidades.empresaId, req.auth!.empresaId))
      ).map((u) => u.id),
    );
    const idsInvalidos = dados.unidadeIds.filter((id) => !idsDaEmpresa.has(id));
    if (idsInvalidos.length > 0) {
      throw new RequisicaoInvalidaError("Uma ou mais unidades selecionadas nao pertencem a sua empresa");
    }

    // Um gerente/funcionario com "criar_usuarios" so pode conceder acesso as MESMAS
    // lojas que ele proprio alcanca, e so as permissoes que ele proprio tem em cada
    // uma - senao um funcionario com essa unica permissao poderia se auto-promover
    // (ou promover outro login) alem do proprio alcance. Owner nao tem essa restricao
    // (acesso implicito a tudo da empresa).
    if (req.auth!.papel !== "owner") {
      const acessosDoCriador = await db
        .select({ unidadeId: usuarioUnidades.unidadeId, permissoesExtra: usuarioUnidades.permissoesExtra })
        .from(usuarioUnidades)
        .where(eq(usuarioUnidades.usuarioId, req.auth!.sub));
      const permissoesPorUnidade = new Map(acessosDoCriador.map((a) => [a.unidadeId, new Set(a.permissoesExtra ?? [])]));

      for (const unidadeId of dados.unidadeIds) {
        const permissoesDoCriador = permissoesPorUnidade.get(unidadeId);
        if (!permissoesDoCriador) {
          throw new RequisicaoInvalidaError("Voce so pode conceder acesso a lojas que voce mesmo alcanca");
        }
        const permissaoAlemDoAlcance = dados.permissoes.find((p) => !permissoesDoCriador.has(p));
        if (permissaoAlemDoAlcance) {
          throw new RequisicaoInvalidaError("Voce so pode conceder funcionalidades que voce mesmo tem");
        }
      }
    }

    const senhaHash = await hashPassword(dados.senha);

    try {
      const [usuario] = await db
        .insert(usuarios)
        .values({
          empresaId: req.auth!.empresaId,
          nome: dados.nome,
          username: dados.username.toLowerCase(),
          senhaHash,
          papel: dados.papel,
        })
        .returning({ id: usuarios.id, nome: usuarios.nome, username: usuarios.username, papel: usuarios.papel, criadoEm: usuarios.criadoEm });

      await db.insert(usuarioUnidades).values(
        dados.unidadeIds.map((unidadeId) => ({
          usuarioId: usuario.id,
          unidadeId,
          permissoesExtra: dados.permissoes,
        })),
      );

      res.status(201).json({ ...usuario, unidadeIds: dados.unidadeIds, permissoes: dados.permissoes });
    } catch (err) {
      if (ehViolacaoDeUnicidade(err)) {
        throw new RequisicaoInvalidaError("Ja existe um usuario com este nome de usuario");
      }
      throw err;
    }
  }),
);
