# DESIGN.md — Sistema de Design do Quero Reservar

> Este documento formaliza e **estende** o sistema visual que já existe em `web/src/index.css` — não propõe trocar cores/fontes de marca já estabelecidas (ver `docs/ui-inventory.md` §4). O objetivo é dar nome e disciplina ao que já funciona, preencher lacunas (espaçamento, raio, elevação, tablet, estados que faltam) e guiar decisões novas de forma consistente. Mudanças de token vão sempre em `index.css`; nenhuma cor "mágica" nova deve ser escrita direto num componente.

## 1. Propósito visual do produto

O Quero Reservar tem **duas audiências e dois modos** que precisam parecer a mesma marca, mas não a mesma tela:

- **Landing Page**: vende para o dono do restaurante. Precisa de **emoção** — confiança, sofisticação, "isso aqui é sério e bonito o suficiente pro meu salão". Editorial, respiro, movimento sutil.
- **Web App / PWA**: é usado por quem está trabalhando — dono, gerente, funcionário na portaria, muitas vezes no celular com uma fila de clientes na frente. Precisa de **precisão** — escaneável, sem ambiguidade, tocável com o polegar, rápido de ler em condições ruins de luz/atenção. É uma central de operação, não uma vitrine.

Personalidade da marca: **restaurante fino, não startup genérica de SaaS**. Isso já está expresso na identidade "Preto/Carmim/Marfim" e no par tipográfico Bodoni Moda + Inter — o redesign reforça essa direção, não a substitui.

## 2. Cores

### 2.1 Marca (já definidas — `index.css` `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--bg-base` | `#0d0d0d` (escuro) / `#f5efe8` (claro) | Fundo da página |
| `--bg-elevated` | `#171313` / `#ffffff` | Cartões, sidebar, inputs |
| `--bg-elevated-hover` | `#241a1a` / `#f1e9df` | Hover de superfícies elevadas |
| `--border-subtle` | `#2a2222` / `#ddd0c8` | Bordas de cartão/input/divisórias |
| `--accent` | `#d81b46` (Carmim) | Ação primária, links, foco, marca |
| `--accent-deep` | `#a8123a` | Variante escura do acento (gradientes, hover profundo) |
| `--accent-glow` | `rgba(216,27,70,.35 / .22)` | Halo de foco/hover |
| `--text-primary` | `#f5efe8` (Marfim) / `#171313` | Texto principal |
| `--text-secondary` | `#8a7a7a` / `#6b5c5c` | Texto de apoio, labels |

Tema escuro é o **padrão** (`color-scheme: dark`); o claro é opt-in via `ThemeContext` (persistido em `localStorage`, atributo `data-theme="light"` no `<html>`). `--accent` e as cores de status **não mudam** entre temas — só fundo/texto/borda.

Regra: **nunca hardcode um hex num componente.** Se uma tela precisa de uma cor que não existe como token, isso é uma decisão de design nova — registrar em `docs/design-decisions.md` antes de usar.

### 2.2 Semânticas de estado (parcialmente definidas — completar)

Já existem e devem continuar sendo a única fonte de verdade para status:

| Token | Significado hoje |
|---|---|
| `--status-pendente` (`#cfa457`, âmbar) | Reserva pendente, fila "esperando", assinatura atrasada |
| `--status-cancelada` (`#9c6b5c`, terracota) | Reserva cancelada, erro, ação perigosa (`.btn-perigo`) |
| `--status-concluida` (`#7f9c9a`, verde-azulado) | Reserva concluída, fila "sentado" |
| `--status-no-show` (`#7c8574`, oliva) | Cliente não veio |

**Lacunas a preencher** (pedidas explicitamente no escopo — ainda sem token dedicado hoje, ver auditoria):

| Estado novo | Proposta | Justificativa |
|---|---|---|
| **Disponibilidade — disponível** | Reaproveitar `--accent` (mesma leitura de "positivo/confirmado" já usada em `--status-confirmada` implícito via `--accent`) | Evita criar uma 6ª cor só para "disponível"; consistente com badge "confirmada" que já usa `--accent` |
| **Disponibilidade — indisponível/lotado** | Reaproveitar `--status-cancelada` | Mesma semântica de "não dá" já usada em cancelamento |
| **Bloqueio** (horário bloqueado manualmente) | Novo token `--status-bloqueio` (proposta: um roxo/ardósia neutro, ex. `#8a7ca8`, para não colidir com nenhum status de reserva) | Hoje `BlocksPage` não usa uma cor de status própria — herda genérico. Bloqueio é uma ação do restaurante, semanticamente diferente de "cancelada" (cliente) |
| **Sucesso** (fora do contexto de reserva — ex. "salvo com sucesso") | Reaproveitar `--accent` | Já é o padrão em `.sucesso` (`index.css:1060`) |
| **Alerta** (aviso não bloqueante — ex. assinatura atrasada) | Reaproveitar `--status-pendente` | Já é o padrão em `.faixa-aviso-assinatura` |
| **Erro** (validação de formulário, falha de rede) | Reaproveitar `--status-cancelada` | Já é o padrão em `.erro` (`index.css:1055`) |

