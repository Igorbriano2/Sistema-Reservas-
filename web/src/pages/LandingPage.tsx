import { useState, type CSSProperties, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import "../landing.css";
import { Marca } from "../components/Marca.js";
import { Nav, BarraFixaMobile } from "../components/landing/Nav.js";
import { BarraDeProgresso, Aurora, SpotCard, Marquee, Reveal } from "../components/landing/Fx.js";
import { ChatDemo } from "../components/landing/ChatDemo.js";
import { TrustSection } from "../components/landing/TrustSection.js";
import { FounderSection } from "../components/landing/FounderSection.js";
import { ComparisonSection } from "../components/landing/ComparisonSection.js";
import { WaitlistForm } from "../components/landing/WaitlistForm.js";

function prefereMovimentoReduzido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function aplicarIma(e: MouseEvent<HTMLElement>) {
  if (prefereMovimentoReduzido()) return;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  el.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
}

function removerIma(e: MouseEvent<HTMLElement>) {
  e.currentTarget.style.transform = "";
}

const PROBLEMAS = [
  {
    titulo: "“Boa noite, vocês têm mesa pra hoje?”",
    texto:
      "Chega às 19h numa sexta lotada. Ninguém vê na hora. Quarenta minutos depois, alguém responde — mas o cliente já reservou em outro lugar.",
  },
  {
    titulo: "Planilha, caderno, WhatsApp pessoal",
    texto: "Cada reserva confirmada por telefone é uma reserva que depende de alguém lembrar de anotar, sem duplicar mesa, sem esquecer.",
  },
  {
    titulo: "Ferramentas que tiram o cliente do Instagram",
    texto: "Link externo, outro app, outro cadastro. Cada clique a mais é uma chance do cliente desistir no meio do caminho.",
  },
];

const PASSOS = [
  { titulo: "Cliente manda mensagem", texto: "“Oi, tem mesa pra 4 sexta às 20h?”" },
  {
    titulo: "O agente responde e envia o link",
    texto: "Na hora, com o tom de voz do seu restaurante — e o link de reserva do seu próprio sistema.",
  },
  {
    titulo: "Reserva confirmada, sem esforço",
    texto: "Cliente preenche, você vê no painel, pronto. Alterar ou cancelar? Também é só mandar mensagem.",
  },
];

const ITENS_VALOR = [
  "Agente de IA no Instagram — atende, tira dúvida, redireciona reserva, 24 horas por dia, no tom de voz do seu restaurante",
  "Link de reserva próprio — sem redirecionar o cliente pra fora da sua marca",
  "Painel administrativo completo — veja reservas do dia, cadastre mesas, configure horários",
  "Acesso para sua equipe — dono vê tudo, funcionário cuida das reservas do dia, sem confusão de permissão",
  "Confirmação automática — o cliente recebe a confirmação sem ninguém precisar responder manualmente",
  "Agrupamento inteligente de mensagens — o agente espera o cliente terminar de digitar antes de responder, como uma pessoa de verdade faria",
];

// Doc 38 - todos ja estao no ar (auditado contra o roadmap real do produto: pixels
// de marketing, PWA, conexao automatica do Instagram, WhatsApp Business e o editor
// visual do salao ja foram entregues) - nao ha mais item "em breve" pendente aqui.
const FUNCIONALIDADES = [
  { titulo: "Agente de IA no Instagram", texto: "Responde, tira dúvida e manda o link de reserva 24 horas por dia, no tom de voz do seu restaurante." },
  { titulo: "Painel administrativo", texto: "Reservas do dia, mesas, horários e equipe — tudo em um painel só, sem planilha." },
  { titulo: "Link de reserva próprio", texto: "O cliente confirma dentro do seu próprio sistema, nunca em um app de terceiro." },
  { titulo: "Mapa de mesas ou modo simples", texto: "Controle mesa por mesa, ou só a capacidade total do salão — você escolhe o que faz sentido pro seu espaço." },
  { titulo: "Editor visual do salão", texto: "Arraste e organize suas mesas num mapa visual, e deixe o cliente escolher a própria mesa na reserva." },
  { titulo: "Bloqueios e relatórios", texto: "Bloqueie mesas por manutenção ou evento, e acompanhe ocupação e no-show com dados reais." },
  { titulo: "Pixels de marketing", texto: "Meça o retorno das suas campanhas com Google Tag e Facebook Pixel direto na página de reserva." },
  { titulo: "App do painel (PWA)", texto: "Instale o painel no celular e acompanhe as reservas do dia com notificação em tempo real." },
  { titulo: "WhatsApp Business", texto: "Peça feedback, lembre aniversários e reative clientes que sumiram, direto pelo WhatsApp do restaurante." },
  { titulo: "Conexão automática do Instagram", texto: "Conecte sua conta em um clique, sem depender da equipe pra configurar nada manualmente." },
];

const INCLUSO = [
  "Agente de IA no Instagram e WhatsApp, 24 horas por dia",
  "Painel administrativo completo",
  "Link de reserva no seu próprio sistema",
  "Equipe ilimitada, com permissões",
  "Mesas, horários, bloqueios e relatórios",
  "Suporte na configuração inicial",
];

const FAQ = [
  {
    pergunta: "Não entendo nada de tecnologia, vou conseguir usar?",
    resposta: "Sim. Se você sabe usar o Instagram, sabe usar o painel — foi desenhado pra isso.",
  },
  {
    pergunta: "Funciona só pra reserva ou também tira dúvida geral?",
    resposta: "As duas coisas. O agente atende elogio, reclamação e pergunta comum (horário, endereço) — não só reserva.",
  },
  {
    pergunta: "E se eu já uso outro sistema de reservas?",
    resposta: "Dá pra migrar sem perder o histórico — a equipe te ajuda na configuração inicial.",
  },
  {
    pergunta: "O agente pode errar e criar uma reserva errada sozinho?",
    resposta:
      "Não — de propósito. O agente nunca cria reserva sozinho na conversa; ele manda o link e o cliente preenche os dados certos, sem risco de mal-entendido de data ou horário.",
  },
  {
    pergunta: "Preciso trocar meu Instagram ou perder meus seguidores?",
    resposta: "Não, a conexão é feita no seu Instagram atual, sem perder nada.",
  },
];

function ChairMarkGrande() {
  return (
    <div className="lp-hero-marca">
      <span className="lp-hero-marca-glow" aria-hidden="true" />
      <span className="lp-hero-marca-flutuante">
        <span className="lp-hero-marca-tile">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <rect x="65" y="30" width="70" height="60" rx="20" fill="currentColor" />
            <rect x="46" y="94" width="108" height="24" rx="12" fill="currentColor" />
            <rect x="54" y="120" width="16" height="40" rx="7" fill="currentColor" />
            <rect x="130" y="120" width="16" height="40" rx="7" fill="currentColor" />
          </svg>
        </span>
      </span>
    </div>
  );
}

function VideoDeVendas() {
  return (
    <div>
      <p className="lp-eyebrow" style={{ textAlign: "center" }}>
        Assista em 2 minutos como funciona
      </p>
      <div className="lp-video-novo lp-moldura">
        <span className="lp-video-novo-play">
          <span className="lp-video-novo-play-glow" aria-hidden="true" />
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ position: "relative" }}>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <p className="texto-secundario">Vídeo em breve</p>
      </div>
    </div>
  );
}

