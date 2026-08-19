# Plano de Redesign — Quero Reservar

> Baseado em `docs/ui-inventory.md` (o que existe) e `DESIGN.md` (o sistema proposto). Este é um plano de **auditoria e intenção** — nenhuma tela foi alterada ainda. Cada item de "plano por tela" precisa de aprovação antes de virar código (ver `docs/design-decisions.md`).

## 1. Diagnóstico atual

O sistema visual do Quero Reservar está **mais maduro do que um redesign do zero pressuporia**: identidade de marca definida (Preto/Carmim/Marfim), par tipográfico com personalidade (Bodoni Moda + Inter), dark mode como padrão com tema claro funcional, tokens de cor semântica para status de reserva, motion respeitando `prefers-reduced-motion`, e uma landing page já com efeitos editoriais (parallax, reveal-on-scroll). O pedido do usuário ("assinatura vinho/vermelho", "títulos editoriais", "corpo sans-serif legível") **já é, em grande parte, a direção atual** — não é uma mudança de identidade, é um refinamento.

Os problemas reais (`ui-inventory.md` §10) são estruturais, não de gosto:
- Falta uma escala nomeada de espaçamento/raio → inconsistência acumula com o tempo.
- `.cartao` é usado como classe universal → pouca hierarquia visual dentro de cada tela ("cards genéricos" é sintoma disso, não da cor/fonte).
- Sem breakpoint de tablet no admin.
- Sem componentes React de UI compartilhados (botão/card/input são convenção CSS, não componente) → risco de deriva conforme o produto cresce.
- Zero cobertura de teste de UI → qualquer redesign é validado só visualmente.

**Conclusão do diagnóstico**: o trabalho de maior valor não é "trocar a cara", é (1) dar hierarquia e respiro às telas do Web App que hoje usam `.cartao` genérico para tudo, (2) fechar as lacunas estruturais (tablet, tokens, componentes), (3) preservar e não regredir o que já funciona bem (landing, dark mode, PWA).

## 2. Riscos

| Risco | Mitigação |
|---|---|
| Sem testes de UI — regressão visual só é pega manualmente | Screenshot antes/depois em 3 viewports (mobile 375px, tablet 820px, desktop 1440px) por tela alterada, comparação manual antes de cada commit |
| CSS global (não escopado por componente) — mudar uma classe pode afetar telas não relacionadas | Grep de todo uso de uma classe antes de editá-la (ex.: `.cartao` aparece em ~15 páginas); preferir *adicionar* classe/variante nova a *modificar* uma existente quando o impacto não for claramente desejado em todo lugar |
| `useEhMobile.ts` (720px) e o CSS (720px) podem dessincronizar se o breakpoint mudar | Se o plano introduzir breakpoint de tablet, atualizar os dois juntos no mesmo commit, com o valor num único lugar comentado como fonte da verdade |
| Canvas de salão (`SalaoCanvasEditor`/`.svg`) é interação customizada (drag/SVG) — mexer no visual ao redor pode quebrar posicionamento absoluto | Tratar `TablesPage`/canvas como tela de maior cautela — mudanças de espaçamento nela só depois de validar em viewport real, não só lendo CSS |
| Fluxos públicos (`/reservar`, `/cardapio`, `/widget`, `/pesquisa`) são vistos por clientes finais, não só pelo restaurante — qualquer regressão ali tem custo direto de conversão | Tratar como Tier 1 (mesma cautela que reservas/mesas), nunca "só ajustar rápido" |
| Escopo grande (18+ telas de admin + landing + 4 fluxos públicos) tentando virar uma reforma monolítica | Ordem de implementação em ondas pequenas (seção 5), um PR por tela/grupo, nunca um PR "redesign geral" |

## 3. Direção visual proposta

Ver `DESIGN.md` para o sistema completo. Resumo da direção (a validar com o usuário antes de qualquer implementação — ver `design-decisions.md`):

