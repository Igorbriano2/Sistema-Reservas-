# Design Review — Onda 0 (Fundação)

> Evidências de validação da Onda 0 (`docs/redesign-plan.md` §5, `docs/design-decisions.md` D5). Nenhuma tela de conteúdo (Dashboard/Reservas/Mesas/Landing) foi redesenhada nesta etapa — só tokens, shell responsivo e componentes compartilhados novos.

## 1. Build

```
web$ tsc -b            → sem erros
web$ vite build         → sucesso (148 módulos, dist/ gerado)
web$ vite-plugin-pwa     → service worker (sw.js) gerado, 15 entradas no precache (499.75 KiB)
```

Sem warning novo de TypeScript, sem erro de build. CSS final: `dist/assets/index-*.css` (62.59 kB, 11.57 kB gzip) — inclui os tokens/classes novos da Onda 0.

## 2. Testes existentes

`server/tests` (Vitest): **44 de 48 arquivos falham por `ECONNREFUSED 127.0.0.1:5432`** — não há Postgres local neste sandbox (sem `docker`, sem `pg_ctl` disponíveis). Isso é uma **limitação pré-existente do ambiente**, não uma regressão desta Onda 0: os mesmos 4 arquivos/36 testes que não dependem de banco passavam antes e continuam passando; nenhum teste que passava antes começou a falhar.

`web/` não tem framework de teste (`ui-inventory.md` §9, confirmado antes desta etapa) — nada para rodar aqui.

## 3. Validação visual — o que foi possível e o que não foi

**Ferramenta usada**: `claude-in-chrome` (Playwright não estava instalado; baixar o binário do Chromium não valia o tempo para esta etapa).

**Limitação real encontrada e registrada (não escondida)**: a ferramenta de resize do navegador automatizado (`resize_window`) **não afeta o viewport real da página** neste sandbox — confirmado via `window.innerWidth` (permaneceu `1920` depois de pedir `320x700`) e via `window.matchMedia` (não mudava de estado). Tentei contornar com `zoom` CSS, que também não afeta `matchMedia` neste ambiente. **Não foi possível, portanto, capturar screenshots em viewports reais de 1440/1024/768/390/320px neste sandbox** — os 5 screenshots que tirei do login antes de descobrir isso são todos, na prática, do mesmo viewport (~1920px), só reafirmando que nada quebrou em desktop. Registrando isso explicitamente em vez de apresentar os 5 screenshots como se fossem 5 viewports diferentes, o que seria enganoso.

**O que consegui validar de verdade**:
- Login (`/login`) e Landing (`/`) renderizam sem erro em viewport desktop nativo (~1920px), sem quebra visual perceptível, com os tokens novos carregados.
- Console do navegador sem nenhum erro em nenhuma das duas páginas (só 2 warnings pré-existentes do React Router sobre future flags v7, sem relação com esta mudança).
- Tokens novos confirmados carregados corretamente via `getComputedStyle`: `--space-4: 1rem`, `--radius-md: 12px`, `--status-bloqueio: #b7791f`, `--status-bloqueio-bg: rgba(183, 121, 31, 0.16)` — batem exatamente com o aprovado em D1.
- `window.matchMedia("(max-width:767px)")` avaliado como `false` em viewport desktop — consistente com o esperado (não deveria estar em modo mobile num viewport de 1920px).

**O que NÃO pôde ser validado neste sandbox** (nem por limitação de resize, nem por falta de Postgres):
- Comportamento real da faixa **tablet** (768–1023px: sidebar recolhida por padrão, `.conteudo` com padding reduzido) — só verificado por leitura de código, não visualmente.
- Comportamento real do corte **mobile** (<768px: barra de abas fixa embaixo) — idem, só leitura de código.
- **Login, reservas, salões e mesas não puderam ser testados fim-a-fim** — exigem um backend com Postgres respondendo de verdade, indisponível neste sandbox (mesma limitação da seção 2). Não dá para confirmar visualmente o shell autenticado (`Layout.tsx`, sidebar, os botões migrados para `Button`) rodando de verdade.

**Recomendação concreta**: para fechar a validação visual da Onda 0 de verdade, rodar localmente (ambiente do usuário, com Postgres acessível e um navegador de verdade) — abrir `/admin` logado e testar a régua de largura da janela manualmente (ou DevTools → toggle de dispositivo) nos 5 breakpoints, prestando atenção especial em: sidebar recolhida por padrão entre 768–1023px na primeira visita (sem preferência salva), e barra de abas fixa embaixo abaixo de 768px.

## 4. Regressões encontradas

Nenhuma identificada — nem no build, nem no console do navegador, nem na leitura de diff. A ressalva da seção 3 é sobre **cobertura de validação incompleta**, não sobre um problema encontrado.

