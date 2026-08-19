# Inventário de UI — Quero Reservar

> Auditoria de código (sem alterar nada). Base: `web/` na branch `claude/restaurant-booking-ai-agent-tjfvag`, commit `7e04dc3`. Gerado como primeira etapa do processo de redesign incremental — ver `docs/redesign-plan.md` e `DESIGN.md`.

## 1. Stack e estrutura

- React 18 + TypeScript + Vite 5, roteamento com `react-router-dom` (`BrowserRouter`).
- Sem framework de CSS (sem Tailwind/CSS-in-JS) — CSS global puro em 3 arquivos: `src/index.css` (1747 linhas, admin/app-wide), `src/landing.css` (1885 linhas, só landing), `src/components/salao-canvas/salao-canvas.css` (382 linhas, editor de salão).
- PWA via `vite-plugin-pwa` (estratégia `injectManifest`, service worker próprio em `src/sw.ts`).
- Cliente de API tipado em `src/api/client.ts` + `src/api/resources.ts` (~80 funções, uma por endpoint).
- Autenticação: token JWT + objeto usuário em `localStorage` (`AuthContext.tsx`), painel separado da plataforma (`plataforma/PlataformaAuthContext.tsx`) com token próprio (`plataforma_token`).
- **Sem nenhum framework de teste no `web/`** — `package.json` não lista Vitest/Jest/Playwright, e não há um único arquivo `*.test.*`/`*.spec.*` na pasta. Testes automatizados existem só no backend (`server/tests`).

## 2. Páginas e rotas (`src/App.tsx`)

### Públicas (sem autenticação)
| Rota | Página | Propósito |
|---|---|---|
| `/` | `LandingPage` | Landing comercial (redireciona para `/painel` se o host começar com `painel.`) |
| `/apresentacao` | `ApresentacaoPage` | Tour de funcionalidades com prints reais (material comercial) |
| `/login` | `LoginPage` | Login do painel do restaurante |
| `/reservar/:token` | `PublicReservationPage` | Reserva pública via link enviado pelo agente de IA |
| `/cardapio/:unidadeId` | `PublicMenuPage` | Cardápio público (QR code na mesa) |
| `/widget/:unidadeId` | `WidgetReservationPage` | Widget de reserva embutível em outros sites |
| `/pesquisa/:token` | `PublicSurveyPage` | Pesquisa de satisfação pós-reserva |
| `/assinar` | `CheckoutPage` | Assinatura self-service (Stripe) |
| `/briano` | `PlataformaLoginPage` | Login do painel interno da plataforma (não dos restaurantes) |

### Web App administrativo (`/admin/*`, atrás de `RequireAuth` + `RequirePainelEscolhido` + `Layout`)
| Rota | Página | Guarda extra | Permissão |
|---|---|---|---|
| `/admin/escolher-painel` | `EscolherPainelPage` | — | pós-login, escolhe "Gestão" vs "Operação" |
| `/admin/escolher-loja` | `EscolherLojaPage` | — | pós-login, se a empresa tem >1 unidade |
| `/admin/dashboard` | `DashboardPage` | `RequireOwner` | só dono |
| `/admin/reservas` | `ReservationsPage` | — | qualquer papel com acesso à unidade |
| `/admin/fila-espera` | `WaitingListPage` | — | qualquer papel |
| `/admin/whatsapp` | `WhatsAppPage` | — | qualquer papel |
| `/admin/mesas` | `TablesPage` | `RequirePermissaoNaUnidade` | `editar_salao` |
| `/admin/bloqueios` | `BlocksPage` | `RequirePermissaoNaUnidade` | `editar_salao` |
| `/admin/horarios` | `SchedulePage` | `RequirePermissaoNaUnidade` | `editar_salao` |
| `/admin/cardapio` | `MenuPage` | `RequirePermissaoNaUnidade` | `editar_cardapio` |
| `/admin/relatorios` | `ReportsPage` | `RequirePermissaoNaUnidade` | `ver_relatorios` |
| `/admin/feedback` | `FeedbackPage` | `RequirePermissaoNaUnidade` | `ver_relatorios` |
| `/admin/agente` | `AgentConfigPage` | `RequirePermissaoNaEmpresa` | `editar_agente` |
| `/admin/conversas` | `ConversasPage` | — | chat com clientes (Instagram DM) |
| `/admin/campanhas` | `CampanhasPage` | `RequireOwner` | só dono |
| `/admin/usuarios` | `UsersPage` | `RequirePermissaoNaEmpresa` | `criar_usuarios` |
| `/admin/unidades` | `UnidadesPage` | `RequireOwner` | só dono |

