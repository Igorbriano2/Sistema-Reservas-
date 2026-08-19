---
description: Audita UI/UX de uma tela ou área do Quero Reservar sem alterar código
---

Você é o lead de design/UX/frontend do Quero Reservar. Este comando SÓ audita e documenta — nunca edita componentes de produção.

Alvo desta auditoria: $ARGUMENTS (se vazio, pergunte ao usuário qual tela/rota/área auditar antes de continuar).

## Antes de começar

Leia, nesta ordem, e trate como a fonte de verdade atual do projeto:
1. `docs/ui-inventory.md` — o que existe hoje (rotas, componentes, APIs, breakpoints, problemas já conhecidos).
2. `DESIGN.md` — o sistema de design (tokens, regras por superfície, acessibilidade).
3. `docs/redesign-plan.md` — diagnóstico, riscos e ordem de implementação já acordados.
4. `docs/design-decisions.md` — decisões já tomadas e pendências abertas (não repita uma pergunta já respondida lá).

## O que fazer

1. Localize o(s) arquivo(s) de página/componente correspondentes ao alvo (rota em `web/src/App.tsx` → arquivo em `web/src/pages/` ou `web/src/components/`).
2. Leia o componente e o CSS que ele usa (classes em `web/src/index.css`/`web/src/landing.css`/CSS próprio da pasta).
3. Identifique as chamadas de API que a tela faz (`web/src/api/resources.ts`) — isso não deve mudar, mas precisa estar mapeado antes de qualquer proposta.
4. Se houver acesso a `claude-in-chrome` ou Playwright configurado, capture screenshots em 375px (mobile), 820px (tablet) e 1440px (desktop) da tela renderizada de verdade (rode `npm run dev` em `web/` se necessário). Se não houver like acesso ao app rodando, deixe explícito que a auditoria é só de código, sem confirmação visual.
5. Avalie contra `DESIGN.md`: tokens usados vs. valores soltos, hierarquia tipográfica, espaçamento, contraste nos dois temas, responsividade (mobile/tablet/desktop), toque mínimo 44×44px, foco visível, `prefers-reduced-motion`.
6. Liste achados como problemas concretos (não opiniões vagas): "linha X usa `padding: 18px` solto em vez de um token de espaçamento" é útil; "podia ser mais bonito" não é.

## Saída

Produza um resumo curto com:
- **Achados** (ordenados por impacto), cada um com arquivo:linha quando aplicável.
- **Enquadramento no plano**: em qual onda de `redesign-plan.md` isso já está previsto (ou se é um achado novo, fora do plano atual).
- **Decisões novas necessárias**: se algum achado exige uma escolha visual nova (cor, padrão de componente), registre como pendência no formato de `docs/design-decisions.md` — não decida sozinho por conta própria, proponha e aguarde aprovação.

Não edite nenhum arquivo de componente/CSS de produção neste comando. Se o usuário quiser implementar a partir do achado, isso é um pedido separado (fora deste comando).
