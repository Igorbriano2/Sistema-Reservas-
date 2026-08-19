# QA Checklist — Revisão Final

Legenda: ✅ confirmado · ⚠️ parcial (com o motivo) · ❌ não verificado

| # | Item | Status | Nota |
|---|---|---|---|
| 1 | Build sem erros | ✅ | `tsc -b` e `vite build` limpos, confirmado no fechamento de cada onda e de novo agora |
| 2 | Testes existentes passando | ⚠️ | 36/431 passam (os que não dependem de banco). Os outros 395 falham por `ECONNREFUSED` — **sem Postgres local no sandbox**, limitação pré-existente confirmada antes de qualquer mudança do redesign, não uma regressão nova |
| 3 | Login funcionando | ⚠️ | UI renderiza e responde a teclado/foco sem erro de console (testado); o POST de autenticação de verdade contra o backend não pôde ser exercitado sem banco |
| 4 | Reservas funcionando | ⚠️ | Verificado por leitura de código + compilação limpa; não testado interativamente (mesma limitação de banco) |
| 5 | Criação, edição e cancelamento preservados | ✅ | Nenhuma função de CRUD foi alterada em nenhuma tela — só o invólucro visual (ex: formulário inline → `Modal`) mudou |
| 6 | Salões e mesas funcionando | ⚠️ | Maior risco residual de toda a revisão — o canvas (SVG, drag-and-drop) não pôde ser aberto no navegador neste sandbox. Verificado que o modo "seleção" (reserva pública) fica bit-a-bit idêntico por leitura de código |
| 7 | Nenhum endpoint alterado sem justificativa | ✅ | Zero endpoints novos ou contratos alterados. `TablesPage` passou a reaproveitar `listarReservas`/`listarBloqueios`, que já existiam e já eram usados em outras telas |
| 8 | Nenhum overflow horizontal | ⚠️ | Confirmado via `document.documentElement.scrollWidth` em viewport desktop nativo (~1920px, sem overflow). **Dois bugs reais de overflow foram encontrados e corrigidos** (achado #1 da auditoria — `.form-login`/`.checkout-card`; grid da Landing Page sem `auto-fit`). Não confirmado nos 6 viewports pedidos (1440/1280/1024/768/390/320) — a ferramenta de resize deste sandbox não altera o viewport real da página (ver `docs/design-review.md` §3) |
| 9 | Touch targets adequados | ⚠️ | Por leitura de código (regra de 44px já estabelecida no `DESIGN.md`, reaproveitada pelos componentes novos) — não medido num dispositivo de toque real |
| 10 | Contraste e foco revisados | ✅ | Foco visível confirmado com captura de tela real (glow de acento no campo focado via Tab). Contraste do token novo `--status-bloqueio` avaliado e documentado (mesmo padrão/ressalva dos tokens de status já existentes, ver `docs/design-decisions.md` D1) |
| 11 | Loading, vazio, erro e sucesso tratados | ⚠️ | `Skeleton`/`EmptyState` aplicados em Dashboard e Reservas. `TablesPage` ainda tem um `<p>Carregando...</p>` solto perto do editor de mesas, não migrado — baixo impacto, registrado aqui pra não ser esquecido |
| 12 | Mockups da LP coerentes com telas reais | ✅ | 3 prints reais do produto (não ilustrações). Ressalva honesta: são de antes das Ondas 2/3 (sem Postgres local pra recapturar) — ver `docs/landing-page-review.md` |
| 13 | PWA sem regressão de instalação/navegação | ✅ | `InstalarAppButton`/`useInstallPrompt` intocados; `shortcuts` novos no manifest confirmados no `dist/manifest.webmanifest` gerado; navegação mobile (barra de abas) só ganhou padding de safe-area, mesma lógica |
| 14 | Console sem erros críticos | ✅ | Zero erros em todas as checagens (Login, Landing) em todas as ondas — só 2 warnings pré-existentes do React Router (future flags v7), sem relação com o redesign |
| 15 | Screenshots antes/depois salvos | ❌ | Screenshots foram capturados e revisados visualmente **durante a sessão** (login, landing — as 3 seções novas, foco por teclado) mas **não foram salvos em disco** como arquivo (nenhum `save_to_disk`). Se quiser um arquivo de referência permanente, posso gerar de novo com `save_to_disk: true` |

## Itens que precisam de validação humana antes de aprovar de vez

1. **`/admin/mesas`** (canvas de arrastar mesas) — abrir com dados reais, testar arrastar/redimensionar/salvar, e conferir as cores/tracejado dos 3 estados operacionais.
2. **Viewports estreitos de verdade** (768/390/320) — usar o DevTools do seu navegador (toggle de dispositivo), não deu pra simular neste sandbox.
3. **Fluxo de login real** — usuário/senha de verdade contra o backend com Postgres.
4. **Safe area num iPhone com home indicator** — a barra de abas fixa embaixo.
5. **Banner "Sem conexão"** — desligar o wifi/rede com o painel aberto e conferir que aparece e some sozinho.