## 5. Correção pós-auditoria — achado #1 (`.form-login`/`.checkout-card` overflow)

Aplicada isoladamente, conforme proposto em `docs/design-audit.md` (era o item de maior impacto e menor risco, uma correção de bug e não uma decisão de design nova).

**Arquivos alterados**:
- `web/src/index.css` — `.form-login` (linha ~1112) e `.checkout-card` (linha ~1422): `width: <N>px` fixo → `width: min(<N>px, 92vw)`.
- `web/src/pages/PublicReservationPage.tsx` — 3 ocorrências de `style={{ width: 360 }}` → `style={{ width: "min(360px, 92vw)" }}` (a 4ª ocorrência, linha 521, já usava esse padrão e não foi tocada).
- `web/src/pages/WidgetReservationPage.tsx` — 2 ocorrências de `style={{ width: 320 }}` → `style={{ width: "min(320px, 92vw)" }}`.
- `web/src/pages/PublicSurveyPage.tsx` — 1 ocorrência de `style={{ width: 360 }}` → `style={{ width: "min(360px, 92vw)" }}`.

**Validação**: `tsc -b` e `vite build` limpos após a mudança (rodados de novo, sem erro). Não foi possível re-confirmar visualmente em viewport estreito real neste sandbox pela mesma limitação da seção 3 (resize do navegador automatizado não afeta o viewport da página) — o `min()` é CSS padrão amplamente suportado (Chrome/Safari/Firefox atuais), então o risco de regressão é baixo, mas recomendo conferir visualmente em 320–390px no seu navegador antes de considerar fechado.

**Escopo**: só a regra de largura das 6 classes/estilos citados acima — nenhum outro CSS, nenhuma lógica de formulário, nenhum endpoint tocado.

## 6. Escopo confirmado (Onda 0, na época)

- Nenhum endpoint, contrato de API, tipo de dado ou regra de negócio alterado (só CSS, 2 hooks de media query, 6 componentes novos de apresentação, e troca de `<button className="btn ...">` por `<Button variante="...">` em 4 lugares do `Layout.tsx`, que renderizam exatamente as mesmas classes CSS).
- Nenhuma tela de conteúdo (Dashboard, Reservas, Mesas, Landing) teve seu JSX/CSS de página alterado.
- Nenhum `window.confirm()` existente foi trocado por `Modal` (ficou pronto pra uso futuro, D3).

> As duas últimas linhas valiam só até a Onda 2 (seção 7 abaixo) — Dashboard e Reservas já foram tocados desde então.

## 7. Onda 2 — Dashboard + Reservas do dia

Endereça os achados #2 (parcial, só o form de reserva — a edição de salão em `TablesPage` fica pra Onda 3), #4, #5, #6 de `docs/design-audit.md`, mais os pontos pedidos explicitamente: destacar próximas reservas/pendências, filtro por salão, ações de criar/editar mais claras.