### Painel da plataforma (`/painel/*`, interno — não é o produto vendido ao restaurante)
| Rota | Página |
|---|---|
| `/painel/clientes` | `ClientesPage` |
| `/painel/leads` | `LeadsPage` |
| `/painel/admins` | `AdminsPage` |

**Fora de escopo do redesign nesta etapa** (uso interno/comercial, não é o produto-fim do restaurante): `ApresentacaoPage`, `AssinaturaBloqueadaPage`, e todo o `/painel/*` — ver `docs/redesign-plan.md`.

## 3. Componentes reutilizáveis (`src/components/`)

| Componente | Usado em | Nota |
|---|---|---|
| `Layout.tsx` | todo `/admin/*` | Sidebar + topo + outlet + rodapé; nav com grupos/submenu (desktop) que viram "folha" (bottom sheet) no mobile |
| `Marca.tsx` | Layout, telas centralizadas, landing | Logo "cadeira" (3 blocos SVG) + wordmark Bodoni Moda |
| `ThemeToggle.tsx` | Layout (topo) | Alterna claro/escuro via `ThemeContext` |
| `NotificacaoToggle.tsx` | Layout (topo) | Liga/desliga push (Web Push API) |
| `InstalarAppButton.tsx` | Layout (topo) | Prompt de instalação PWA (`beforeinstallprompt`) |
| `IconeWhatsApp.tsx` | várias páginas | Ícone de marca fixo (verde), reservas/conversas |
| `CalendarioMes.tsx` | `ReservationsPage` | Popover de calendário mensal com contagem de reservas por dia |
| `salao-canvas/SalaoCanvasEditor.tsx` + `SalaoCanvasSvg.tsx` | `TablesPage` | Editor visual de mesas/elementos do salão (drag, CRUD) — CSS próprio |
| `checkout/EtapaPagamento.tsx`, `EtapaSenha.tsx` | `CheckoutPage` | Steps do fluxo de assinatura |
| `landing/Nav.tsx`, `Fx.tsx`, `ChatDemo.tsx`, `TrustSection.tsx`, `FounderSection.tsx`, `ComparisonSection.tsx`, `WaitlistForm.tsx` | `LandingPage` | Seções e efeitos (parallax, reveal-on-scroll, marquee) só da landing |

Não há uma pasta `components/ui/` com primitivos (botão, input, card, modal) — os estilos de botão/input/cartão vêm de **classes CSS globais** (`.btn`, `.cartao`, `input`/`select`/`textarea` estilizados por seletor de tag) em `index.css`, reaproveitadas por convenção em cada página, não por componente React compartilhado. Isso é relevante para o plano de redesign (ver `redesign-plan.md`, seção "componentes a criar").

## 4. Estilos globais e tokens (hoje)

Definidos em `:root` de `index.css` (compartilhado por admin e landing):

- **Cores de marca**: `--bg-base`, `--bg-elevated`, `--accent` (`#d81b46`, "Carmim"), `--text-primary`/`--text-secondary`. Identidade já nomeada nos comentários como "cadeira, Preto/Carmim/Marfim".
- **Tema claro/escuro**: escuro é o padrão (`:root` sem atributo); `html[data-theme="light"]` sobrescreve só bg/texto/borda — `--accent` e cores de status são iguais nos dois temas. Persistido em `localStorage` via `ThemeContext`.
- **Cores semânticas de status** já existem: `--status-pendente`, `--status-cancelada`, `--status-concluida`, `--status-no-show` (cada uma com uma variante `-bg`). Reaproveitadas em reservas, fila de espera (`badge-esperando`, `-chamado`, `-sentado`, `-desistiu`) e barras de progresso do dashboard.
- **Tipografia**: `--font-display` = Bodoni Moda (h1/h2/h3, números grandes) e `--font-texto` = Inter (corpo), carregadas via Google Fonts CDN em `index.html` (não self-hosted).
- **Motion**: `--ease-padrao`, `--duracao-micro` (150ms), `--duracao-painel` (350ms); `@media (prefers-reduced-motion: reduce)` respeitado em `index.css` e `landing.css`.
- Sem escala de espaçamento nomeada (tokens `--space-*`) — valores em `rem` soltos por regra.
- Sem tokens de raio/elevação nomeados — `border-radius` (8px botões/inputs, 12px cartões, 14px cartões grandes, 999px pílulas) e `box-shadow` repetidos ad-hoc por classe.

## 5. Breakpoints em uso

| Breakpoint | Onde | Efeito |
|---|---|---|
| `max-width: 720px` | `index.css`, `landing.css`, `salao-canvas.css` (900px) | Único ponto de corte do **admin**: sidebar vira barra de abas fixa embaixo, tabela de reservas vira cards, chat de conversas vira um painel por vez |
| `min-width: 540px`, `min-width: 760px`, `max-width: 760/880/900px` | só `landing.css` | Ajustes de grid/tipografia da landing em telas médias |

