import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { usuarioUnidades } from "../db/schema/index.js";

// Middlewares de autorizacao granular pra gerente/funcionario (doc 17) - owner
// sempre passa direto (acesso implicito a tudo da propria empresa, sem linha em
// usuario_unidades). Requerem requireAuth antes; os dois "*Unidade" tambem requerem
// resolveUnidade antes (usam req.unidadeId).

async function obterPermissoesNaUnidade(usuarioId: string, unidadeId: string): Promise<string[] | null> {
  const [linha] = await db
    .select({ permissoesExtra: usuarioUnidades.permissoesExtra })
    .from(usuarioUnidades)
    .where(and(eq(usuarioUnidades.usuarioId, usuarioId), eq(usuarioUnidades.unidadeId, unidadeId)))
    .limit(1);
  if (!linha) return null;
  return linha.permissoesExtra ?? [];
}

// So confere que o login tem UMA linha em usuario_unidades pra essa unidade - usado
// nas rotas "baseline" (reservas do dia, disponibilidade, push) que qualquer
// gerente/funcionario com acesso a unidade pode usar, sem precisar de nenhuma
// funcionalidade extra marcada.
export function requireAcessoUnidade(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || !req.unidadeId) {
    res.status(400).json({ error: "unidadeId ausente" });
    return;
  }
  if (req.auth.papel === "owner") {
    next();
    return;
  }
  obterPermissoesNaUnidade(req.auth.sub, req.unidadeId)
    .then((permissoes) => {
      if (permissoes === null) {
        res.status(403).json({ error: "Voce nao tem acesso a esta unidade" });
        return;
      }
      next();
    })
    .catch(next);
}

// Mesma checagem de "editar_salao", mas so pras rotas de escrita (POST/PATCH/DELETE)
// de saloes/mesas - a LEITURA (GET) fica no baseline (requireAcessoUnidade), porque a
// pagina de Reservas precisa dela pra mostrar em qual mesa/salao cada reserva esta
// (coluna "Local") e pro seletor ao criar uma reserva manual, mesmo pra um
// funcionario que o dono NAO marcou com "editar_salao" (essa permissao e so sobre
// poder abrir o editor visual do salao e alterar o layout, nao sobre ver reservas).
export function requireLeituraOuPermissaoUnidade(permissao: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET") {
      requireAcessoUnidade(req, res, next);
      return;
    }
    requirePermissaoUnidade(permissao)(req, res, next);
  };
}

// Confere acesso a unidade E a funcionalidade especifica marcada pelo dono na hora de
// criar o login (ex: "editar_salao") - usado nas rotas de configuracao estrutural da
// unidade (saloes/mesas/regras-horario/bloqueios) e de relatorios.
export function requirePermissaoUnidade(permissao: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !req.unidadeId) {
      res.status(400).json({ error: "unidadeId ausente" });
      return;
    }
    if (req.auth.papel === "owner") {
      next();
      return;
    }
    obterPermissoesNaUnidade(req.auth.sub, req.unidadeId)
      .then((permissoes) => {
        if (permissoes === null || !permissoes.includes(permissao)) {
          res.status(403).json({ error: "Acesso negado para o seu papel de usuario" });
          return;
        }
        next();
      })
      .catch(next);
  };
}

// Mesma checagem de funcionalidade, mas pra recursos que nao pertencem a uma unidade
// especifica (ex: agente-config, criar/listar usuarios) - basta ter a permissao em
// QUALQUER uma das lojas as quais o login tem acesso (cobre o caso do "gerente geral"
// com varias unidades, ver doc 17).
export function requirePermissaoEmpresa(permissao: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Nao autenticado" });
      return;
    }
    if (req.auth.papel === "owner") {
      next();
      return;
    }
    db.select({ permissoesExtra: usuarioUnidades.permissoesExtra })
      .from(usuarioUnidades)
      .where(eq(usuarioUnidades.usuarioId, req.auth.sub))
      .then((linhas) => {
        const temPermissao = linhas.some((linha) => (linha.permissoesExtra ?? []).includes(permissao));
        if (!temPermissao) {
          res.status(403).json({ error: "Acesso negado para o seu papel de usuario" });
          return;
        }
        next();
      })
      .catch(next);
  };
}
