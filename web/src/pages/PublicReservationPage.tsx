import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  criarReservaPublica,
  listarMesasDisponiveisPublico,
  obterInfoDoLinkDeReserva,
  type ReservaPublicaCriada,
  type SalaoPublico,
} from "../api/resources.js";
import { Marca } from "../components/Marca.js";
import { SalaoCanvasSvg, type MesaCanvas } from "../components/salao-canvas/SalaoCanvasSvg.js";

type Estado = "carregando" | "invalido" | "pronto";
// "dados": data/horario/pessoas. "mapa": escolher a mesa (so quando a unidade tem
// salao em modo "mapa"). "cliente": nome/telefone + confirmar.
type Etapa = "dados" | "mapa" | "cliente";

// Mesa sem posicao/tamanho salvos (nunca deveria acontecer se o dono usou o editor
// visual, mas evita esconder uma mesa reservavel do cliente por falta de dados).
const TAMANHO_PADRAO_FALLBACK = 90;

export function PublicReservationPage() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [unidadeNome, setUnidadeNome] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("dados");

  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [numPessoas, setNumPessoas] = useState("2");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");

  const [saloes, setSaloes] = useState<SalaoPublico[]>([]);
  const [salaoEscolhidoId, setSalaoEscolhidoId] = useState("");
  const [mesaEscolhidaId, setMesaEscolhidaId] = useState<string | null>(null);
  const [avisoDisponibilidade, setAvisoDisponibilidade] = useState<string | null>(null);
  const [carregandoMapa, setCarregandoMapa] = useState(false);

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
        setEstado("pronto");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  const salaoAtual = useMemo(() => saloes.find((s) => s.id === salaoEscolhidoId) ?? null, [saloes, salaoEscolhidoId]);
  const mesaEscolhidaNome = useMemo(
    () => saloes.flatMap((s) => s.mesas).find((m) => m.id === mesaEscolhidaId)?.nome ?? null,
    [saloes, mesaEscolhidaId],
  );

  const mesasCanvas: MesaCanvas[] = useMemo(() => {
    if (!salaoAtual) return [];
    return salaoAtual.mesas.map((m, indice) => ({
      id: m.id,
      nome: m.nome,
      capacidadeMin: m.capacidadeMin,
      capacidadeMax: m.capacidadeMax,
      formato: m.formato,
      posX: m.posX ?? indice * (TAMANHO_PADRAO_FALLBACK + 20),
      posY: m.posY ?? 0,
      largura: m.largura ?? TAMANHO_PADRAO_FALLBACK,
      altura: m.altura ?? TAMANHO_PADRAO_FALLBACK,
      motivoIndisponivel: m.motivo,
    }));
  }, [salaoAtual]);

  const mesasIndisponiveisIds = useMemo(
    () => new Set(salaoAtual?.mesas.filter((m) => !m.disponivel).map((m) => m.id) ?? []),
    [salaoAtual],
  );

  async function buscarMesasDisponiveis() {
    if (!token) return null;
    return listarMesasDisponiveisPublico(token, data, horaInicio, Number(numPessoas));
  }

  async function avancarParaMapa(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregandoMapa(true);
    try {
      const resposta = await buscarMesasDisponiveis();
      if (!resposta) return;
      setAvisoDisponibilidade(!resposta.disponibilidade.disponivel ? (resposta.disponibilidade.motivo ?? null) : null);
      if (resposta.saloes.length === 0) {
        // Unidade nao tem salao em modo "mapa" - segue direto pro fluxo antigo (o
        // backend escolhe a mesa/salao automaticamente ao confirmar).
        setMesaEscolhidaId(null);
        setEtapa("cliente");
        return;
      }
      setSaloes(resposta.saloes);
      setSalaoEscolhidoId((atual) => (resposta.saloes.some((s) => s.id === atual) ? atual : resposta.saloes[0].id));
      setEtapa("mapa");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel verificar a disponibilidade. Tente novamente.");
    } finally {
      setCarregandoMapa(false);
    }
  }

  function escolherMesa(id: string) {
    setErro(null);
    setMesaEscolhidaId(id);
    setEtapa("cliente");
  }

  function prosseguirSemEscolherMesa() {
    setErro(null);
    setMesaEscolhidaId(null);
    setEtapa("cliente");
  }

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
        mesaId: mesaEscolhidaId ?? undefined,
      });
      setConfirmada(reserva);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && mesaEscolhidaId) {
        // A mesa escolhida foi reservada por outra pessoa entre a selecao e a
        // confirmacao - atualiza o mapa em vez de travar a pagina numa reserva impossivel.
        setMesaEscolhidaId(null);
        setEtapa(saloes.length > 0 ? "mapa" : "dados");
        setErro("Essa mesa acabou de ser reservada por outra pessoa. Escolha outra mesa.");
        try {
          const resposta = await buscarMesasDisponiveis();
          if (resposta) setSaloes(resposta.saloes);
        } catch {
          // mantem o mapa com os dados anteriores se a atualizacao falhar - o cliente
          // ainda consegue tentar de novo, so sem o refresh automatico.
        }
      } else {
        setErro(err instanceof ApiError ? err.message : "Nao foi possivel completar a reserva. Tente novamente.");
      }
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
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Link expirado</h1>
          <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>
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
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reserva confirmada!</h1>
          <p style={{ fontSize: "0.9rem" }}>
            {confirmada.data.split("-").reverse().join("/")} as {confirmada.horaInicio.slice(0, 5)}, para{" "}
            {confirmada.numPessoas} pessoa(s).
          </p>
          <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>
            Voce tambem vai receber a confirmacao pelo Instagram. Ate breve!
          </p>
        </div>
      </div>
    );
  }

  if (etapa === "dados") {
    return (
      <div className="tela-login">
        <form className="form-login" onSubmit={avancarParaMapa} style={{ width: 360 }}>
          <Marca tamanho="grande" />
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
          {erro && <span className="erro">{erro}</span>}
          <button className="btn" type="submit" disabled={carregandoMapa}>
            {carregandoMapa ? "Verificando..." : "Continuar"}
          </button>
        </form>
      </div>
    );
  }

  if (etapa === "mapa") {
    return (
      <div className="tela-login">
        <div className="form-login" style={{ width: "min(760px, 92vw)" }}>
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Escolha sua mesa</h1>
          <p className="texto-secundario" style={{ fontSize: "0.85rem", margin: 0 }}>
            {data.split("-").reverse().join("/")} as {horaInicio}, para {numPessoas} pessoa(s).{" "}
            <button
              type="button"
              onClick={() => setEtapa("dados")}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              alterar
            </button>
          </p>

          {avisoDisponibilidade && <p className="erro">{avisoDisponibilidade}</p>}
          {erro && <p className="erro">{erro}</p>}

          {saloes.length > 1 && (
            <label>
              Salao
              <select value={salaoEscolhidoId} onChange={(e) => setSalaoEscolhidoId(e.target.value)}>
                {saloes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          )}

          {salaoAtual && (
            <SalaoCanvasSvg
              mesas={mesasCanvas}
              elementos={salaoAtual.elementos}
              modo="selecao"
              mesaSelecionadaId={mesaEscolhidaId}
              mesasIndisponiveisIds={mesasIndisponiveisIds}
              onSelecionarMesa={escolherMesa}
            />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.8rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(95,138,90,0.5)", display: "inline-block" }} />
              Disponivel
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "#d9cca3", display: "inline-block" }} />
              Ocupada / incompativel
            </span>
          </div>

          <button className="btn btn-secundario" type="button" onClick={prosseguirSemEscolherMesa}>
            Prefiro que o restaurante escolha a mesa
          </button>
        </div>
      </div>
    );
  }

  // etapa === "cliente"
  return (
    <div className="tela-login">
      <form className="form-login" onSubmit={handleSubmit} style={{ width: 360 }}>
        <Marca tamanho="grande" />
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reservar em {unidadeNome}</h1>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", margin: 0 }}>
          {data.split("-").reverse().join("/")} as {horaInicio}, para {numPessoas} pessoa(s).
          {mesaEscolhidaNome ? ` Mesa: ${mesaEscolhidaNome}.` : ""}
        </p>
        <label>
          Seu nome
          <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} required />
        </label>
        <label>
          Telefone (opcional)
          <input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
        </label>
        {erro && <span className="erro">{erro}</span>}
        <div className="acoes">
          <button
            className="btn btn-secundario"
            type="button"
            onClick={() => setEtapa(saloes.length > 0 ? "mapa" : "dados")}
          >
            Voltar
          </button>
          <button className="btn" type="submit" disabled={enviando}>
            {enviando ? "Confirmando..." : "Confirmar reserva"}
          </button>
        </div>
      </form>
    </div>
  );
}
