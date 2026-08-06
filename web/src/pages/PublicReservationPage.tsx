import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { criarReservaPublica, obterInfoDoLinkDeReserva, type ReservaPublicaCriada } from "../api/resources.js";

type Estado = "carregando" | "valido" | "invalido";

export function PublicReservationPage() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [unidadeNome, setUnidadeNome] = useState("");

  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [numPessoas, setNumPessoas] = useState("2");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmada, setConfirmada] = useState<ReservaPublicaCriada | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      return;
    }
    obterInfoDoLinkDeReserva(token)
      .then((info) => {
        setUnidadeNome(info.unidadeNome);
        setEstado("valido");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEnviando(true);
    setErro(null);
    try {
      const reserva = await criarReservaPublica(token, {
        data,
        horaInicio,
        numPessoas: Number(numPessoas),
        clienteNome,
        clienteTelefone: clienteTelefone || undefined,
      });
      setConfirmada(reserva);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel completar a reserva. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (estado === "carregando") {
    return (
      <div className="tela-login">
        <p>Carregando...</p>
      </div>
    );
  }

  if (estado === "invalido") {
    return (
      <div className="tela-login">
        <div className="form-login">
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Link expirado</h1>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            Este link de reserva expirou ou e invalido. Volte na conversa do Instagram e peca um novo link ao
            atendente.
          </p>
        </div>
      </div>
    );
  }

  if (confirmada) {
    return (
      <div className="tela-login">
        <div className="form-login">
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reserva confirmada!</h1>
          <p style={{ fontSize: "0.9rem" }}>
            {confirmada.data.split("-").reverse().join("/")} as {confirmada.horaInicio.slice(0, 5)}, para{" "}
            {confirmada.numPessoas} pessoa(s).
          </p>
          <p style={{ color: "#666", fontSize: "0.85rem" }}>
            Voce tambem vai receber a confirmacao pelo Instagram. Ate breve!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="tela-login">
      <form className="form-login" onSubmit={handleSubmit} style={{ width: 360 }}>
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reservar em {unidadeNome}</h1>
        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Horario
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
        </label>
        <label>
          Numero de pessoas
          <input
            type="number"
            min={1}
            value={numPessoas}
            onChange={(e) => setNumPessoas(e.target.value)}
            required
          />
        </label>
        <label>
          Seu nome
          <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} required />
        </label>
        <label>
          Telefone (opcional)
          <input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
        </label>
        {erro && <span className="erro">{erro}</span>}
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? "Confirmando..." : "Confirmar reserva"}
        </button>
      </form>
    </div>
  );
}
