import { useEffect, useState } from "react";
import { Reveal } from "./Fx.js";

interface Mensagem {
  de: "cliente" | "agente" | "sistema";
  texto: string;
  link?: string;
}

interface Cenario {
  rotulo: string;
  canal: string;
  mensagens: Mensagem[];
}

// Conversas ilustrativas (nao sao capturas reais de clientes) - mesmo criterio de
// TrustSection: nenhum depoimento real e usado aqui ainda.
const CENARIOS: Cenario[] = [
  {
    rotulo: "Nova reserva",
    canal: "Instagram Direct · seu restaurante",
    mensagens: [
      { de: "cliente", texto: "Oi, boa noite! Vocês têm mesa pra 4 sexta às 20h?" },
      {
        de: "agente",
        texto: "Boa noite! Temos sim 🙌 Sexta às 20h ainda tem mesa pra 4 pessoas. Prefere área interna ou varanda?",
      },
      { de: "cliente", texto: "Varanda, se der!" },
      {
        de: "agente",
        texto: "Perfeito. Reservei a varanda pra você. Só confirmar seus dados aqui:",
        link: "quero-reservar.app/r/8x2f",
      },
      { de: "cliente", texto: "Confirmei! Obrigado 🙏" },
      {
        de: "agente",
        texto: "Reserva garantida, Marina! Vou te lembrar na sexta pela manhã. Qualquer mudança, só me chamar por aqui.",
      },
      { de: "sistema", texto: "Reserva confirmada — sexta, 20h, 4 pessoas, varanda." },
    ],
  },
  {
    rotulo: "Alteração de horário",
    canal: "WhatsApp · seu restaurante",
    mensagens: [
      { de: "cliente", texto: "Boa tarde, tenho reserva hoje às 20h no nome do Igor" },
      { de: "agente", texto: "Boa tarde, Igor! Achei sua reserva: hoje, 20h, 4 pessoas. Quer alterar algo?" },
      { de: "cliente", texto: "Consigo passar pra 21h? E vamos ser 6" },
      { de: "agente", texto: "Consigo sim 👍 21h com mesa pra 6 está livre. Confirmo a mudança?" },
      { de: "cliente", texto: "Isso, confirma por favor" },
      { de: "agente", texto: "Pronto! Atualizei pra hoje às 21h, 6 pessoas. Já avisei a equipe do salão." },
      { de: "sistema", texto: "Reserva atualizada — hoje, 21h, 6 pessoas." },
    ],
  },
  {
    rotulo: "Casa cheia",
    canal: "Instagram Direct · seu restaurante",
    mensagens: [
      { de: "cliente", texto: "Tem mesa pra 2 hoje às 20h?" },
      {
        de: "agente",
        texto: "Hoje às 20h estamos com a casa cheia 😕 Mas tenho 19h ou 21h30 disponíveis. Algum desses funciona?",
      },
      { de: "cliente", texto: "21h30 tá ok" },
      { de: "agente", texto: "Fechado! Segue o link pra confirmar em 30 segundos:", link: "quero-reservar.app/r/k4p1" },
      { de: "cliente", texto: "Feito. Vocês têm opção vegetariana?" },
      {
        de: "agente",
        texto: "Temos 4 pratos vegetarianos no menu, incluindo o risoto de funghi 🍄 Deixei anotado na sua reserva.",
      },
      { de: "sistema", texto: "Reserva confirmada — hoje, 21h30, 2 pessoas · obs: vegetariano." },
    ],
  },
];

export function ChatDemo() {
  const [ativo, setAtivo] = useState(0);
  const [passo, setPasso] = useState(0);
  const cenario = CENARIOS[ativo]!;

  useEffect(() => {
    setPasso(0);
    const id = setInterval(() => {
      setPasso((p) => (p >= cenario.mensagens.length + 2 ? p : p + 1));
    }, 1300);
    return () => clearInterval(id);
  }, [ativo, cenario.mensagens.length]);

  useEffect(() => {
    if (passo < cenario.mensagens.length + 2) return;
    const id = setTimeout(() => setAtivo((a) => (a + 1) % CENARIOS.length), 2200);
    return () => clearTimeout(id);
  }, [passo, cenario.mensagens.length]);

  return (
    <section className="lp-secao" id="demonstracao">
      <div className="lp-container">
        <Reveal as="span" className="lp-eyebrow">
          Demonstração ao vivo
        </Reveal>
        <Reveal delay={60} as="h2">
          Veja o atendimento acontecendo — <span className="lp-italico-destaque">sem ninguém digitando</span>
        </Reveal>
        <Reveal delay={100} as="p" className="lp-texto-grande" style={{ marginBottom: "2rem" }}>
          Reserva nova, mudança de horário, casa cheia, dúvida de menu. O agente conduz a conversa inteira no
          Instagram e no WhatsApp e só te entrega o resultado: a mesa confirmada.
        </Reveal>

        <Reveal delay={140}>
          <div className="lp-chatdemo-abas">
            {CENARIOS.map((c, i) => (
              <button
                key={c.rotulo}
                type="button"
                onClick={() => setAtivo(i)}
                className={`lp-chatdemo-aba ${i === ativo ? "ativa" : ""}`}
              >
                {c.rotulo}
              </button>
            ))}
          </div>

          <div className="lp-chatdemo-janela lp-moldura">
            <div className="lp-chatdemo-topo">
              <span className="lp-chatdemo-topo-ponto" />
              <span className="lp-chatdemo-topo-ponto" />
              <span className="lp-chatdemo-topo-ponto" />
              <span className="lp-chatdemo-topo-canal">
                <span className="lp-chatdemo-topo-canal-ponto" />
                {cenario.canal}
              </span>
            </div>

            <div className="lp-chatdemo-corpo">
              {cenario.mensagens.map((m, i) => {
                const visivel = passo > i;
                if (m.de === "cliente") {
                  return (
                    <div key={i} className={`lp-chatdemo-bolha lp-chatdemo-bolha-cliente ${visivel ? "visivel" : ""}`}>
                      {m.texto}
                    </div>
                  );
                }
                if (m.de === "agente") {
                  return (
                    <div key={i} className={`lp-chatdemo-bolha lp-chatdemo-bolha-agente ${visivel ? "visivel" : ""}`}>
                      {m.texto}
                      {m.link && <span className="lp-chatdemo-bolha-link">{m.link}</span>}
                    </div>
                  );
                }
                return (
                  <div key={i} className={`lp-chatdemo-bolha lp-chatdemo-bolha-sistema ${visivel ? "visivel" : ""}`}>
                    <span style={{ color: "var(--accent)" }}>✓</span>
                    {m.texto}
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
