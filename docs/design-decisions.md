# Decisões de Design — pendentes e registradas

> Log vivo. Cada entrada nova (durante a implementação) deve seguir o mesmo formato: **Decisão**, **Contexto**, **Opções consideradas**, **Status**. Decisões marcadas `PENDENTE` bloqueiam a implementação da tela/onda correspondente até serem resolvidas com o usuário.

## Aprovadas (habilitam a implementação da Onda 0)

### D1 — Cor do token `--status-bloqueio` — ✅ APROVADA
- **Decisão**: `--status-bloqueio: #B7791F` (âmbar/ocre), com variante de fundo `--status-bloqueio-bg: rgba(183, 121, 31, 0.16)` — mesmo padrão dos outros tokens de status (`--status-pendente-bg`, etc.).
- **Contexto**: substitui a proposta provisória de roxo/ardósia (`#8a7ca8`) do rascunho original. É a única cor genuinamente nova do redesign; todo o resto reaproveita tokens existentes.
- **Restrição de uso obrigatória**: nunca usar `--status-bloqueio` como único indicador do estado — todo badge/indicador de bloqueio carrega texto ("Bloqueado") além da cor, seguindo o mesmo padrão já usado em `.badge-*` (cor + texto, nunca só cor).
- **Nota de contraste (registrada, não bloqueia)**: `#B7791F` como texto sobre `--bg-elevated` claro (`#ffffff`) mede ~3.6:1 — abaixo do AA de 4.5:1 para texto normal, mas dentro do AA de 3:1 para componentes gráficos/UI (WCAG 1.4.11). **Esse mesmo padrão já vale para `--status-pendente` (`#cfa457`, ~2.3:1 contra branco puro) e os demais tokens de status existentes** — não é uma regressão introduzida por este token, é uma característica pré-existente do sistema de cores (os badges nunca são texto puro sobre branco, sempre têm um fundo tintado na própria cor, o que melhora o contraste percebido). Registrado como débito de acessibilidade do sistema como um todo, não resolvido nesta Onda 0 — ver `redesign-plan.md` como candidato a item futuro se quiser endereçar todos os tokens de status de uma vez.
- **Status**: `APROVADA`.

### D2 — Escopo de "landing premium vinho/vermelho" — ✅ APROVADA
- **Decisão**: a direção "Landing Page premium, assinatura vinho/vermelho" é um **refinamento** da identidade atual — preserva paleta (Preto/Carmim/Marfim), Bodoni Moda, Inter, tom premium e a narrativa comercial existente. **Nenhuma mudança estrutural na Landing Page acontece na Onda 0.**
- **Contexto**: a Onda 0 só documenta como o design system (tokens desta etapa) deve, futuramente, se aplicar à landing — a aplicação de fato fica para a Onda 4 (`redesign-plan.md` §5), quando for aprovada separadamente.
- **Como o design system se aplica à landing (documentado agora, aplicado depois)**: `landing.css` já consome os mesmos tokens de cor (`--accent`, `--bg-base`, `--text-*`) e fontes (`--font-display`, `--font-texto`) de `index.css` — os tokens novos desta Onda 0 (espaçamento, raio) ficam disponíveis para a landing automaticamente por herdarem de `:root`, mas `landing.css` não é editado nesta etapa. Quando a Onda 4 for aprovada, o trabalho é: (a) trocar valores soltos de espaçamento/raio da landing pelos tokens novos sem mudar nenhum pixel, (b) só então avaliar ajustes de hierarquia seção a seção.
- **Status**: `APROVADA` (como refinamento futuro documentado; implementação na landing continua fora da Onda 0).

### D3 — Componentes React compartilhados — ✅ APROVADA
- **Decisão**: criar componente React só quando há comportamento/estado/semântica reutilizável — não converter toda classe CSS em componente artificial. Conjunto inicial (Onda 0), criado **só se não existir equivalente**: `Button`, `Status`/`StatusBadge`, `Badge`, `FormField`, `Modal` (escolhido em vez de `Drawer` — ver nota abaixo), `EmptyState`. `ReservationRow` fica para a etapa "dashboard e reservas do dia" (ver nota).
- **Verificação de duplicidade feita antes de criar** (`ui-inventory.md` §3 confirma): não existe hoje nenhum componente React equivalente a nenhum destes — todos os 6 são genuinamente novos. Os únicos componentes existentes são de domínio específico (`Marca`, `ThemeToggle`, `NotificacaoToggle`, `InstalarAppButton`, `CalendarioMes`, `salao-canvas/*`, `checkout/*`, `landing/*`) — nenhum é um primitivo de UI genérico, então não há risco de duplicação.
- **Modal vs. Drawer**: o projeto já tem dois padrões de overlay ad-hoc (`.calendario-mes-flutuante` — popover ancorado, e `.folha-mobile-nav` — bottom sheet de navegação mobile, específico do `Layout.tsx`). Nenhum dos dois é um modal centralizado genérico. Construído `Modal` (overlay + caixa centralizada, com fechamento por Esc/clique fora, foco preso) por ser o padrão que mais falta hoje (confirmação de ação destrutiva, formulários rápidos) — `Drawer` fica para quando uma tela específica precisar (ex.: painel lateral de detalhe), sem duplicar o que `.folha-mobile-nav` já resolve para navegação.
- **`ReservationRow` — deferido, não esquecido**: construir bem esse componente exige decidir a estrutura compartilhada entre a linha de tabela (desktop) e o card mobile (`.reserva-card-mobile`) de `ReservationsPage` — isso é trabalho de conteúdo/hierarquia da tela de Reservas, que o próprio pedido do usuário marca como etapa separada ("dashboard e reservas do dia", depois da Onda 0). Criar `ReservationRow` agora, sem essa etapa, arriscaria um componente errado que precisaria ser refeito. Registrado aqui para não ser esquecido.
- **Status**: `APROVADA`.

