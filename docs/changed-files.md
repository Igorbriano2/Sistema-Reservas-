# Arquivos alterados — Redesign incremental (Ondas 0-4 + Landing Page)

> Snapshot do `git status`/`git diff --stat` ao final da revisão. Nada commitado — tudo no working tree. Fora do escopo do redesign: `server/src/modules/agent/process-event.ts` e `server/tests/agent-webhook-processing.test.ts` (fix do agente de IA, sessão anterior a este redesign, não relacionado).

## Documentação (nova)

| Arquivo | Conteúdo |
|---|---|
| `DESIGN.md` | Sistema de design (tokens, tipografia, espaçamento, componentes prioritários) |
| `docs/ui-inventory.md` | Auditoria inicial: rotas, componentes, API por tela, breakpoints, PWA |
| `docs/redesign-plan.md` | Diagnóstico, riscos, ondas de implementação, critérios de aceite |
| `docs/design-decisions.md` | Decisões D1-D5 (aprovadas) + log de decisões durante a implementação |
| `docs/design-audit.md` | Auditoria read-only pré-implementação, achados #1-#10, top 10 por impacto |
| `docs/design-review.md` | Evidência de validação de cada onda (build/testes/browser) — §1-9 |
| `docs/landing-page-review.md` | Mockups com produto real, achados, validação |
| `docs/final-design-review.md` | Este documento de fechamento (ver arquivo irmão) |
| `docs/qa-checklist.md` | Checklist de validação final |
| `.claude/commands/design-audit.md` | Slash command reutilizável de auditoria |
| `.claude/commands/design-review.md` | Slash command reutilizável de revisão |

## Fundação (Onda 0)

| Arquivo | Mudança |
|---|---|
| `web/index.html` | `viewport-fit=cover` (pré-requisito de safe area) |
| `web/src/index.css` | Tokens (`--space-*`, `--radius-*`, `--status-bloqueio`), breakpoint tablet, corte mobile 720→767px, CSS de Modal/EmptyState/Skeleton/badge-bloqueio/`.titulo-secao-form`/`.faixa-offline`, safe-area na navegação mobile, `.acoes{flex-wrap}` |
| `web/src/lib/useEhMobile.ts` | Threshold 720→767px |
| `web/src/lib/useEhTablet.ts` | **Novo** — hook do breakpoint 768-1023px |
| `web/src/lib/useBarraLateralRecolhida.ts` | Default recolhida em tablet sem preferência salva |
| `web/src/lib/useOnline.ts` | **Novo** — hook `navigator.onLine` p/ banner de reconexão |
| `web/src/components/Layout.tsx` | 4 botões migrados pra `Button`; banner offline |
| `web/src/components/ui/*.tsx` | **Novos** — `Button`, `Badge`, `StatusBadge`, `FormField`, `Modal`, `EmptyState`, `Skeleton` + `index.ts` (barrel) |
| `web/vite.config.ts` | `shortcuts` no manifest PWA |

## Dashboard + Reservas (Onda 2)

| Arquivo | Mudança |
|---|---|
| `web/src/pages/DashboardPage.tsx` | Card "Próximas reservas de hoje", `StatusBadge`/`EmptyState`/`Skeleton`, pendente priorizado |
| `web/src/pages/ReservationsPage.tsx` | Form de reserva em `Modal`, filtro por salão, `StatusBadge`/`EmptyState`/`Skeleton` |

## Salões, Mesas e Mapa Visual (Onda 3)

| Arquivo | Mudança |
|---|---|
| `web/src/pages/TablesPage.tsx` | Edição de salão em `Modal`, formulário "Novo salão" em seções, estados operacionais de mesa (reservada/ocupada/bloqueada), lista mobile alternativa ao canvas |
| `web/src/components/salao-canvas/SalaoCanvasEditor.tsx` | Prop opcional `estadosOperacionais` (repassado, sem tocar lógica de arraste/CRUD) |
| `web/src/components/salao-canvas/SalaoCanvasSvg.tsx` | Prop opcional `estadosOperacionais`; classe/tooltip só em modo "edicao" |
| `web/src/components/salao-canvas/salao-canvas.css` | 3 classes de estado (cor + traço), legenda, lista mobile |

## Landing Page

| Arquivo | Mudança |
|---|---|
| `web/src/pages/LandingPage.tsx` | Substitui dashboard fictício por 3 screenshots reais; corrige grid sem `auto-fit` |
| `web/src/landing.css` | Remove CSS órfão do mock antigo; adiciona `.lp-screenshot`/`.lp-legenda-print` |

## Correção isolada (achado #1 da auditoria, aplicada antes das ondas)

| Arquivo | Mudança |
|---|---|
| `web/src/index.css` | `.form-login`/`.checkout-card`: largura fixa → `min(Npx, 92vw)` |
| `web/src/pages/PublicReservationPage.tsx` | 3 overrides de largura corrigidos |
| `web/src/pages/WidgetReservationPage.tsx` | 2 overrides de largura corrigidos |
| `web/src/pages/PublicSurveyPage.tsx` | 1 override de largura corrigido |

## Resumo numérico

19 arquivos existentes modificados · 10 arquivos novos de código (`web/src/components/ui/` — 7 componentes + `index.ts`, mais `useEhTablet.ts` e `useOnline.ts`) · 11 arquivos de documentação novos. `+1044 -446` linhas nos arquivos já rastreados pelo git (`git diff --stat`, não conta os arquivos novos).