- **Manter**: paleta Preto/Carmim/Marfim, Bodoni Moda para display, Inter para corpo, dark mode padrão, tokens de status existentes, motion atual da landing.
- **Adicionar**: token de espaçamento/raio nomeados (sem mudar valores), token `--status-bloqueio`, breakpoint de tablet, variantes de `.cartao` com mais hierarquia (eyebrow/título/ação), padrão tabela↔card reaproveitável, empty state padrão.
- **Refinar**: densidade e hierarquia das telas de operação (Reservas, Fila de Espera, Conversas) para reduzir a sensação de "lista genérica" — mais uso de tipografia display para números/horas em destaque (já existe em alguns lugares, generalizar), regras finas em vez de bordas pesadas repetidas.
- **Não tocar agora**: identidade de cor/logo, arquitetura de rotas, qualquer lógica de negócio.

## 4. Plano por tela

Classificação por esforço (S/M/L) e tier de risco (público > operação diária > configuração > interno).

| Tela | Tier | Esforço | O que muda (visual) |
|---|---|---|---|
| `DESIGN.md` tokens (`index.css`) | — | S | Adicionar tokens de espaço/raio/tablet/`--status-bloqueio` sem alterar valores visuais existentes (mudança "invisível", pré-requisito das próximas) |
| `ReservationsPage` | Operação | L | Maior tela de uso diário — hierarquia de cartões, refinar `.cartao-metrica`/resumo de tamanhos, revisar tablet |
| `WaitingListPage` | Operação | M | Aplicar padrão tabela↔card consistente com Reservas |
| `ConversasPage` | Operação | M | Já tem um padrão de chat bem definido — ajustes de hierarquia/espaço, não estrutural |
| `DashboardPage` | Operação (owner) | M | Cards de métrica já com bom acabamento (glass/glow) — validar hierarquia entre eles, tablet |
| `TablesPage` (+ canvas) | Configuração | L (cauteloso) | Só espaçamento ao redor do canvas; canvas em si fora de escopo sem validação em viewport real |
| `SchedulePage`, `BlocksPage`, `MenuPage`, `AgentConfigPage` | Configuração | M cada | Formulários — aplicar `.linha-form`/espaçamento consistente, sem mudança estrutural |
| `UsersPage`, `UnidadesPage`, `WhatsAppPage`, `CampanhasPage`, `FeedbackPage`, `ReportsPage` | Configuração | S–M cada | Ajustes de hierarquia de cartão/tabela, mesmo padrão das telas acima |
| `LoginPage`, `EscolherPainelPage`, `EscolherLojaPage` | Entrada | S | Já têm bom acabamento (`.form-login`, `.cartoes-escolha`) — polish leve |
| `LandingPage` (+ `components/landing/*`) | Marketing | M | Já é a tela mais forte visualmente — revisão de hierarquia/consistência com o resto, não reforma |
| `PublicReservationPage`, `WidgetReservationPage` | **Público (Tier 1)** | L | Fluxo de conversão real — qualquer mudança precisa de validação extra (ver riscos) |
| `PublicMenuPage`, `PublicSurveyPage` | Público | M | Menor complexidade que reserva, mesmo cuidado |
| `CheckoutPage` (+ `checkout/*`) | Público (pagamento) | M (cauteloso) | Nunca alterar lógica de validação/Stripe Elements, só espaçamento/hierarquia visual ao redor |
| `ApresentacaoPage`, `AssinaturaBloqueadaPage` | Interno/comercial | — | **Fora do escopo desta rodada** (não é o produto-fim do restaurante) |
| `/painel/*` (plataforma) | Interno | — | **Fora do escopo desta rodada** (uso interno da equipe, não do cliente) |

## 5. Ordem de implementação proposta