**Achado**: o Web App administrativo trata só "mobile (≤720px)" vs "desktop" — **não há breakpoint de tablet dedicado** no admin. Em telas entre ~720–1024px (tablet, ou notebook com painel lateral aberto), o layout desktop "espreme" sem ajuste específico. Ver `redesign-plan.md`.

## 6. PWA e mobile

- `vite.config.ts`: `VitePWA` com `strategies: "injectManifest"` (não `generateSW`) porque `src/sw.ts` implementa handler próprio de `push`/`notificationclick` (abre `/admin/reservas` ou a URL do payload, foca aba já aberta).
- `start_url: "/admin"` — o app instalado abre direto no painel, não na landing (uso alvo: funcionário na portaria).
- `display: "standalone"`, `orientation: "portrait"`, `theme_color`/`background_color: #0d0d0d`.
- Ícones completos em `public/icons/`: 192/512 (`any`) + 192/512 (`maskable`) + `apple-touch-icon`.
- Cache é só do shell (`globPatterns: js/css/html/png/svg/ico`) — **sem suporte offline de dados** (API não é cacheada), decisão deliberada documentada no código.
- `useEhMobile()` (hook) e a media query CSS `720px` usam o **mesmo valor** (720px) — mas são dois lugares distintos que precisam ser mantidos em sincronia manualmente se o breakpoint mudar.
- `useInstallPrompt.ts` cobre só o evento `beforeinstallprompt` (Chrome/Edge/Android) — sem tratamento de instalação no iOS Safari (que não dispara esse evento; lá a instalação é manual via "Adicionar à Tela de Início", sem prompt programático possível).

## 7. Fluxos de reserva (client-facing)

1. **Reserva via link do agente** (`/reservar/:token`, `PublicReservationPage`) — fluxo principal: cliente recebe link pelo Instagram DM, escolhe salão/mesa/horário. Usa `obterInfoDoLinkDeReserva`, `listarMesasDisponiveisPublico`, `listarHorariosFixosPublico`, `criarReservaPublica`/`criarDepositoDeReservaPublica`.
2. **Reserva via widget embutível** (`/widget/:unidadeId`, `WidgetReservationPage`) — versão para incorporar no site do restaurante. Usa `obterInfoDoWidget`, `listarHorariosFixosWidget`, `criarReservaWidget`.
3. **Reserva/atendimento via chat** — não é uma "página" per se: acontece dentro do Instagram DM, mediado pelo agente de IA (backend `server/src/modules/agent`); o painel só mostra o histórico e permite handoff humano em `ConversasPage`.
4. **Gestão manual pelo restaurante** (`ReservationsPage`, atrás de login) — criar/editar/cancelar reserva em nome do cliente, ver disponibilidade por salão/mesa/horário do dia, calendário mensal.

## 8. Chamadas de API por tela (`web/src/api/resources.ts`)

