# Revisão Final — Redesign Incremental do Quero Reservar

> Fecha o processo iniciado em `docs/ui-inventory.md`. Consolida Ondas 0-4 + Landing Page. Detalhe completo de cada etapa está em `docs/design-review.md` (§1-9) e `docs/landing-page-review.md` — este documento é o resumo executivo + checklist final.

## O que foi feito, em ordem

| Etapa | O quê | Onde |
|---|---|---|
| Auditoria inicial | Mapeou rotas, componentes, API, breakpoints, PWA — sem alterar nada | `docs/ui-inventory.md` |
| D1-D5 | 5 decisões de design aprovadas (cor de bloqueio, escopo da landing, componentes, breakpoints, validação) | `docs/design-decisions.md` |
| Correção isolada | Achado #1: `.form-login`/`.checkout-card` com largura fixa estourava em telas ≤390px — afetava login, checkout pago e a reserva pública (o link que o agente de IA manda) | `docs/design-review.md` §5 |
| Auditoria read-only | 10 achados concretos, priorizados por impacto | `docs/design-audit.md` |
| Onda 0 — Fundação | Tokens de espaço/raio/status, breakpoint tablet, 7 componentes React compartilhados | `docs/design-review.md` §1-6 |
| Onda 2 — Dashboard + Reservas | Hierarquia (próximas reservas/pendências), filtro por salão, form em Modal | `docs/design-review.md` §7 |
| Onda 3 — Salões/Mesas | Modal de edição, formulário em seções, estados operacionais de mesa, lista mobile | `docs/design-review.md` §8 |
| Onda 4 — PWA/mobile | Safe areas, atalhos do manifest, banner de reconexão | `docs/design-review.md` §9 |
| Landing Page | 3 mockups fictícios → prints reais do produto | `docs/landing-page-review.md` |

## Superfícies cobertas

