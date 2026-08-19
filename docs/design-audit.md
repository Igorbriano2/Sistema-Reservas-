# Auditoria Visual e Estrutural — Web App, Login, Reservas, Salões/Mesas, PWA, Landing

> Somente leitura — nenhuma alteração de código nesta etapa. Baseado em leitura de código (não em screenshots multi-viewport reais — ver limitação registrada em `docs/design-review.md` §3: o navegador automatizado deste sandbox não altera o viewport real da página, então todo achado de responsividade abaixo vem de análise de CSS/JSX, não de captura visual em 1440/1280/1024/768/390/320px). Fluxos autenticados (reservas/salões/mesas de verdade, com dados reais) também não puderam ser exercitados neste sandbox por falta de Postgres local — a leitura de código foi extensa o suficiente para achar problemas concretos e verificáveis, mas uma passada visual real no seu ambiente continua recomendada antes de fechar qualquer correção.

## Landing Page

Está neste mesmo repositório (`web/src/pages/LandingPage.tsx` + `web/src/landing.css` + `web/src/components/landing/*`) — não há um projeto separado.

## Top 10 correções por impacto

| # | Achado | Impacto | Risco de implementação |
|---|---|---|---|
| 1 | ~~`.form-login` com largura fixa (320/360/380px, sem `max-width`/fallback responsivo) usada em quase toda tela pública centralizada~~ **CORRIGIDO** — ver `docs/design-review.md` §5 | Corta/estoura horizontalmente em qualquer viewport ≤390px — inclui a tela de **login**, o **checkout pago** (`/assinar`) e a **reserva pública** (o link que o agente de IA manda no Instagram) | Baixo — o próprio `PublicReservationPage.tsx:521` já usa o padrão certo (`width: min(760px, 92vw)`); foi replicado |
| 2 | ~~Edição de salão expande dentro de uma célula de tabela~~ **CORRIGIDO** (migrado pra `Modal`) — ver `docs/design-review.md` §8 | Em mobile/tablet, o formulário de edição fica confinado à largura rolável da tabela — campos e botões "Salvar"/"Cancelar" exigem scroll horizontal pra alcançar | Médio — mover para `Modal` (já existe, Onda 0), mas é mudança de fluxo real |
| 3 | ~~Editor visual de mesas fica com pouca altura útil em telas estreitas~~ **ENDEREÇADO** (mobile agora mostra lista por padrão, canvas fica atrás de um toggle) — ver `docs/design-review.md` §8. **Não testado em dispositivo real** (maior risco residual desta rodada) | Área pequena demais pra arrastar mesas com precisão no touch — o próprio pedido do usuário para a etapa "salões e mesas" já antecipa isso ("evite reproduzir um editor complexo numa tela estreita sem adaptar a interação") | Alto — interação customizada (drag/SVG), precisa validação em dispositivo real |
| 4 | ~~Empty state de Reservas (`"Nenhuma reserva para esta data."`) é só texto solto, sem ícone nem ação~~ **CORRIGIDO** — ver `docs/design-review.md` §7 | Usuário sem reserva no dia não tem nenhum atalho pra criar uma ali mesmo — precisa achar o botão "+ Nova reserva" lá em cima | Baixo — componente `EmptyState` já existe (Onda 0), é só usar |
| 5 | ~~Loading (`"Carregando..."`) é texto plano sem skeleton em Reservas~~ **CORRIGIDO em Reservas/Dashboard** (Mesas e outras telas de lista ainda pendentes) — ver `docs/design-review.md` §7 | Salto de layout (CLS) quando o conteúdo chega — típico de app que "pisca" | Baixo/médio — componente `Skeleton` criado nesta etapa |
| 6 | ~~Coluna de ações da tabela de Reservas acumula até 5 botões sem regra de wrap~~ **CORRIGIDO** (`.acoes{flex-wrap:wrap}` global, vale pra todas as telas que usam essa classe) — ver `docs/design-review.md` §7 | Em tablet (nova faixa 768–1023px) ou desktop com sidebar expandida, a linha fica muito larga — hoje só o scroll horizontal da tabela segura isso | Médio |
| 7 | ~~Formulário "Novo salão" tem até 7 campos numa única grade sem seções~~ **CORRIGIDO** (3 seções visuais) — ver `docs/design-review.md` §8 | Difícil de escanear rapidamente — o problema de hierarquia já mapeado em `ui-inventory.md` aparece concretamente aqui | Baixo |
| 8 | Ponto de corte mobile/tablet agora vive em 4 lugares sem fonte única (`index.css` × 2 media queries, `useEhMobile.ts`, `useEhTablet.ts`) | Risco de dessincronia se o valor mudar no futuro (já era um risco conhecido, `ui-inventory.md` #5 — piorou de 2 pra 4 lugares na Onda 0) | Baixo agora, cresce com o tempo se não for endereçado |
| 9 | ~~iOS sem fluxo de instalação PWA guiado~~ **FALSO POSITIVO** — corrigido nesta linha na etapa PWA/mobile: `InstalarAppButton.tsx` (não lido a fundo na auditoria original, só `useInstallPrompt.ts`) já detecta iOS e mostra o passo a passo manual ("Compartilhar → Adicionar à Tela de Início"). Peço desculpa pelo achado incorreto — ver `docs/design-review.md` §9 | ~~Funcionário com iPhone não vê instrução de instalação~~ (não procede) | — |
| 10 | Popover do calendário mensal (`ReservationsPage`) — **não é um bug**, registrado aqui só pra não ser confundido com um: ancora na linha inteira (`.seletor-data`) e não no botão que o abre, de propósito documentado no próprio CSS pra nunca vazar da viewport no mobile | — (ponto forte, ver seção abaixo) | — |

## Detalhamento por categoria

### Overflow horizontal (achado #1 acima, detalhado — CORRIGIDO, ver `docs/design-review.md` §5)

- **Arquivo/seletor**: `.form-login` (`web/src/index.css:1112`), sem `max-width` nem `width:100%` — só `width: 320px` fixo.
- **Onde é usado com largura ainda maior via `style` inline**: `PublicReservationPage.tsx:88,446,587` (`width: 360`), `WidgetReservationPage.tsx:132,170` (`width: 320`), `PublicSurveyPage.tsx:96` (`width: 360`), `CheckoutPage.tsx:86` (classe extra `.checkout-card`, `width: 380px` em `index.css:1417`).
- **Onde já usa o padrão responsivo certo**: `PublicReservationPage.tsx:521` — `style={{ width: "min(760px, 92vw)" }}`. Ou seja, a correção já existe no mesmo arquivo, só não foi aplicada nos outros pontos.
- **Viewport afetado**: qualquer um ≤390px (inclui os dois menores da lista pedida: 390×844 e 320×700) — em 320px, `.tela-login` (padding 1.5rem = 24px cada lado) sobra 272px de área útil contra 320–380px exigidos pelo card = até ~108px de estouro horizontal, escondido pelo `overflow-x:hidden` do `body` (ou seja, parte do formulário fica inacessível, não só feio).
- **Rotas afetadas**: `/login`, `/assinar`, `/reservar/:token` (3 telas do fluxo), `/widget/:unidadeId` (2 telas), `/pesquisa/:token`, `/cardapio/:unidadeId` (tela de erro).
- **Correção recomendada**: trocar `width: 320px`/`380px` fixos por `width: min(<valor>, 92vw)` (mesmo padrão já usado em `PublicReservationPage.tsx:521`), e revisar/remover os overrides inline redundantes de `360`/`320`/`380` nas páginas listadas.
- **Risco**: baixo — é uma classe CSS compartilhada + poucos overrides inline, sem lógica envolvida.

### Hierarquia visual

- `TablesPage.tsx` — formulário "Novo salão" com até 7 campos numa única `.linha-form` sem seções (achado #7).
- `ReservationsPage.tsx` — cartões (`.cartao`) empilhados sem diferenciação visual entre "busca", "filtro de data + ações", "lista" e "resumo" — todos usam o mesmo fundo/borda, hierarquia vem só da ordem vertical (consistente com o achado já registrado em `ui-inventory.md` #2, "cards genéricos").

### Tipografia

- Nenhum problema novo encontrado nas telas auditadas nesta etapa — o padrão Bodoni Moda (títulos)/Inter (corpo) é seguido de forma consistente em Login, Reservas, Mesas.

### Contraste

- Nenhum problema novo além do já registrado em `docs/design-decisions.md` D1 (contraste de `--status-*` como texto puro sobre fundo branco no tema claro, débito pré-existente do sistema, não desta auditoria).

### Responsividade

- Achados #1, #2, #3, #6 acima.
- `ReservationsPage.tsx` já tem um padrão tabela↔card bem feito (`.reservas-mobile` / `.tabela-reservas`, alternando via CSS por breakpoint) — **não generalizado** ainda para `TablesPage` (a tabela de salões só tem `.tabela-scroll`, sem versão em card para mobile).

### Touch targets

- Botões de ação dentro de `.reserva-card-mobile-acoes` já respeitam 44px mínimo (`index.css`, regra explícita). Botões da tabela desktop (`ReservationsPage`, `TablesPage`) não têm altura mínima garantida — aceitável em desktop (mouse), mas essa mesma tabela também é a única visão em tablet (768–1023px, sem versão card ainda), onde pode ser tocada num dispositivo híbrido. Risco baixo/médio.

### Overflow vertical

- Nenhum encontrado nas telas lidas — `.chat-instagram-corpo`/`.chat-painel-mensagens` já usam `overflow-y:auto` corretamente.

### Componentes duplicados

- Padrão "cartão com `<h3>` + formulário `.linha-form` + tabela `.tabela-scroll`" é reimplementado do zero em `ReservationsPage`, `TablesPage`, e (por leitura anterior, `ui-inventory.md`) em `SchedulePage`/`BlocksPage`/`MenuPage`/`UsersPage` — nenhum componente `Table`/`Section` compartilhado ainda (`DESIGN.md` §9 já lista isso como prioridade futura, não resolvido nesta etapa).
- `.form-login` reaproveitado em 8 páginas diferentes (positivo — reuso real) mas sem nenhuma responsabilidade de largura responsiva embutida (achado #1) — o reuso é bom, a implementação da largura é que tem o bug.

### Inconsistências de espaçamento

- Nenhuma nova além do já mapeado (`DESIGN.md` §4 — valores soltos em vez de tokens; a Onda 0 introduziu os tokens mas não migrou o CSS existente pra usá-los, por decisão de escopo).

### Inconsistências entre desktop e mobile

- `TablesPage`: editor visual (canvas) recebe tratamento explícito pra telas menores (`@media max-width:900px`, empilha em 1 coluna) mas o CANVAS em si não muda de proporção/interação — só a paleta lateral desce pra baixo (achado #3).
- `ReservationsPage`: tratamento mobile x desktop já é o mais maduro do app (tabela↔card) — nenhuma inconsistência nova encontrada aqui.

### Estados de loading, vazio, erro e sucesso

- **Loading**: texto plano (`"Carregando..."`) em `ReservationsPage`, `TablesPage` — achado #5.
- **Vazio**: texto plano sem ação em `ReservationsPage` (achado #4); `TablesPage` já tem uma mensagem de vazio com direção clara ("Cadastre um salão em modo mapa acima...") — **ponto forte**, mais completo que o de Reservas.
- **Erro**: consistente — `<p className="erro">` ou `<span className="erro">` em todos os formulários lidos, sempre com mensagem específica da API quando disponível (`ApiError`). Nenhum problema encontrado.
- **Sucesso**: não há um padrão de confirmação visual após salvar (o formulário só fecha/recarrega a lista) — funcional, mas sem feedback explícito tipo toast. Nenhum componente de toast existe ainda no projeto.

## Pontos fortes a preservar

- Padrão tabela↔card responsivo de `ReservationsPage` — o melhor exemplo do app, candidato a virar o padrão compartilhado (`DESIGN.md` §9).
- Popover do calendário mensal — posicionamento deliberado pra nunca vazar da viewport no mobile, com o raciocínio documentado no próprio código (achado #10, não é bug).
- Estado vazio do editor de mesas (`TablesPage`) — mensagem com direção clara do que fazer.
- Uso de `ApiError` consistente pra mostrar mensagens de erro específicas do backend em vez de genéricas.
- `touch-action: none` no canvas SVG do editor de mesas — decisão correta e deliberada pra viabilizar drag no touch.
- Confirmação de ações destrutivas (`window.confirm`) presente em 100% dos pontos de exclusão auditados — nenhuma exclusão acontece sem confirmação.

## Proposta de ordem de execução (aguardando aprovação — nada implementado ainda)

1. ~~**Achado #1** (`.form-login` overflow)~~ — **feito**, ver `docs/design-review.md` §5.
2. ~~Onda 2 do `redesign-plan.md` (Dashboard + Reservas do dia)~~ — **feito** (achados #4, #5, #6), ver `docs/design-review.md` §7. Achado #7 (formulário "Novo salão" sem seções) é do `TablesPage`, fica pra Onda 3.
3. ~~Onda 3 (Salões/Mesas)~~ — **feito**, ver `docs/design-review.md` §8. Achado #3 é o de maior risco residual (não testado em dispositivo real).
4. Achado #8 (breakpoint em 4 lugares) — só vale a pena resolver de vez (ex. constante única compartilhada) se o valor precisar mudar de novo; registrar e não agir agora.
5. ~~Achado #9 (instalação PWA no iOS)~~ — era falso positivo, ver acima. Etapa "PWA/mobile" — **feita**, ver `docs/design-review.md` §9 (safe areas, atalhos do manifest, banner offline/reconexão).

Aguardando sua aprovação pra seguir por essa ordem (ou outra que preferir) antes de tocar em qualquer código de novo.