| Página | Funções de `resources.ts` chamadas diretamente |
|---|---|
| `AgentConfigPage` | `obterAgenteConfig`, `atualizarAgenteConfig`, `urlEmbedDoWidget` |
| `BlocksPage` | `listarBloqueios`, `criarBloqueio`, `removerBloqueio`, `listarSaloes`, `listarMesas` |
| `CampanhasPage` | `obterWhatsappConfig`, `atualizarWhatsappConfig` |
| `CheckoutPage` | `verificarEmailDisponivel`, `verificarUsernameDisponivel` (+ `criarAssinatura`/`criarConta` dentro dos componentes `checkout/*`) |
| `ConversasPage` | `listarConversas`, `listarMensagensDaConversa`, `definirAgentePausado`, `enviarMensagemConversa`, `obterConexaoInstagram`, `urlConectarInstagram` |
| `DashboardPage` | `listarReservasPorPeriodo` |
| `FeedbackPage` | `listarFeedbacks`, `listarPesquisaPerguntas`, `criarPesquisaPergunta`, `atualizarPesquisaPergunta`, `excluirPesquisaPergunta` |
| `MenuPage` | `listarCardapio`, `criarCategoriaCardapio`, `atualizarCategoriaCardapio`, `excluirCategoriaCardapio`, `criarItemCardapio`, `atualizarItemCardapio`, `excluirItemCardapio`, `enviarImagemItemCardapio` |
| `PublicMenuPage` | `obterCardapioPublico` |
| `PublicReservationPage` | `obterInfoDoLinkDeReserva`, `listarMesasDisponiveisPublico`, `listarHorariosFixosPublico`, `criarReservaPublica`, `criarDepositoDeReservaPublica` |
| `PublicSurveyPage` | `obterInfoDaPesquisa`, `enviarRespostasPesquisa` |
| `ReportsPage` | `gerarRelatorio` |
| `ReservationsPage` | `listarReservas`, `listarSaloes`, `listarMesas`, `criarReserva`, `atualizarReserva`, `cancelarReserva` (+ `CalendarioMes` chama `listarReservasPorPeriodo`) |
| `SchedulePage` | `listarRegrasHorario`, `criarRegraHorario`, `atualizarRegraHorario`, `excluirRegraHorario`, `listarExcecoesHorario`, `criarExcecaoHorario`, `excluirExcecaoHorario` |
| `TablesPage` | `listarSaloes`, `criarSalao`, `atualizarSalao`, `excluirSalao`, `listarElementosSalao` (+ `salao-canvas/*` chama `criarMesa`/`atualizarMesa`/`excluirMesa`/`criarElementoSalao`/`atualizarElementoSalao`/`excluirElementoSalao`) |
| `UnidadesPage` | `listarUnidades`, `adicionarUnidade`, `atualizarUnidade` |
| `UsersPage` | `listarUsuarios`, `listarUnidades`, `criarUsuario`, `editarUsuario`, `excluirUsuario` |
| `WaitingListPage` | `listarFilaEspera`, `adicionarNaFilaEspera`, `atualizarStatusFilaEspera`, `removerDaFilaEspera` |
| `WhatsAppPage` | `listarConexoesWhatsapp` |
| `WidgetReservationPage` | `obterInfoDoWidget`, `listarHorariosFixosWidget`, `criarReservaWidget` |
| `LoginPage` | `login` (via `AuthContext`) |
| `LandingPage`, `ApresentacaoPage`, `AssinaturaBloqueadaPage`, `EscolherPainelPage`, `EscolherLojaPage` | nenhuma chamada direta a `resources.ts` (dados vêm do `AuthContext`/localStorage ou são estáticos) |

## 9. Testes existentes

**Nenhum.** `web/package.json` não declara framework de teste (sem Vitest/Jest/Testing Library/Playwright) e não há arquivos `*.test.*`/`*.spec.*` em `web/src`. Qualquer refatoração visual precisa se apoiar em: (a) checagem de tipos (`tsc -b`), (b) inspeção manual/screenshots em múltiplos viewports, (c) os testes de backend existentes (`server/tests`) só cobrem contrato de API, não UI. Recomenda-se **não** introduzir uma suíte de testes de UI nesta etapa (foge do escopo pedido), mas registrar como risco.

## 10. Problemas visuais encontrados (via leitura de código, sem rodar o app)

1. **Sem breakpoint de tablet no admin** — só `≤720px` vs desktop (seção 5). Telas 720–1024px não têm tratamento dedicado.
2. **"Cards genéricos"**: `.cartao` é uma única classe reaproveitada para praticamente tudo (formulários, listas, métricas, popovers) — pouca hierarquia tipográfica dentro do cartão além de `<h2>`/`<h3>` padrão do navegador em algumas telas (não verificado caso a caso nesta auditoria de código; confirmar com prints reais).
3. **Sem design tokens de espaçamento/raio nomeados** — valores repetidos ad-hoc (`0.75rem`, `1.25rem`, `12px`, `14px`...) em vez de uma escala única. Dificulta manter consistência ao redesenhar.
4. **Fontes via Google Fonts CDN** (não self-hosted) — dependência externa de terceiro na landing e no admin; possível FOUC/layout shift até a fonte carregar (não mitigado com `font-display` local nem preload de arquivo de fonte, só `preconnect`).
5. **Dois lugares definindo o mesmo breakpoint** (`useEhMobile.ts` em JS e `720px` no CSS) — risco de dessincronia se um mudar sem o outro.
6. **iOS: sem fluxo de instalação PWA guiado** — `useInstallPrompt` só cobre `beforeinstallprompt` (Chromium/Android); usuário de iPhone (comum em portaria de restaurante) não vê nenhuma instrução de "Adicionar à Tela de Início".
7. **Sem componentes React compartilhados de UI** (botão/input/modal/card como componente) — estilo vem de classes CSS globais aplicadas por convenção em cada página; risco de inconsistência ao evoluir (ex.: um novo formulário "esquecer" uma classe e sair fora do padrão).
8. **Zero cobertura de teste de UI** — qualquer regressão visual só é pega manualmente.

Este inventário é a base para `docs/redesign-plan.md` (diagnóstico → plano) e `DESIGN.md` (sistema de design proposto).
