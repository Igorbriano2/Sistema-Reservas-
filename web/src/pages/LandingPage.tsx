import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import "../landing.css";
import { Marca } from "../components/Marca.js";
import { ComoFuncionaMidia } from "../components/landing/ComoFuncionaMidia.js";
import { TrustSection } from "../components/landing/TrustSection.js";
import { WaitlistForm } from "../components/landing/WaitlistForm.js";

function prefereMovimentoReduzido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function aplicarTilt(e: MouseEvent<HTMLDivElement>) {
  if (prefereMovimentoReduzido()) return;
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const rotateX = (y / rect.height - 0.5) * -8;
  const rotateY = (x / rect.width - 0.5) * 8;
  card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
}

function removerTilt(e: MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = "";
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

const PASSOS_COMO_FUNCIONA = [
  {
    titulo: "Cliente manda mensagem",
    texto: "“Oi, tem mesa pra 4 sexta às 20h?”",
  },
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

const FAQ = [
  {
    pergunta: "Não entendo nada de tecnologia, vou conseguir usar?",
    resposta: "Sim. Se você sabe usar o Instagram, sabe usar o painel — foi desenhado pra isso.",
  },
  {
    pergunta: "Funciona só pra reserva ou também tira dúvida geral?",
    resposta:
      "As duas coisas. O agente atende elogio, reclamação e pergunta comum (horário, endereço) — não só reserva.",
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

export function LandingPage() {
  const spotlightRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [passoAtivo, setPassoAtivo] = useState(0);

  useEffect(() => {
    if (prefereMovimentoReduzido()) return;
    let frame = 0;
    function mover(e: globalThis.MouseEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        if (spotlightRef.current) {
          spotlightRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
        }
        frame = 0;
      });
    }
    window.addEventListener("mousemove", mover);
    return () => {
      window.removeEventListener("mousemove", mover);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const elementos = document.querySelectorAll<HTMLElement>(".lp-reveal");
    if (prefereMovimentoReduzido()) {
      elementos.forEach((el) => el.classList.add("visivel"));
      return;
    }
    const observer = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("visivel");
            observer.unobserve(entrada.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    elementos.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function irParaFormulario() {
    formRef.current?.scrollIntoView({ behavior: prefereMovimentoReduzido() ? "auto" : "smooth", block: "center" });
  }

  return (
    <div className="lp">
      <div className="spotlight" ref={spotlightRef} aria-hidden="true" />

      <header className="lp-topo">
        <Marca />
        <Link to="/admin/login" className="lp-link-entrar">
          Entrar
        </Link>
      </header>

      <main>
        {/* 1. Hero ------------------------------------------------------- */}
        <section className="lp-secao lp-hero">
          <div className="lp-container">
            <span className="lp-selo">Pra restaurantes que vivem (e vendem) pelo Instagram</span>
            <h1>Seu Instagram já é a sua central de reservas. Só falta alguém atendendo ele 24 horas.</h1>
            <p className="lp-texto-grande">
              O Quero Reservar é o agente de IA que responde, confirma e organiza as reservas do seu restaurante
              direto no Instagram Direct — enquanto você cuida do salão.
            </p>
            <div className="lp-cta-grupo">
              <button className="btn lp-btn-magnetico" onMouseMove={aplicarIma} onMouseLeave={removerIma} onClick={irParaFormulario}>
                Quero automatizar minhas reservas
              </button>
              <a href="#como-funciona" className="lp-link-secundario">
                Ver como funciona
              </a>
            </div>
          </div>
        </section>

        {/* 2. O problema --------------------------------------------------- */}
        <section className="lp-secao">
          <div className="lp-container">
            <h2 className="lp-reveal">Enquanto você lê isso, alguém está tentando reservar mesa no seu Instagram.</h2>
            <div className="lp-grade-cards">
              <div className="lp-card lp-tilt lp-reveal" onMouseMove={aplicarTilt} onMouseLeave={removerTilt}>
                <h3>Boa noite, vocês têm mesa pra hoje?</h3>
                <p>
                  Chega às 19h numa sexta lotada. Ninguém vê na hora. Quarenta minutos depois, alguém responde — mas
                  o cliente já reservou em outro lugar.
                </p>
              </div>
              <div className="lp-card lp-tilt lp-reveal" onMouseMove={aplicarTilt} onMouseLeave={removerTilt}>
                <h3>Planilha, caderno, WhatsApp pessoal</h3>
                <p>
                  Cada reserva confirmada por telefone é uma reserva que depende de alguém lembrar de anotar, sem
                  duplicar mesa, sem esquecer.
                </p>
              </div>
              <div className="lp-card lp-tilt lp-reveal" onMouseMove={aplicarTilt} onMouseLeave={removerTilt}>
                <h3>Ferramentas que tiram o cliente do Instagram</h3>
                <p>Link externo, outro app, outro cadastro. Cada clique a mais é uma chance do cliente desistir no meio do caminho.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. A virada ------------------------------------------------------ */}
        <section className="lp-secao lp-virada">
          <div className="lp-container lp-reveal">
            <h2>E se a resposta já estivesse sendo dada, agora, por alguém que nunca dorme?</h2>
            <p className="lp-texto-grande">
              O Quero Reservar coloca um agente de inteligência artificial dentro do Instagram do seu restaurante.
              Ele conversa com o cliente na hora, tira dúvida sobre horário e disponibilidade, e manda um link — do
              seu próprio sistema, nunca de um app terceiro — pra o cliente confirmar a reserva sozinho, em segundos.
            </p>
            <p className="lp-texto-grande">
              Você e sua equipe acompanham tudo em um painel simples. Sem planilha. Sem reserva duplicada. Sem
              cliente esperando resposta.
            </p>
          </div>
        </section>

        {/* 4. Como funciona --------------------------------------------------- */}
        <section className="lp-secao" id="como-funciona">
          <div className="lp-container">
            <h2 className="lp-reveal">Como funciona</h2>
            <div className="lp-como-funciona lp-reveal">
              <div className="lp-passos">
                {PASSOS_COMO_FUNCIONA.map((passo, indice) => (
                  <button
                    key={passo.titulo}
                    type="button"
                    className={`lp-passo ${passoAtivo === indice ? "ativo" : ""}`}
                    onClick={() => setPassoAtivo(indice)}
                  >
                    <span className="lp-passo-numero">{indice + 1}</span>
                    <span>
                      <strong>{passo.titulo}</strong>
                      <span className="lp-passo-texto">{passo.texto}</span>
                    </span>
                  </button>
                ))}
              </div>
              <ComoFuncionaMidia passoAtivo={passoAtivo} />
            </div>
          </div>
        </section>

        {/* 5. Stack de valor --------------------------------------------------- */}
        <section className="lp-secao">
          <div className="lp-container">
            <h2 className="lp-reveal">Tudo o que seu restaurante precisa pra nunca mais perder uma reserva por falta de resposta</h2>
            <ul className="lp-lista-valor lp-reveal">
              {ITENS_VALOR.map((item) => (
                <li key={item}>
                  <span className="lp-check" aria-hidden="true">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Por que confiar (isolado) ------------------------------------- */}
        <TrustSection />

        {/* 7. Preco ----------------------------------------------------------- */}
        <section className="lp-secao" id="preco">
          <div className="lp-container">
            <h2 className="lp-reveal">Um plano. Sem letra miúda.</h2>
            <div className="lp-preco-grade lp-reveal">
              <div className="lp-card-preco lp-tilt" onMouseMove={aplicarTilt} onMouseLeave={removerTilt}>
                <span className="lp-preco-etiqueta">Plano único</span>
                <strong className="lp-preco-valor">
                  R$ 697<span>/mês</span>
                </strong>
                <p className="texto-secundario">
                  Tudo incluso: agente de IA, painel completo, equipe ilimitada, suporte na configuração inicial.
                </p>
              </div>
              <WaitlistForm ref={formRef} />
            </div>
          </div>
        </section>

        {/* 8. FAQ --------------------------------------------------------------- */}
        <section className="lp-secao">
          <div className="lp-container">
            <h2 className="lp-reveal">Perguntas frequentes</h2>
            <div className="lp-faq lp-reveal">
              {FAQ.map((item) => (
                <details key={item.pergunta} className="lp-faq-item">
                  <summary>{item.pergunta}</summary>
                  <p>{item.resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 9. CTA final ------------------------------------------------------- */}
        <section className="lp-secao lp-cta-final">
          <div className="lp-container lp-reveal">
            <h2>Seu próximo cliente já está no seu Instagram. A pergunta é só: alguém vai responder a tempo?</h2>
            <button className="btn lp-btn-magnetico" onMouseMove={aplicarIma} onMouseLeave={removerIma} onClick={irParaFormulario}>
              Quero automatizar minhas reservas
            </button>
          </div>
        </section>
      </main>

      <footer className="lp-rodape">
        <Marca />
        <Link to="/admin/login" className="texto-secundario">
          Já sou cliente
        </Link>
      </footer>
    </div>
  );
}