### D4 — Breakpoints (mobile / tablet / desktop) — ✅ APROVADA
- **Decisão**: três faixas — **desktop ≥ 1024px** (sidebar completa, densidade atual), **tablet 768–1023px** (sidebar compacta/recolhida por padrão, sem espremer conteúdo), **mobile < 768px** (navegação mobile atual do shell — barra de abas fixa embaixo).
- **Mudança em relação ao que existe hoje**: o corte mobile atual é `≤720px` (`index.css` `@media (max-width: 720px)` e `useEhMobile.ts`). Passa para `<768px` (`max-width: 767px`) para bater com a faixa aprovada — телas entre 721–767px, que hoje já caíam em "desktop" (sidebar completa, possivelmente espremida), passam a usar a navegação mobile já existente, que é mais segura nessa largura do que a sidebar completa.
- **Tablet — o que "menor alteração segura" significa aqui**: reaproveita o mecanismo já existente (`useBarraLateralRecolhida`, sidebar recolhida = 76px via `.barra-lateral.recolhida`) em vez de construir um drawer novo. Na faixa 768–1023px, se o usuário nunca tocou no toggle (sem valor salvo em `localStorage`), a sidebar abre recolhida por padrão; se ele já tem uma preferência salva (de qualquer largura), ela é respeitada. **Limitação documentada**: isso não é um drawer/overlay dedicado de tablet — é o mesmo padrão "sidebar de ícones" do desktop recolhido, sem animação de entrada diferente. Suficiente para não espremer o conteúdo agora; um drawer de tablet dedicado fica para uma etapa futura, se necessário.
- **Status**: `APROVADA`.

### D5 — Validação visual da Onda 0 — ✅ APROVADA
- **Decisão**: sem suíte de teste de UI consolidada, a validação da Onda 0 é: (1) build do projeto, (2) execução dos testes existentes, (3) inspeção visual no navegador quando o ambiente permitir, (4) validação manual nos viewports 1440/1024/768/390/320px, (5) registro das evidências em `docs/design-review.md`.
- **Ambiente real neste sandbox (limitação a registrar, não a resolver agora)**: não há Postgres local disponível (`server/tests` já falha por `ECONNREFUSED` mesmo sem qualquer mudança deste redesign — é uma limitação pré-existente do ambiente, não uma regressão). Isso significa que fluxos autenticados (login real, reservas, salões, mesas) **não podem ser validados fim-a-fim neste sandbox** — só a renderização estática de telas públicas/shell é verificável via navegador automatizado. Isso será declarado explicitamente em `docs/design-review.md`, não escondido.
- **Ferramenta**: `claude-in-chrome` (já disponível nesta sessão) no lugar de Playwright (não instalado, exigiria baixar binário do Chromium) — mesmo objetivo (screenshot em viewports reais).
- **Status**: `APROVADA`.

## Decisões já tomadas (nesta etapa de auditoria, não requerem novo input)

| Decisão | Resolução | Onde |
|---|---|---|
| Manter paleta Preto/Carmim/Marfim e tipografia Bodoni Moda + Inter | Confirmado — já é a identidade em produção, redesign é refinamento | `DESIGN.md` §1–3 |
| Não criar suíte de testes de UI nesta rodada | Fora de escopo do pedido original ("primeiro auditoria e documentação"); registrado como risco, não como tarefa | `redesign-plan.md` §2 |
| `ApresentacaoPage`, `AssinaturaBloqueadaPage`, `/painel/*` fora do escopo do redesign | São telas internas/comerciais, não o produto operacional do restaurante | `redesign-plan.md` §4 |
| `server/` (backend) não é tocado nesta etapa | Nenhuma mudança de backend foi identificada como necessária para o redesign visual; regra explícita do pedido original | `redesign-plan.md` §8 |
| Tokens de espaço/raio nomeiam valores existentes, não introduzem novos valores | Reduz risco — é refatoração "invisível", não mudança visual | `DESIGN.md` §4–5 |

## Pendentes (fora da Onda 0)

Nenhuma no momento — D1–D5 cobriam tudo que bloqueava o início da Onda 0. Novas decisões que surgirem durante a implementação (Onda 0 em diante) entram aqui, no mesmo formato.

---

**Histórico**: D1–D5 propostas em `<sessão anterior>`, aprovadas pelo usuário com parâmetros específicos (cor exata do D1, faixas exatas do D4, lista exata de componentes do D3) em `<esta sessão>`. Onda 0 iniciada logo em seguida — ver `docs/design-review.md` para as evidências de validação.