1. **Onda 0 — Fundação** (`DESIGN.md` → código): tokens de espaço/raio/tablet/`--status-bloqueio` em `index.css`, sem mudar nenhum pixel existente. Pré-requisito de tudo abaixo; PR isolado, fácil de revisar.
2. **Onda 1 — Componentes compartilhados**: extrair `.btn`/`.cartao`/badge/tabela↔card como componentes React (ver `DESIGN.md` §9), mantendo o CSS existente por baixo — refatoração estrutural, sem mudança visual perceptível ainda.
3. **Onda 2 — Operação diária** (maior valor para quem usa todo dia): `ReservationsPage`, `WaitingListPage`, `DashboardPage`, `ConversasPage`.
4. **Onda 3 — Configuração**: `SchedulePage`, `BlocksPage`, `MenuPage`, `TablesPage` (espaço ao redor do canvas), `AgentConfigPage`, `UsersPage`, `UnidadesPage`, `WhatsAppPage`, `CampanhasPage`, `FeedbackPage`, `ReportsPage`.
5. **Onda 4 — Entrada e landing**: `LoginPage`, `EscolherPainelPage`/`EscolherLojaPage`, `LandingPage`.
6. **Onda 5 — Público (maior cautela, validar por último com mais calma)**: `PublicReservationPage`, `WidgetReservationPage`, `PublicMenuPage`, `PublicSurveyPage`, `CheckoutPage`.

Cada onda é aprovada separadamente antes de começar (ver `design-decisions.md`) — este plano não autoriza implementação, só ordena o trabalho.

## 6. Componentes que precisam ser criados ou refatorados

Ver `DESIGN.md` §9 para a lista priorizada. Resumo do que é **novo** (não existe hoje como componente/token):
- Componentes React: `Botao`, `Cartao` (com variantes), `Badge`, `ListaOuCards` (padrão tabela↔card), `EstadoVazio`.
- Tokens CSS: `--space-1..8`, `--radius-sm/md/lg/full` (nomear valores já usados), `--status-bloqueio` (cor genuinamente nova), breakpoint `tablet`.

Tudo o mais é refinamento de CSS existente, não criação.

## 7. Critérios de aceite (por tela alterada)

Uma tela só é considerada "redesenhada" quando, **sem mudar nenhuma chamada de API nem comportamento**:
1. Compila sem erro de tipo (`tsc -b`) e sem warning novo de console no dev server.
2. Screenshot em 375px (mobile), 820px (tablet) e 1440px (desktop) revisado manualmente — sem overflow horizontal, sem texto cortado, sem elemento sobreposto.
3. Todo alvo tocável em viewport mobile ≥ 44×44px (`DESIGN.md` §6).
4. Contraste de texto/fundo mantido ou melhorado nos dois temas (claro/escuro).
5. `prefers-reduced-motion` respeitado em qualquer animação nova/alterada.
6. Navegação por teclado (Tab/Enter/Esc) continua funcionando nos elementos interativos da tela.
7. Nenhuma funcionalidade existente removida ou reescrita — só CSS/estrutura de apresentação.
8. Commit pequeno e descritivo, escopado a uma tela (ou grupo coeso, ex. "onda 0 — tokens").

## 8. O que NÃO deve ser alterado

Reforçando as regras obrigatórias do pedido original:
- Nenhum endpoint, contrato de API, payload de request/response.
- Nenhuma regra de autenticação, permissão (`RequireOwner`/`RequirePermissaoNa*`) ou fluxo de escolha de painel/loja.
- Nenhuma regra de negócio de reservas, disponibilidade, mesas, salões, fila de espera.
- Nenhum comportamento do agente de IA (`ConversasPage` só consome o que o backend já expõe).
- Nenhum dado real substituído por mock permanente — telas continuam consumindo a API de verdade.
- `server/` não é tocado nesta etapa (nenhuma mudança de backend foi identificada como necessária para o redesign visual).
- Lógica do canvas de salão (drag, cálculo de posição, formatos de mesa) — só espaço ao redor.
- Lógica de pagamento/Stripe Elements em `CheckoutPage`/`checkout/*`.
- `ApresentacaoPage`, `AssinaturaBloqueadaPage` e `/painel/*` (fora do escopo desta rodada, ver §4).