function PainelMock() {
  const linhas = [
    { hora: "19:30", nome: "Marina R.", pessoas: "2 pessoas", status: "Confirmada" },
    { hora: "20:00", nome: "Igor B.", pessoas: "4 pessoas", status: "Confirmada" },
    { hora: "20:30", nome: "Família Souza", pessoas: "6 pessoas", status: "Aguardando" },
    { hora: "21:00", nome: "Caio L.", pessoas: "2 pessoas", status: "Confirmada" },
  ];

  return (
    <div className="lp-painel-mock lp-moldura">
      <div className="lp-painel-mock-topo">
        <p>Reservas de hoje</p>
        <span className="lp-painel-mock-ao-vivo">ao vivo</span>
      </div>
      <ul className="lp-painel-mock-lista">
        {linhas.map((linha, i) => (
          <li key={linha.nome} className="lp-painel-mock-linha" style={{ animationDelay: `${i * 120}ms` }}>
            <span className="lp-painel-mock-hora">{linha.hora}</span>
            <span className="lp-painel-mock-nome">{linha.nome}</span>
            <span className="lp-painel-mock-pessoas">{linha.pessoas}</span>
            <span className={`lp-painel-mock-status ${linha.status === "Confirmada" ? "confirmada" : ""}`}>{linha.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function atrasoEscalonado(indice: number, passoMs = 90): CSSProperties {
  return { "--reveal-delay": `${indice * passoMs}ms` } as CSSProperties;
}

export function LandingPage() {
  const [mostrarFormularioContato, setMostrarFormularioContato] = useState(false);

  return (
    <div className="lp">
      <BarraDeProgresso />
      <Nav />

      <main>
        {/* Hero ------------------------------------------------------------ */}
        <section id="top" className="lp-secao lp-hero lp-grao lp-secao-fundo-relativo">
          <Aurora intenso />
          <div className="lp-container">
            <Reveal>
              <ChairMarkGrande />
            </Reveal>

            <Reveal delay={80}>
              <span className="lp-selo lp-selo-vivo">
                <span className="lp-ponto-vivo" aria-hidden="true" />
                <span className="lp-texto-gradiente">Instagram e WhatsApp atendidos por IA</span>
              </span>
            </Reveal>

            <Reveal delay={160} as="h1">
              Tenha alguém atendendo seu restaurante <span className="text-carmim" style={{ color: "var(--accent)" }}>24 horas por dia.</span>
            </Reveal>

            <Reveal delay={240}>
              <p className="lp-texto-grande" style={{ margin: "0 auto 1.5rem" }}>
                Sem salário, sem encargos e sem contratar mais um funcionário pra ficar preso ao celular: o agente de
                IA atende Instagram e WhatsApp e organiza tudo enquanto sua equipe cuida do salão.
              </p>
            </Reveal>

            <Reveal delay={320}>
              <div className="lp-cta-grupo" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
                <Link to="/assinar" className="lp-btn-pilula" onMouseMove={aplicarIma} onMouseLeave={removerIma}>
                  Quero automatizar minhas reservas
                  <span aria-hidden="true">→</span>
                </Link>
                <a href="#como-funciona" className="lp-btn-pilula-outline">
                  Ver como funciona
                </a>
              </div>
              <p className="texto-secundario" style={{ textAlign: "center", fontSize: "0.8rem", marginTop: "0.85rem" }}>
                7 dias grátis · sem cobrança se cancelar antes · R$ 697/mês depois
              </p>
            </Reveal>

            <Reveal delay={400} className="lp-video-wrap" style={{ maxWidth: 980, width: "100%", margin: "1.75rem auto 0" }}>
              <VideoDeVendas />
            </Reveal>
          </div>
        </section>

        <Marquee itens={["Atende 24 horas", "Sem planilha", "Link de reserva próprio", "Equipe ilimitada", "Resposta imediata", "R$ 697/mês"]} />

        {/* O problema -------------------------------------------------------- */}
        <section className="lp-secao">
          <div className="lp-container">
            <Reveal as="span" className="lp-eyebrow">
              O problema
            </Reveal>
            <Reveal delay={60} as="h2">
              Enquanto você lê isso, alguém está tentando reservar mesa no seu Instagram.
            </Reveal>
            <div className="lp-grade-cards" style={{ marginTop: "2.5rem" }}>
              {PROBLEMAS.map((p, i) => (
                <Reveal key={p.titulo} delay={i * 120}>
                  <SpotCard>
                    <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.4rem", color: "var(--accent)" }}>
                      0{i + 1}
                    </span>
                    <h3 style={{ marginTop: "0.75rem" }}>{p.titulo}</h3>
                    <p>{p.texto}</p>
                  </SpotCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* A virada ------------------------------------------------------------ */}
        <section className="lp-secao lp-virada lp-secao-fundo-relativo">
          <Aurora />
          <div className="lp-container" style={{ maxWidth: 1040, display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)", gap: "3rem", alignItems: "center" }}>
            <Reveal>
              <span className="lp-eyebrow">A virada</span>
              <h2>
                E se a resposta já estivesse sendo dada, agora, por{" "}
                <span className="lp-italico-destaque">alguém que nunca dorme?</span>
              </h2>
              <p className="lp-texto-grande" style={{ marginTop: "1.25rem" }}>
                O Quero Reservar coloca um agente de inteligência artificial dentro do Instagram e do WhatsApp do seu
                restaurante. Ele conversa com o cliente na hora, tira dúvida sobre horário e disponibilidade, e manda
                um link — do seu próprio sistema, nunca de um app terceiro — pra o cliente confirmar a reserva
                sozinho, em segundos.
              </p>
              <p className="lp-texto-grande" style={{ marginTop: "1rem" }}>
                Você e sua equipe acompanham tudo em um painel simples. Sem planilha. Sem reserva duplicada. Sem
                cliente esperando resposta.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <PainelMock />
            </Reveal>
          </div>
        </section>

        {/* Como funciona --------------------------------------------------- */}
        <section className="lp-secao" id="como-funciona">
          <div className="lp-container">
            <Reveal as="span" className="lp-eyebrow">
              Como funciona
            </Reveal>
            <Reveal delay={60} as="h2">
              Três passos. <span className="lp-italico-destaque">Nenhum deles é seu.</span>
            </Reveal>
            <ol className="lp-grade-cards" style={{ marginTop: "2.5rem", listStyle: "none", padding: 0 }}>
              {PASSOS.map((passo, i) => (
                <Reveal key={passo.titulo} delay={i * 140} as="li">
                  <SpotCard>
                    <span
                      style={{
                        display: "flex",
                        width: "2.75rem",
                        height: "2.75rem",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        fontFamily: "var(--font-display)",
                        fontWeight: 800,
                        color: "var(--text-on-accent)",
                        background: "linear-gradient(135deg, var(--accent), var(--accent-deep))",
                      }}
                    >
                      {i + 1}
                    </span>
                    <h3 style={{ marginTop: "1.1rem" }}>{passo.titulo}</h3>
                    <p>{passo.texto}</p>
                  </SpotCard>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Demonstracao ao vivo (chat simulado) ------------------------------ */}
        <ChatDemo />

        {/* Stack de valor --------------------------------------------------- */}
        <section className="lp-secao" id="recursos">
          <div className="lp-container">
            <Reveal as="span" className="lp-eyebrow">
              O que você leva
            </Reveal>
            <Reveal delay={60} as="h2">
              Tudo o que seu restaurante precisa pra{" "}
              <span className="lp-italico-destaque">nunca mais perder uma reserva</span> por falta de resposta
            </Reveal>
            <ul style={{ listStyle: "none", margin: "2.5rem 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {ITENS_VALOR.map((item, i) => (
                <Reveal key={item} delay={(i % 2) * 100} as="li">
                  <SpotCard className="lp-item-valor" style={{ display: "flex", gap: "1rem" } as CSSProperties}>
                    <span className="lp-check" aria-hidden="true">
                      ✓
                    </span>
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>{item}</p>
                  </SpotCard>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Tecnologia / funcionalidades --------------------------------------- */}
        <section className="lp-secao">
          <div className="lp-container">
            <Reveal as="span" className="lp-eyebrow">
              Por dentro da plataforma
            </Reveal>
            <Reveal delay={60} as="h2">
              Tudo o que já está no ar — <span className="lp-italico-destaque">ativo e funcionando hoje</span>
            </Reveal>
            <div className="lp-grade-tech" style={{ marginTop: "2.5rem" }}>
              {FUNCIONALIDADES.map((item, i) => (
                <Reveal key={item.titulo} delay={(i % 3) * 110} style={{ height: "100%" }}>
                  <SpotCard style={{ height: "100%" } as CSSProperties}>
                    <span className="lp-badge-tech lp-badge-disponivel" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                      <span className="lp-ponto-vivo" aria-hidden="true" />
                      Disponível agora
                    </span>
                    <h3>{item.titulo}</h3>
                    <p>{item.texto}</p>
                  </SpotCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Por que confiar / Fundador / Comparativo (conteudo real, ja isolados) */}
        <TrustSection />
        <FounderSection />
        <ComparisonSection />

        {/* Preco -------------------------------------------------------------- */}
        <section className="lp-secao lp-secao-fundo-relativo" id="preco">
          <Aurora intenso />
          <div className="lp-container" style={{ maxWidth: 640, textAlign: "center" }}>
            <Reveal as="span" className="lp-eyebrow">
              Investimento
            </Reveal>
            <Reveal delay={60} as="h2">
              Um plano. <span className="lp-italico-destaque">Sem letra miúda.</span>
            </Reveal>
            <Reveal delay={140}>
              <SpotCard className="lp-moldura" style={{ marginTop: "2.5rem", padding: "2.25rem", textAlign: "left" } as CSSProperties}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem" }}>
                  <div>
                    <span className="lp-eyebrow" style={{ margin: 0 }}>
                      Plano único
                    </span>
                    <strong className="lp-preco-valor" style={{ display: "block", marginTop: "0.5rem", marginBottom: 0 }}>
                      R$ 697<span>/mês</span>
                    </strong>
                  </div>
                  <span
                    style={{
                      borderRadius: "9999px",
                      border: "1px solid rgba(var(--accent-rgb), 0.4)",
                      padding: "0.4rem 0.85rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--accent)",
                    }}
                  >
                    7 dias grátis
                  </span>
                </div>

                <ul style={{ listStyle: "none", margin: "2rem 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
                  {INCLUSO.map((item) => (
                    <li key={item} style={{ display: "flex", gap: "0.6rem", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--accent)" }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>

                <Link to="/assinar" className="lp-btn-pilula" style={{ width: "100%", marginTop: "2.25rem" }}>
                  Assinar agora — 7 dias grátis
                  <span aria-hidden="true">→</span>
                </Link>
                <p className="texto-secundario" style={{ textAlign: "center", fontSize: "0.78rem", marginTop: "1rem" }}>
                  Tudo incluso. Sem cobrança se você cancelar antes dos 7 dias.
                </p>
              </SpotCard>
            </Reveal>
          </div>
        </section>

        {/* FAQ --------------------------------------------------------------- */}
        <section className="lp-secao">
          <div className="lp-container" style={{ maxWidth: 640 }}>
            <Reveal as="span" className="lp-eyebrow">
              Dúvidas
            </Reveal>
            <Reveal delay={60} as="h2">
              Perguntas <span className="lp-italico-destaque">frequentes</span>
            </Reveal>
            <div className="lp-faq" style={{ marginTop: "2rem" }}>
              {FAQ.map((item, i) => (
                <Reveal key={item.pergunta} delay={i * 70}>
                  <details className="lp-faq-item" style={atrasoEscalonado(i, 0)}>
                    <summary>{item.pergunta}</summary>
                    <p>{item.resposta}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final ------------------------------------------------------- */}
        <section className="lp-secao lp-cta-final lp-grao lp-secao-fundo-relativo">
          <Aurora intenso />
          <div className="lp-container">
            <Reveal as="h2">
              <span className="lp-moldura" style={{ display: "block", padding: "0 0.75rem" }}>
                Seu próximo cliente já está no seu Instagram.
              </span>
              <span className="lp-italico-destaque" style={{ display: "block", marginTop: "0.5rem" }}>
                A pergunta é só: alguém vai responder a tempo?
              </span>
            </Reveal>
            <Reveal delay={140}>
              <Link to="/assinar" className="lp-btn-pilula" onMouseMove={aplicarIma} onMouseLeave={removerIma} style={{ marginTop: "1.5rem" }}>
                Quero automatizar minhas reservas
                <span aria-hidden="true">→</span>
              </Link>
              <p className="texto-secundario" style={{ fontSize: "0.78rem", marginTop: "0.75rem" }}>
                R$ 697/mês · 7 dias grátis · cancele quando quiser
              </p>
              {!mostrarFormularioContato ? (
                <button type="button" className="lp-link-contato" onClick={() => setMostrarFormularioContato(true)}>
                  Prefere que a gente te ligue antes? Deixe seu contato
                </button>
              ) : (
                <WaitlistForm />
              )}
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="lp-rodape">
        <Marca />
        <Link to="/login" className="texto-secundario">
          Já sou cliente
        </Link>
      </footer>

      <BarraFixaMobile />
    </div>
  );
}
