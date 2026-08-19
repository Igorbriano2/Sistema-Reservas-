# Landing Page — Mockups com produto real

> Registro da etapa "prepare a Landing Page para mostrar o produto real por dentro". Validado visualmente no navegador (viewport desktop nativo do sandbox, ~1920px) — mesma limitação já registrada nas etapas anteriores (`docs/design-review.md`): o navegador automatizado deste sandbox não reproduz viewports estreitos de verdade, então 1280/1024/768/390/320 não foram capturados em screenshot, só avaliados por leitura de CSS (grid responsivo já usado no resto do arquivo).

## Problema encontrado (antes de qualquer mudança)

`web/src/pages/LandingPage.tsx` tinha um componente `PainelMock` — um "dashboard" inteiramente desenhado em CSS/JSX, com nomes fictícios ("Marina R.", "Igor B.", "Família Souza", "Caio L.") that never existiam no sistema de verdade. Isso é exatamente o anti-padrão que a regra desta etapa proíbe: *"Não criar um dashboard fictício que não corresponda ao sistema"*. Substituído por um print real (ver abaixo).

Também encontrado, ao mexer nessa mesma seção: o grid de 2 colunas da seção "A virada" usava `gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)"` **sem** `repeat(auto-fit, ...)` — a única ocorrência desse padrão em todo o arquivo (os outros 2 grids multi-coluna do mesmo arquivo já usavam `repeat(auto-fit, minmax(...))` corretamente). Um grid de 2 colunas fixas com mínimo de 280px cada exige pelo menos 560px de largura disponível — abaixo disso, o grid overflow em vez de empilhar. Corrigido pro mesmo padrão usado em todo o resto do arquivo (mudança de baixo risco, idêntica em telas largas, só muda o comportamento exatamente na faixa estreita onde já estava quebrado).

## Alterações feitas

### 1. Três mockups com telas reais (não ilustrações genéricas)

Prints vêm de `web/src/assets/apresentacao/` — os mesmos já usados em `/apresentacao` (tour comercial), gerados por `server/src/scripts/seed-apresentacao-cervegela.ts`, que existe especificamente para isso ("so para gerar prints de tela"). **Conferi as 3 imagens print a print antes de usar** (ver seção "Fixtures" abaixo) — nenhum dado de cliente real, só nomes/telefones fictícios gerados pelo script de seed.

| # | Onde | Print usado | Legenda pedida |
|---|---|---|---|
| 1 | Seção "A virada" (logo após o hero) | `04-dashboard.webp` | "Veja a noite inteira em uma tela." |
| 2 | Seção "Por dentro da plataforma" (recursos), antes da grade de funcionalidades | `07-mesas-salao.webp` | "Mesas, ocupação e bloqueios sem planilha." |
| 3 | Nova seção "No seu bolso", entre o Comparativo e o Preço | `18-mobile-reservas.webp` | "Acompanhe as reservas de onde estiver." |

Componente novo `Screenshot` (dentro do próprio `LandingPage.tsx`) — substitui o antigo `PainelMock`, reaproveita a moldura visual já existente (`.lp-moldura`, cantos decorativos) e adiciona `.lp-screenshot` (borda + sombra + cantos arredondados, mesmo tratamento visual do antigo mock e do vídeo de vendas, pra parecer parte do mesmo sistema visual).

### 2. CSS novo/removido (`web/src/landing.css`)

- Removido: todo o bloco `.lp-painel-mock*` (13 regras + 1 `@keyframes`) — órfão depois da troca, sem nenhuma outra referência no código.
- Novo: `.lp-screenshot` (+ `img`), `.lp-screenshot-mobile` (limita a largura do print de celular pra não esticar feito um tablet gigante), `.lp-legenda-print` (legenda itálica em Bodoni Moda, mesmo tom editorial do resto da página).

### 3. Correção de responsividade (achado acima)

`gridTemplateColumns` da seção "A virada" — `minmax(280px, 1fr) minmax(280px, 1fr)` → `repeat(auto-fit, minmax(280px, 1fr))`.

## Diferenças entre produto real e o que aparece no print

- O print do dashboard (`04-dashboard.webp`) é **anterior à Onda 2** deste redesign (não mostra o card "Próximas reservas de hoje" nem os componentes `StatusBadge`/`Skeleton`/`EmptyState` novos) — é uma tela real do produto, só não a versão mais atual depois das mudanças recentes. Não recapturei porque não há Postgres local neste sandbox pra gerar um print novo. Se isso importar pra você, recomendo regravar os 3 prints depois que as Ondas 2/3 estiverem validadas em produção.
- Os outros dois prints (`07-mesas-salao.webp`, `18-mobile-reservas.webp`) mostram a UI de antes das Ondas 2/3 também, pelo mesmo motivo.
- Nome da empresa/loja no print é "Restaurante Exemplo" / "Loja Centro" — fixture genérica do seed, não um cliente real.

## Fixtures (conferido antes de usar as imagens)

Abri as 3 imagens (`Read`, visualização direta) antes de decidir usar:
- `04-dashboard.webp`: "Restaurante Exemplo", métricas agregadas, sem nome de cliente nenhum. Seguro.
- `07-mesas-salao.webp`: tabela de salões, "Salão principal". Sem nome de cliente. Seguro.
- `18-mobile-reservas.webp`: mostra uma linha de reserva com nome + telefone (aparenta "Beatriz Alves" / "43991112222"). Conferido contra `server/src/scripts/seed-apresentacao-cervegela.ts` — são dados 100% sintéticos gerados pelo script (`clienteNome: "Marina Ribeiro"`, `"Igor Briano"`, etc., telefones no padrão `4399XXXXXXX`), nunca dados de cliente de verdade. Seguro pra uso comercial — é exatamente pra isso que o script existe.

## Validação

- `tsc -b` e `vite build` limpos.
- Console do navegador sem erros/404 ao carregar `/` (confirma que as 3 imagens novas carregaram certo).
- Sem overflow horizontal detectado em viewport desktop (`document.documentElement.scrollWidth` ≤ `window.innerWidth`).
- **Links testados**: todos os 7 links/anchors da página (`#top`, `#como-funciona`, `#recursos`, `#comparativo`, `#preco`, `/login`, `/assinar`) — os mesmos de antes da mudança (nenhum link foi adicionado/removido/alterado) — e os 5 IDs de âncora confirmados presentes no DOM via JS.
- **Screenshots**: capturei e revisei visualmente as 3 seções novas em viewport desktop (~1920px) — as 3 renderizam corretamente, com o print, a legenda e o texto de apoio lado a lado.
- **Não testado**: viewports estreitos reais (1280/1024/768/390/320) — mesma limitação de sandbox das etapas anteriores. A correção do grid (`repeat(auto-fit, ...)`) segue o mesmo padrão comprovado usado nos outros 2 grids do arquivo, mas recomendo conferir no seu navegador antes de aprovar de vez.

## Regressões

Nenhuma encontrada. Nenhum CTA, link, texto de copy existente ou identidade visual (Preto/Carmim/Marfim, Bodoni Moda) foi alterado — só a substituição do mockup fictício por prints reais, mais os 2 novos blocos de conteúdo (mesas + mobile) inseridos nos pontos pedidos.