→ **Decisão pendente de aprovação**: cor exata de `--status-bloqueio` (é a única cor genuinamente nova proposta neste documento). Ver `docs/design-decisions.md`.

## 3. Tipografia

- **Display** (`--font-display`, Bodoni Moda): `h1`/`h2`/`h3`, números grandes de métrica, hora em destaque nos cards de reserva mobile. Peso 800, `letter-spacing: -0.01em`. Uso editorial — títulos de seção, hero da landing, valores que precisam de peso visual.
- **Texto** (`--font-texto`, Inter): tudo o resto — corpo, labels, botões, tabelas, formulários. Pesos 400/500/600 carregados.
- Regra de uso: **Bodoni Moda nunca em blocos de texto corrido nem em UI densa** (tabelas, formulários longos) — é para poucos elementos por tela, com intenção. Inter é o piso de legibilidade da operação.
- Escala tipográfica: hoje definida por valor solto em cada regra (`1.9rem` métrica, `1.4rem` título de tela, `0.9rem` corpo, `0.85rem`/`0.8rem` apoio, `0.7rem`/`0.75rem` micro). Ao criar telas novas, **reaproveitar esses mesmos degraus** em vez de inventar tamanhos intermediários.

## 4. Espaçamento (novo — formalizar)

Não existe hoje uma escala nomeada; os valores em uso convergem para múltiplos de `0.25rem`/`4px`. Propõe-se nomear (sem alterar nenhum valor existente — só dar nome ao que já é usado):

| Token proposto | Valor | Onde já aparece hoje |
|---|---|---|
| `--space-1` | `0.25rem` (4px) | gaps pequenos (badge, ícone+texto) |
| `--space-2` | `0.5rem` (8px) | gaps de formulário, `.linha-form` |
| `--space-3` | `0.75rem` (12px) | padding de card compacto, `.linha-form` margin |
| `--space-4` | `1rem` (16px) | padding padrão mobile, gap de grid |
| `--space-5` | `1.25rem` (20px) | padding de `.cartao`, margem entre cartões |
| `--space-6` | `1.5rem` (24px) | padding de `.conteudo`, `.barra-lateral` |
| `--space-8` | `2rem` (32px) | padding de telas centralizadas (login) |

→ Introduzir esses tokens é uma refatoração de baixo risco (troca de valor por `var()`, sem mudar nenhum pixel) — ver `redesign-plan.md`, não é obrigatória para o redesign visual em si, mas facilita manter consistência daqui pra frente.

## 5. Bordas, raio e elevação (novo — formalizar)

| Token proposto | Valor | Uso hoje |
|---|---|---|
| `--radius-sm` | `8px` | botão, input, badge de grupo-nav |
| `--radius-md` | `12px` | `.cartao`, popovers, chat |
| `--radius-lg` | `14px` | cartões grandes (login, escolha de painel), folha mobile |
| `--radius-full` | `999px` | pílulas, badges, avatar |

Elevação: o sistema hoje usa **borda sutil + fundo ligeiramente mais claro** como recurso primário de separação (não sombra pesada) — sombra (`box-shadow`) é reservada para **overlay de verdade** (popover de calendário, folha mobile, banner de cookies, formulário de login) e para o glow de foco/hover do acento. Manter essa hierarquia: cartão comum = borda, não sombra; sombra = "isto está flutuando sobre o resto".

## 6. Responsividade

Regra geral: **mobile-first para leitura, desktop-first para densidade de dado.** Isto é: telas de consulta rápida (reservas do dia, fila de espera, conversas) devem funcionar bem em portrait mobile desde o design; telas de configuração densa (mesas, horários, cardápio) podem assumir desktop como padrão e só garantir que o mobile *funciona*, não que é a experiência ideal.

Breakpoints (consolidar em variáveis de referência, mesmo sem `container queries`):

