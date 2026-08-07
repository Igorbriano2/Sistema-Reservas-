import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { carregarFacebookPixel, carregarGoogleTag, dispararEventoFacebook, dispararEventoGA4 } from "../lib/tracking.js";

type Estado = "carregando" | "invalido" | "pronto";
// "dados": data/horario/pessoas. "mapa": escolher a mesa (so quando a unidade tem
// salao em modo "mapa"). "cliente": nome/telefone + confirmar.
type Etapa = "dados" | "mapa" | "cliente";
type Consentimento = "pendente" | "aceito" | "recusado";

// Mesa sem posicao/tamanho salvos (nunca deveria acontecer se o dono usou o editor
// visual, mas evita esconder uma mesa reservavel do cliente por falta de dados).
const TAMANHO_PADRAO_FALLBACK = 90;

const CHAVE_CONSENTIMENTO = "consentimento_cookies";

function lerConsentimentoSalvo(): Consentimento {
  const salvo = localStorage.getItem(CHAVE_CONSENTIMENTO);
  return salvo === "aceito" || salvo === "recusado" ? salvo : "pendente";
}

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
  const [dataNascimento, setDataNascimento] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

  const [saloes, setSaloes] = useState<SalaoPublico[]>([]);
  const [salaoEscolhidoId, setSalaoEscolhidoId] = useState("");
  const [mesaEscolhidaId, setMesaEscolhidaId] = useState<string | null>(null);
  const [avisoDisponibilidade, setAvisoDisponibilidade] = useState<string | null>(null);
  const [carregandoMapa, setCarregandoMapa] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmada, setConfirmada] = useState<ReservaPublicaCriada | null>(null);

  const [tracking, setTracking] = useState<{ googleTagId: string | null; facebookPixelId: string | null }>({
    googleTagId: null,
    facebookPixelId: null,
  });
  const [consentimento, setConsentimento] = useState<Consentimento>(lerConsentimentoSalvo);
  // "Comecou a preencher" e "ja disparou o evento" sao coisas diferentes: o cliente
  // pode preencher o primeiro campo antes de decidir sobre os cookies, e o evento so
  // pode ser enviado quando (e se) o consentimento chegar depois disso.
  const [iniciouPreenchimento, setIniciouPreenchimento] = useState(false);
  const jaIniciouReservaRef = useRef(false);
  const eventoIniciouDisparadoRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      return;
    }
    obterInfoDoLinkDeReserva(token)
      .then((info) => {
        setUnidadeNome(info.unidadeNome);
        setTracking({ googleTagId: info.googleTagId, facebookPixelId: info.facebookPixelId });
        setEstado("pronto");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  // So carrega os scripts de rastreamento depois do consentimento (mesmo que ja
  // salvo de uma visita anterior) e so se o restaurante configurou pelo menos um id -
  // nunca dispara nada sem consentimento explicito, nunca com id vazio.
  useEffect(() => {
    if (consentimento !== "aceito") return;
    if (tracking.googleTagId) carregarGoogleTag(tracking.googleTagId);
    if (tracking.facebookPixelId) carregarFacebookPixel(tracking.facebookPixelId);
  }, [consentimento, tracking]);

  // So dispara depois que os scripts acima ja rodaram (mesmo efeito de consentimento
  // "aceito", so que declarado depois - roda em seguida, na mesma leva). Se o cliente
  // ja tinha comecado a preencher antes de aceitar, o evento sai aqui; se aceitar veio
  // primeiro, sai na hora que o campo e preenchido (o efeito ja tem os dois como true).
  useEffect(() => {
    if (!iniciouPreenchimento) return;
    if (consentimento !== "aceito") return;
    if (eventoIniciouDisparadoRef.current) return;
    eventoIniciouDisparadoRef.current = true;
    dispararEventoGA4("iniciou_reserva");
    dispararEventoFacebook("InitiateCheckout");
  }, [iniciouPreenchimento, consentimento]);

  function aceitarCookies() {
    localStorage.setItem(CHAVE_CONSENTIMENTO, "aceito");
    setConsentimento("aceito");
  }

  function recusarCookies() {
    localStorage.setItem(CHAVE_CONSENTIMENTO, "recusado");
    setConsentimento("recusado");
  }

  // Marca que o cliente comecou a preencher o formulario inicial (data/horario/pessoas) -
  // so uma vez, mesmo que o consentimento de cookies ainda nao tenha chegado (o disparo
  // de fato acontece no efeito acima, quando as duas condicoes estiverem satisfeitas).
  function marcarInicioDaReserva() {
    if (jaIniciouReservaRef.current) return;
    jaIniciouReservaRef.current = true;
    setIniciouPreenchimento(true);
  }

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
        dataNascimento: dataNascimento || undefined,
        whatsappOptIn: clienteTelefone ? whatsappOptIn : undefined,
      });
      setConfirmada(reserva);
      dispararEventoGA4("reserva_confirmada", { data: reserva.data, num_pessoas: reserva.numPessoas });
      dispararEventoFacebook("Lead");
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

  // So aparece se o restaurante configurou pelo menos um pixel/tag - sem isso nao
  // ha nenhum script de rastreamento pra pedir consentimento sobre.
  const temTracking = !!(tracking.googleTagId || tracking.facebookPixelId);
  const bannerCookies = temTracking && consentimento === "pendente" && (
    <div className="banner-cookies">
      <p>
        Usamos cookies pra medir o resultado das campanhas deste restaurante. Voce pode aceitar ou recusar - a
        reserva funciona normalmente de qualquer jeito.
      </p>
      <div className="acoes">
        <button className="btn btn-secundario" type="button" onClick={recusarCookies}>
          Recusar
        </button>
        <button className="btn" type="button" onClick={aceitarCookies}>
          Aceitar
        </button>
      </div>
    </div>
  );

  if (confirmada) {
    return (
      <>
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
        {bannerCookies}
      </>
    );
  }

  if (etapa === "dados") {
    return (
      <>
      <div className="tela-login">
        <form className="form-login" onSubmit={avancarParaMapa} style={{ width: 360 }}>
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Reservar em {unidadeNome}</h1>
          <label>
            Data
            <input
              type="date"
              value={data}
              onChange={(e) => {
                marcarInicioDaReserva();
                setData(e.target.value);
              }}
              required
            />
          </label>
          <label>
            Horario
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => {
                marcarInicioDaReserva();
                setHoraInicio(e.target.value);
              }}
              required
            />
          </label>
          <label>
            Numero de pessoas
            <input
              type="number"
              min={1}
              value={numPessoas}
              onChange={(e) => {
                marcarInicioDaReserva();
                setNumPessoas(e.target.value);
              }}
              required
            />
          </label>
          {erro && <span className="erro">{erro}</span>}
          <button className="btn" type="submit" disabled={carregandoMapa}>
            {carregandoMapa ? "Verificando..." : "Continuar"}
          </button>
        </form>
      </div>
      {bannerCookies}
      </>
    );
  }

  if (etapa === "mapa") {
    return (
      <>
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
      {bannerCookies}
      </>
    );
  }

  // etapa === "cliente"
  return (
    <>
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
        <label>
          Data de nascimento (opcional)
          <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={whatsappOptIn}
            disabled={!clienteTelefone}
            onChange={(e) => setWhatsappOptIn(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>
            Aceito receber novidades e promoções por WhatsApp
            {!clienteTelefone && <span className="texto-secundario"> (informe o telefone acima)</span>}
          </span>
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
    {bannerCookies}
    </>
  );
}
