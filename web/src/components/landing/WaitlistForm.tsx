import { forwardRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client.js";
import { enviarInteresseWaitlist } from "../../api/resources.js";

// Formulario de contato/lista de espera - NAO leva a checkout (pagamento ainda nao
// integrado). So registra o interesse pra contato manual depois.
export const WaitlistForm = forwardRef<HTMLDivElement>(function WaitlistForm(_props, ref) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [nomeRestaurante, setNomeRestaurante] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await enviarInteresseWaitlist({ nome, email, whatsapp, nomeRestaurante });
      setEnviado(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel enviar. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="lp-form-espera lp-form-confirmado" ref={ref}>
        <h3>Recebemos seu contato!</h3>
        <p className="texto-secundario">
          Em breve alguém da nossa equipe entra em contato pelo WhatsApp ou e-mail pra combinar a configuração
          inicial.
        </p>
      </div>
    );
  }

  return (
    <div ref={ref}>
      <form className="lp-form-espera" onSubmit={handleSubmit}>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          WhatsApp
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(43) 99999-0000" required />
        </label>
        <label>
          Nome do restaurante
          <input value={nomeRestaurante} onChange={(e) => setNomeRestaurante(e.target.value)} required />
        </label>
        {erro && <span className="erro">{erro}</span>}
        <button className="btn lp-btn-magnetico" type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Quero começar"}
        </button>
      </form>
    </div>
  );
});