**Arquivos alterados**:
- `web/src/pages/DashboardPage.tsx` — card novo "Próximas reservas de hoje" (reaproveita os dados já buscados por `listarReservasPorPeriodo`, sem chamada de API nova; só aparece quando "hoje" está dentro do período selecionado); `STATUS_ORDEM` com "pendente" primeiro; `StatusBadge`/`EmptyState`/`Skeleton` no lugar de badge/texto/`<p>Carregando...</p>` soltos.
- `web/src/pages/ReservationsPage.tsx` — formulário de nova/editar reserva migrado de `<form className="cartao">` inline (empurrava o resto da página pra baixo) para `Modal`; filtro por salão novo (só aparece quando há mais de 1 salão, reseta ao trocar de data); `StatusBadge`/`EmptyState`(com ação: "+ Nova reserva" no vazio total, "Limpar filtros" no vazio por filtro)/`Skeleton` no lugar dos equivalentes soltos.
- `web/src/index.css` — `.acoes { flex-wrap: wrap; }` (achado #6); CSS novo de `.skeleton` (shimmer, respeita `prefers-reduced-motion`).
- `web/src/components/ui/Skeleton.tsx` (novo componente, + export no `index.ts`).

**O que NÃO mudou**: nenhum endpoint (`listarReservas`, `listarReservasPorPeriodo`, `criarReserva`, `atualizarReserva`, `cancelarReserva` — todos intactos), nenhum tipo, a confirmação de cancelamento continua via `window.confirm()` nativo (não migrada pro `Modal` nesta etapa, pra manter o escopo contido), autenticação/permissões intocadas.

**Validação**: `tsc -b` e `vite build` limpos. Login e Landing (as únicas rotas alcançáveis sem Postgres) seguem renderizando sem erro de console após a mudança — confirma que os componentes novos/CSS compartilhado não quebraram nada fora do escopo. **Dashboard e Reservas em si não puderam ser abertos no navegador neste sandbox** (exigem login real, sem Postgres local) — validado só por leitura de código + compilação limpa. Recomendo abrir as duas telas no seu ambiente antes de considerar fechado, prestando atenção especial em: o Modal abrindo/fechando corretamente (Esc, clique fora, botão X), o filtro de salão, e o card "Próximas reservas" com/sem "hoje" no período.

**Regressões**: nenhuma encontrada (build limpo, sem erro de tipo, uso de componentes já testados na Onda 0).

## 8. Onda 3 — Salões, Mesas e Mapa Visual

Endereça os achados #2 (parte que faltava, edição de salão), #3 (mobile do canvas) e #7 de `docs/design-audit.md`, mais o pedido explícito de diferenciar estados operacionais das mesas.

**Arquivos alterados**:
- `web/src/pages/TablesPage.tsx` — edição de salão migrada pra `Modal` (igual Onda 2); formulário "Novo salão" dividido em 3 seções visuais (`.titulo-secao-form`: dados básicos / horário de reserva / campanha); busca `listarReservas` (hoje) e `listarBloqueios` (já existentes, reaproveitados de `ReservationsPage`/`BlocksPage`) pra calcular o estado operacional de cada mesa; legenda de estados; alternância lista↔canvas no mobile (`verCanvasNoMobile`, começa como lista).
- `web/src/components/salao-canvas/SalaoCanvasEditor.tsx` — novo prop opcional `estadosOperacionais` (repassado sem alterar nenhuma lógica de arraste/CRUD existente).
- `web/src/components/salao-canvas/SalaoCanvasSvg.tsx` — novo prop opcional `estadosOperacionais`; classe `estado-<x>` e `<title>` (tooltip nativo) só quando `modo === "edicao"` **e** o prop é passado — o modo `"selecao"` (usado pela reserva pública/`PublicReservationPage.tsx`) fica bit-a-bit idêntico a antes, confirmado por leitura de código (nenhum call site público passa esse prop novo).
- `web/src/components/salao-canvas/salao-canvas.css` — 3 classes de estado (`estado-reservada`/`estado-ocupada`/`estado-bloqueada`, cada uma com cor **e** traço diferente — a bloqueada é tracejada — pra não depender só da cor, como pedido); CSS da legenda e da lista mobile.
- `web/src/index.css` — `.titulo-secao-form` (novo, achado #7).

**Estados suportados de verdade** (leia com atenção — é uma decisão de escopo, não uma limitação escondida): o pedido original citava 5 estados ("livre, reservada, ocupada, bloqueada, indisponível"). O modelo de dados atual (`Mesa` não tem nenhum campo de status — é só estrutura/posição) só sustenta **3 estados deriváveis com honestidade** a partir de endpoints que já existem: **reservada** (reserva pendente/confirmada hoje), **ocupada** (reserva com status "concluída" = sentada hoje) e **bloqueada** (bloqueio ativo hoje, `BlocksPage`). "Livre" é a ausência de qualquer um dos três (aparência padrão, sem selo — pra não poluir o canvas quando a maioria das mesas está livre, que é o caso comum). Não inventei um 5º estado "indisponível" separado de "bloqueada" porque não há nenhum dado no backend que sustente essa distinção sem uma mudança de contrato de API — e a regra explícita desta etapa foi "não altere o contrato da API". Se isso não for a leitura certa do que "indisponível" deveria significar, me avise e ajusto.

**O que NÃO mudou**: nenhum endpoint novo (`listarReservas`/`listarBloqueios` já existiam e já eram usados em outras telas), nenhum campo novo no banco, toda a lógica de arrastar/redimensionar/criar/excluir mesa e elemento do canvas intocada, modo "simples" de salão intocado, modo "seleção" do canvas (reserva pública) comprovadamente intocado.

**Validação**: `tsc -b` e `vite build` limpos. Login segue renderizando sem erro de console. **`TablesPage` em si (canvas, legenda, lista mobile, modal de edição de salão) não pôde ser aberta no navegador neste sandbox** — exige login real + Postgres, indisponível aqui. Esta é, por isso, a etapa com menor confiança de validação de toda a Onda até agora — recomendo fortemente abrir `/admin/mesas` no seu ambiente antes de considerar isso pronto, testando especificamente: (1) o canvas continua arrastando/redimensionando/salvando mesas normalmente, (2) as cores/tracejado dos 3 estados aparecem certas com dados reais de hoje, (3) o toggle lista↔canvas no mobile, (4) o Modal de editar salão.

**Regressões**: nenhuma encontrada por leitura de código; risco residual maior que as etapas anteriores por não ter sido possível testar interativamente (ver acima).

## 9. Onda 4 — PWA/mobile

Passa item a item pela lista pedida (manifest, ícones, viewport/safe areas, navegação inferior, ações rápidas, calendário, listas, modais, loading, offline/reconexão, notificações, rolagem/teclado) — a maioria já estava em bom estado (ver o que ficou de fora abaixo, com o motivo).

**Arquivos alterados**:
- `web/index.html` — `viewport-fit=cover` adicionado ao meta viewport (pré-requisito pra `env(safe-area-inset-*)` funcionar; sem efeito em navegador que não suporta).
- `web/src/index.css` — safe-area bottom na barra de abas fixa mobile, em `.area-principal` e em `.folha-mobile-nav` (todos usando `env(safe-area-inset-bottom, 0px)`, que cai pra 0 sozinho em qualquer aparelho sem essa faixa — mudança inofensiva fora de iPhone com home indicator); `.faixa-offline` (nova).
- `web/vite.config.ts` — `shortcuts` no manifest (Reservas do dia / Fila de espera / Conversas — as 3 telas já marcadas `operacao: true` no `Layout.tsx`, ou seja, a própria definição do app do que é "ação rápida" pra quem está na operação).
- `web/src/lib/useOnline.ts` (novo) + `web/src/components/Layout.tsx` — banner "Sem conexão" via `navigator.onLine`/eventos `online`/`offline`, some sozinho quando volta.

**Correção de um achado da própria auditoria**: o achado #9 (`docs/design-audit.md`) dizia que o iOS não tinha fluxo de instalação guiado. Ao abrir `InstalarAppButton.tsx` nesta etapa (a auditoria original só tinha lido `useInstallPrompt.ts`), descobri que **já existe** — detecção de iOS + instruções manuais completas ("Compartilhar → Adicionar à Tela de Início"). Corrigi o achado no lugar de construir algo redundante. Registro isso porque prefiro admitir um erro da auditoria a deixá-lo silenciosamente "consertado" sem explicação.

**O que ficou de fora, com o motivo**:
- **Offline de dados**: instrução explícita da etapa foi não inventar essa infraestrutura — só o banner de reconexão acima (tratamento de rede, não cache).
- **`.chat-instagram-corpo` (altura do chat no mobile)**: não recebeu o ajuste de safe-area — o cálculo de 281px já é pixel-a-pixel medido à mão (comentário original cita um bug real de produção que isso corrigiu). Sem conseguir testar num iPhone de verdade, preferi documentar a lacuna no próprio CSS a arriscar quebrar um cálculo já calibrado. Ver comentário em `index.css` junto à regra.
- **Manifest (nome/ícones)**: já completo (192/512/maskable/apple-touch-icon, nome/descrição claros) — nada para corrigir.
- **Notificações push**: já funcionais (`NotificacaoToggle`, `lib/push.ts`, handler de `push`/`notificationclick` em `sw.ts`) — nenhum defeito identificado.
- **Calendário, listas de reservas, modais**: já endereçados nas Ondas 2/3, ou já em bom estado (calendário — ver achado #10/"ponto forte" da auditoria).

**Validação**: `tsc -b` e `vite build` limpos; conferido que `dist/manifest.webmanifest` gerado contém os `shortcuts` corretamente. Login segue sem erro de console. **Safe areas e o banner offline não puderam ser testados num iPhone/aparelho com home indicator de verdade** (o navegador automatizado deste sandbox roda num desktop) — recomendo testar no seu ambiente, especialmente a barra de abas fixa no mobile e o banner ao desligar o wifi.

**Regressões**: nenhuma encontrada.

## 10. Fechamento de pendências (pós-revisão final)

A pedido do usuário, resolvidas 2 das 4 pendências registradas em `docs/final-design-review.md`:

- `TablesPage`: `<p>Carregando...</p>` solto → `Skeleton` (`web/src/pages/TablesPage.tsx`).
- `.chat-instagram-corpo` (altura do chat no mobile, `web/src/index.css`): agora soma `env(safe-area-inset-bottom, 0px)`, mesmo padrão já aplicado em `.barra-lateral`/`.area-principal`/`.folha-mobile-nav` na Onda 4 — não era mais "não mexer às cegas", era completar um padrão já em uso 3 vezes no mesmo arquivo.

**Não resolvido** (não é possível neste sandbox): recapturar os prints da Landing Page — exige Postgres rodando de verdade, indisponível aqui. Instruções de como o usuário pode gerar os prints (ou pedir de novo com acesso a banco) em `docs/final-design-review.md`.

**Validação**: `tsc -b` e `vite build` limpos após as duas mudanças.