- ✅ **Landing Page** — mockups reais, grid corrigido.
- ✅ **Web App desktop** — Dashboard, Reservas, Salões/Mesas redesenhados; resto do painel (Horários, Cardápio, Usuários, etc.) **não tocado nesta rodada** — fora do escopo pedido, candidatos a uma próxima onda se quiser continuar.
- ⚠️ **Web App tablet** — implementado (breakpoint 768-1023px, sidebar recolhida por padrão) mas não visualmente confirmado num viewport real.
- ⚠️ **PWA/mobile** — safe areas e atalhos implementados; não testado num aparelho físico.
- ⚠️ **Login** — visualmente validado, fluxo de autenticação real não exercitado (sem banco).
- ⚠️ **Reservas** (criar/editar/cancelar) — CRUD preservado por leitura de código; não testado interativamente.
- ⚠️ **Salões e mesas** (+ mapa visual) — maior risco residual, canvas não pôde ser aberto no navegador.
- ✅ **Estados de loading/vazio/erro/sucesso/confirmação** — tratados na maior parte (ver `docs/qa-checklist.md` #11 pro item que ficou de fora).

Ver `docs/qa-checklist.md` para o detalhe item a item.

## O que ficou de fora, de propósito

- Todo o resto do painel admin além de Dashboard/Reservas/Mesas (Horários, Cardápio, Usuários, Relatórios, Feedback, WhatsApp, Campanhas, Conversas, Unidades, Config. do agente) — nunca esteve no escopo desta rodada.
- `ApresentacaoPage`, `AssinaturaBloqueadaPage`, `/painel/*` (painel interno da plataforma) — marcados fora de escopo desde a auditoria inicial.
- Suíte de testes de UI — instrução explícita de não construir isso agora.
- Suporte offline de dados — instrução explícita de não inventar essa infraestrutura.
- 5º estado operacional de mesa ("indisponível", distinto de "bloqueada") — o modelo de dados atual não sustenta essa distinção sem mudar o contrato da API, o que era proibido nesta etapa.

## Testes executados (consolidado)

```
web$   tsc -b               → limpo, em toda etapa
web$   vite build            → limpo, em toda etapa (inclui o service worker)
server$ vitest run           → 36/431 passam (395 bloqueados por falta de Postgres local,
                                 limitação pré-existente do sandbox, confirmada ANTES de
                                 qualquer mudança do redesign - não é regressão nova)
```

## Problemas restantes

1. ~~`TablesPage` tinha um `<p>Carregando...</p>` solto~~ **RESOLVIDO** — trocado por `Skeleton`, mesmo padrão de Dashboard/Reservas.
2. ~~`.chat-instagram-corpo` sem ajuste de safe-area~~ **RESOLVIDO** — soma `env(safe-area-inset-bottom, 0px)`, mesmo padrão das outras 3 regras (`.barra-lateral`/`.area-principal`/`.folha-mobile-nav`). Continua **não testado num iPhone de verdade** — risco residual, não um problema conhecido sem solução.
3. Contraste de texto dos tokens `--status-*` (incluindo o novo `--status-bloqueio`) sobre fundo branco no tema claro fica abaixo do AA de 4.5:1 pra texto normal — débito pré-existente do sistema de cores, não introduzido por este redesign, não resolvido aqui (ver `docs/design-decisions.md` D1).
4. **Prints da Landing Page continuam de antes das Ondas 2/3 — não pôde ser resolvido neste sandbox.** Recapturar exige rodar o app com Postgres de verdade (`cd server && npm run db:migrate && npx tsx src/scripts/seed-apresentacao-cervegela.ts`, depois abrir o painel logado e printar `/admin/dashboard`, `/admin/mesas` e a visão mobile de `/admin/reservas`) — nenhuma dessas ferramentas (Postgres, Docker) está disponível aqui. Ou você recaptura localmente e me manda os 3 arquivos pra eu trocar em `LandingPage.tsx`, ou peça de novo quando eu tiver acesso a um ambiente com banco.

## Riscos conhecidos

| Risco | Superfície | Por quê |
|---|---|---|
| **Alto** | Canvas de mesas (`TablesPage`) | Interação de drag-and-drop customizada, nunca aberta no navegador durante todo o redesign |
| Médio | Viewports estreitos reais | Toda a validação de responsividade foi por leitura de CSS + um viewport desktop nativo — a ferramenta de resize deste sandbox não reproduz telas estreitas de verdade |
| Médio | Fluxos autenticados em geral | Nenhum requer login real neste sandbox (sem Postgres) — login, reservas, mesas, tudo validado só por código |
| Baixo | Safe area em iPhone | `env()` cai pra 0px em qualquer aparelho sem home indicator (Android, desktop) — o pior caso é não ter efeito nenhum, não quebrar algo |
| Baixo | Manifest shortcuts / PWA | Aditivo, confirmado no build gerado, sem tocar no que já existia |

## Como revisar localmente

1. `git status` / `git diff` — nada foi commitado, está tudo no working tree pra você revisar antes de decidir.
2. `cd web && npm install && npm run dev` — subir o painel local.
3. Login com um usuário real (precisa do backend + Postgres rodando — `cd server && npm run dev`, com `DATABASE_URL` configurado).
4. Testar, nesta ordem de prioridade:
   - `/admin/mesas` — arrastar/redimensionar/salvar mesa, conferir as cores dos 3 estados operacionais com reservas/bloqueios reais de hoje.
   - `/admin/reservas` — abrir "Nova reserva" (deve abrir um Modal agora, não mais empurrar a página), editar, cancelar.
   - `/admin/dashboard` — conferir o card "Próximas reservas de hoje".
   - Redimensionar a janela do navegador (ou DevTools → toggle de dispositivo) passando por 1440/1024/768/390/320px em cada uma das telas acima.
   - A landing (`/`) — rolar até as 3 seções com print novo.
5. `cd server && npm test` — só roda de verdade com Postgres acessível.

## Recomendação de commit e PR

**Não commitei nem dei push em nada** — confirmação explícita antes de qualquer uma dessas ações, como combinado desde o início.

Se e quando você aprovar:
- Meu instinto é um commit por onda (não um só gigante) — mais fácil de revisar/reverter individualmente se algo der problema. Mas dado que tudo já está pronto e revisado junto, um único commit bem descrito também é defensável, sua chamada.
- PR (se for o fluxo do time): título curto tipo "Redesign incremental: fundação, dashboard/reservas, salões/mesas, PWA, landing" com a lista de "o que NÃO mudou" (endpoints, autenticação, regras de negócio) bem visível na descrição, já que é a pergunta que todo revisor vai fazer primeiro.
- Antes do commit, sugiro você mesmo abrir `/admin/mesas` localmente pelo menos uma vez — é o único ponto que eu não consegui testar de forma nenhuma.
