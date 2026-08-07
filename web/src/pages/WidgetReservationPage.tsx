import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { criarReservaWidget, obterInfoDoWidget, type ReservaPublicaCriada } from "../api/resources.js";
import { Marca } from "../components/Marca.js";

type Estado = "carregando" | "invalido" | "pronto";
type Etapa = "dados" | "cliente";

// Pagina compacta pensada pra caber num iframe pequeno (o widget embutido no site do
// restaurante, ver widget.routes.ts embed.js) - sem o mapa visual de mesas da pagina
// completa (/reservar/:token): a mesa e sempre escolhida automaticamente.
export function WidgetReservationPage() {
  const { unidadeId } = useParams<{ unidadeId: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [unidadeNome, setUnidadeNome] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("dados");

  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [numPessoas, setNumPessoas] = useState("2");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmada, setConfirmada] = useState<ReservaPublicaCriada | null>(null);

  useEffect(() => {
    if (!unidadeId) {
      setEstado("invalido");
      return;
    }
    // O widget e um iframe pequeno embutido no site do proprio restaurante - sem
    // espaco pra um banner de consentimento de cookies, entao (diferente da pagina
    // completa /reservar/:token, doc 13) ele nao carrega GTM/Facebook Pixel aqui. O
    // rastreamento de conversao do widget fica a cargo do proprio site do restaurante.
    obterInfoDoWidget(unidadeId)
      .then((info) => {
        setUnidadeNome(info.unidadeNome);
        setEstado("pronto");
      })
      .catch(() => setEstado("invalido"));
  }, [unidadeId]);

  function avancar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEtapa("cliente");
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!unidadeId) return;
    setEnviando(true);
    setErro(null);
    try {
      const reserva = await criarReservaWidget(unidadeId, {
        data,
        horaInicio,
        numPessoas: Number(numPessoas),
        clienteNome,
        clienteTelefone: clienteTelefone || undefined,
      });
      setConfirmada(reserva);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível completar a reserva. Tente novamente.");
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
          <Marca tamanho="grande" />
          <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>Não foi possível carregar este widget de reserva.</p>
        </div>
      </div>
    );
  }

  if (confirmada) {
    return (
      <div className="tela-login">
        <div className="form-login">
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reserva confirmada!</h1>
          <p style={{ fontSize: "0.9rem" }}>
            {confirmada.data.split("-").reverse().join("/")} às {confirmada.horaInicio.slice(0, 5)}, para {confirmada.numPessoas} pessoa(s).
          </p>
        </div>
      </div>
    );
  }

  if (etapa === "dados") {
    return (
      <div className="tela-login">
        <form className="form-login" onSubmit={avancar} style={{ width: 320 }}>
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reservar em {unidadeNome}</h1>
          <label>
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </label>
          <label>
            Horário
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
          </label>
          <label>
            Número de pessoas
            <input type="number" min={1} value={numPessoas} onChange={(e) => setNumPessoas(e.target.value)} required />
          </label>
          <button className="btn" type="submit">
            Continuar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="tela-login">
      <form className="form-login" onSubmit={confirmar} style={{ width: 320 }}>
        <Marca tamanho="grande" />
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Seus dados</h1>
        <label>
          Nome
          <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} required />
        </label>
        <label>
          Telefone (opcional)
          <input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} placeholder="43988414050" />
        </label>
        {erro && <span className="erro">{erro}</span>}
        <div className="acoes">
          <button className="btn" type="submit" disabled={enviando}>
            {enviando ? "Confirmando..." : "Confirmar reserva"}
          </button>
          <button className="btn btn-secundario" type="button" onClick={() => setEtapa("dados")}>
            Voltar
          </button>
        </div>
      </form>
    </div>
  );
}