| Nome | Largura | Uso |
|---|---|---|
| `mobile` | `≤ 720px` | já existe — sidebar vira barra de abas, tabela vira cards |
| **`tablet` (novo)** | `721px – 1024px` | **lacuna hoje** — sidebar deveria abrir recolhida por padrão (`useBarraLateralRecolhida`) nessa faixa, e `.conteudo` (hoje `max-width: 1100px` fixo) precisa de padding lateral reduzido em vez de aparecer "apertado" |
| `desktop` | `> 1024px` | comportamento atual sem mudança |

Áreas mínimas de toque: **44×44px** em qualquer alvo tocável no admin/PWA (já seguido em `.reserva-card-mobile-acoes .btn { min-height: 44px }` — **generalizar essa regra** para todo botão/ícone-de-ação em contexto mobile, não só o card de reserva).

## 7. Regras por superfície

### Landing Page
- Pode usar movimento (parallax, reveal-on-scroll, marquee) livremente, sempre atrás de `prefers-reduced-motion`.
- Hero e seções de virada (`.lp-virada`) podem quebrar a grade de espaçamento do admin para respirar mais — a landing já tem seu próprio arquivo CSS por esse motivo, manter a separação.
- CTA primário sempre com `--accent`; nunca mais de um CTA "cheio" competindo na mesma dobra.

### Web App (admin)
- Densidade de operação: tabelas e listas são o padrão para desktop; cards grandes tocáveis (já existe em `.reserva-card-mobile`) são o padrão para mobile — **generalizar esse padrão** (tabela↔card) para outras listas densas (fila de espera, conversas) em vez de forçar scroll horizontal de tabela em tela pequena.
- Toda ação destrutiva (excluir mesa, cancelar reserva, remover usuário) usa `.btn-perigo` + confirmação — nunca excluir direto no primeiro clique.
- Estado vazio (nenhuma reserva no dia, nenhuma conversa) sempre com mensagem + próxima ação sugerida, nunca uma tabela/lista em branco sem contexto.

### PWA / mobile
- `start_url` continua `/admin` (funcionário abre direto na operação, não na landing) — não mudar sem justificativa forte.
- Barra de abas fixa embaixo é a navegação primária em mobile; qualquer tela nova precisa decidir em qual grupo do `Layout.tsx` (`NAV`) ela entra, não criar um padrão de navegação paralelo.
- iOS: já que não há `beforeinstallprompt`, qualquer melhoria de onboarding de instalação (banner "adicione à tela de início" manual) é uma decisão de produto nova — registrar em `design-decisions.md` antes de implementar.

## 8. Acessibilidade, foco e teclado

- Contraste: `--text-secondary` sobre `--bg-elevated` precisa ser conferido em ambos os temas ao introduzir qualquer combinação nova (o par atual já foi calibrado; não presumir que vale para uma cor nova sem checar).
- Foco visível: o padrão já existe (`box-shadow: 0 0 0 3px var(--accent-glow)` em inputs) — **todo elemento interativo novo precisa de um estado `:focus-visible` equivalente**, especialmente em componentes customizados (canvas de salão, calendário) que não são `<input>`/`<button>` nativos.
- `prefers-reduced-motion` já é respeitado nos três arquivos CSS — manter em qualquer animação nova.
- Toque mínimo 44×44px (seção 6) vale também como regra de acessibilidade motora, não só "mobile".
- Navegação por teclado: o canvas de salão (`SalaoCanvasEditor`) é o ponto de maior risco (drag-and-drop visual) — auditar se há alternativa por teclado antes de expandir essa tela (fora do escopo desta etapa, registrar como risco em `redesign-plan.md`).

## 9. Componentes prioritários (para o plano de implementação)

Ordem de valor (mais componentes reaproveitados primeiro), detalhado em `docs/redesign-plan.md`:

1. **Botão** (`.btn`, `.btn-secundario`, `.btn-perigo`, `.btn-icone`) — já consistente via CSS; maior ganho é virar componente React tipado (evita esquecer classe/estado disabled).
2. **Cartão** (`.cartao` + variantes `-metrica`/`-grafico`) — maior causa do "genérico" reportado; precisa de variantes com hierarquia (título + eyebrow + ação) em vez de um único padrão.
3. **Badge de status** (`.badge-*`) — já semanticamente correto, só precisa do token `--status-bloqueio` novo (§2.2).
4. **Tabela ↔ Card responsivo** — hoje implementado ad-hoc só em `ReservationsPage`; extrair o padrão para reaproveitar em `WaitingListPage`/`ConversasPage`.
5. **Input/Select/Textarea** — já consistentes via seletor de tag; risco baixo.
6. **Empty state** — não existe como padrão hoje; criar.
