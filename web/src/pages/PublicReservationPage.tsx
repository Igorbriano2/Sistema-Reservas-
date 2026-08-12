import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { ApiError } from "../api/client.js";
import {
  criarDepositoDeReservaPublica,
  criarReservaPublica,
  listarHorariosFixosPublico,
  listarMesasDisponiveisPublico,
  obterInfoDoLinkDeReserva,
  type DadosReservaPublica,
  type ReservaPublicaCriada,
  type SalaoPublico,
  type TurnoPublico,
} from "../api/resources.js";
import { Marca } from "../components/Marca.js";
import { SalaoCanvasSvg, type MesaCanvas } from "../components/salao-canvas/SalaoCanvasSvg.js";
import { carregarFacebookPixel, carregarGoogleTag, dispararEventoFacebook, dispararEventoGA4 } from "../lib/tracking.js";
import { stripePromise } from "../lib/stripe-client.js";

type Estado = "carregando" | "invalido" | "pronto";
// "dados": data/horario/pessoas. "mapa": escolher a mesa (so quando a unidade tem
// salao em modo "mapa"). "cliente": nome/telefone. "deposito": pagamento do deposito
// (doc 22, so quando o turno escolhido exige) - vem depois de "cliente" e antes da
// reserva de fato ser criada.
type Etapa = "dados" | "mapa" | "cliente" | "deposito";
type Consentimento = "pendente" | "aceito" | "recusado";

function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Formulario de cartao pro deposito (doc 22) - precisa estar dentro de <Elements>,
// por isso e um componente separado (useStripe/useElements so funcionam dentro do
// provider). Cria o PaymentIntent ao montar, e so confirma a reserva de fato depois
// que o pagamento suceder.
interface EtapaDepositoProps {
  token: string;
  dadosReserva: Omit<DadosReservaPublica, "paymentIntentId">;
  valorCentavos: number;
  onSucesso: (reserva: ReservaPublicaCriada) => void;
  onVoltar: () => void;
}

function FormularioDeposito({ token, dadosReserva, valorCentavos, onSucesso, onVoltar }: EtapaDepositoProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    criarDepositoDeReservaPublica(token, dadosReserva.data, dadosReserva.horaInicio, dadosReserva.numPessoas)
      .then((deposito) => setClientSecret(deposito.clientSecret))
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel iniciar o pagamento do deposito."))
      .finally(() => setPreparando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function pagarEConfirmar(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setEnviando(true);
    setErro(null);
    try {
      const { error: erroPagamento, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement, billing_details: { name: dadosReserva.clienteNome } },
      });
      if (erroPagamento || paymentIntent?.status !== "succeeded") {
        setErro(erroPagamento?.message ?? "Nao foi possivel confirmar o pagamento. Tente novamente.");
        return;
      }

      const reserva = await criarReservaPublica(token, { ...dadosReserva, paymentIntentId: paymentIntent.id });
      onSucesso(reserva);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Pagamento aprovado, mas nao foi possivel confirmar a reserva. Fale com o restaurante.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="form-login" onSubmit={pagarEConfirmar} style={{ width: 360 }}>
      <Marca tamanho="grande" />
      <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Depósito para confirmar</h1>
      <p className="texto-secundario" style={{ fontSize: "0.85rem", margin: 0 }}>
        Este horário exige um depósito de {formatarCentavos(valorCentavos)} para garantir a mesa. O valor é cobrado
        agora, no cartão informado abaixo.
      </p>
      {preparando ? (
        <p>Preparando pagamento...</p>
      ) : (
        <label>
          Cartão de crédito
          <div className="checkout-card-element">
            <CardElement options={{ style: { base: { color: "#f5efe8", fontSize: "15px", "::placeholder": { color: "rgba(245,239,232,.4)" } }, invalid: { color: "#9c6b5c" } } }} />
          </div>
        </label>
      )}
      {erro && <span className="erro">{erro}</span>}
      <div className="acoes">
        <button className="btn btn-secundario" type="button" onClick={onVoltar}>
          Voltar
        </button>
        <button className="btn" type="submit" disabled={enviando || preparando || !clientSecret}>
          {enviando ? "Processando..." : `Pagar ${formatarCentavos(valorCentavos)} e confirmar`}
        </button>
      </div>
    </form>
  );
}

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
  // null = ainda nao verificou ou sem restricao (campo livre). [] ou lista = so esses
  // horarios de inicio sao aceitos nessa data (turno/salao com horario fixo).
  const [horariosFixos, setHorariosFixos] = useState<string[] | null>(null);
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
  // Doc 22 - turno do horario escolhido, pra saber se precisa da etapa de deposito.
  const [turno, setTurno] = useState<TurnoPublico | null>(null);

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

  // Busca os horarios fixos aceitos nessa data assim que o cliente escolhe o dia -
  // troca o campo de horario livre por uma lista de opcoes quando o turno/salao
  // restringe (docs 28/29). null = sem restricao, mantem o campo livre normal.
  useEffect(() => {
    if (!token || !data) {
      setHorariosFixos(null);
      return;
    }
    let cancelado = false;
    listarHorariosFixosPublico(token, data)
      .then((resposta) => {
        if (cancelado) return;
        setHorariosFixos(resposta.horarios);
        if (resposta.horarios && resposta.horarios.length > 0) {
          setHoraInicio((atual) => (resposta.horarios!.includes(atual) ? atual : resposta.horarios![0]));
        }
      })
      .catch(() => {
        if (!cancelado) setHorariosFixos(null);
      });
    return () => {
      cancelado = true;
    };
  }, [token, data]);

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
      setTurno(resposta.disponibilidade.turno ?? null);
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

  function montarDadosReserva(): Omit<DadosReservaPublica, "paymentIntentId"> {
    return {
      data,
      horaInicio,
      numPessoas: Number(numPessoas),
      clienteNome,
      clienteTelefone: clienteTelefone || undefined,
      mesaId: mesaEscolhidaId ?? undefined,
      dataNascimento: dataNascimento || undefined,
      whatsappOptIn: clienteTelefone ? whatsappOptIn : undefined,
    };
  }

  function confirmarReserva(reserva: ReservaPublicaCriada) {
    setConfirmada(reserva);
    dispararEventoGA4("reserva_confirmada", { data: reserva.data, num_pessoas: reserva.numPessoas });
    dispararEventoFacebook("Lead");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    // Doc 22 - este turno exige deposito: em vez de criar a reserva direto, avanca
    // pra etapa de pagamento (a reserva so nasce depois do deposito confirmado).
    if (turno?.exigeDeposito && turno.valorDepositoCentavos) {
      setErro(null);
      setEtapa("deposito");
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const reserva = await criarReservaPublica(token, montarDadosReserva());
      confirmarReserva(reserva);
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
            {horariosFixos && horariosFixos.length > 0 ? (
              <select
                value={horaInicio}
                onChange={(e) => {
                  marcarInicioDaReserva();
                  setHoraInicio(e.target.value);
                }}
                required
              >
                {horariosFixos.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => {
                  marcarInicioDaReserva();
                  setHoraInicio(e.target.value);
                }}
                required
              />
            )}
          </label>
          {horariosFixos && horariosFixos.length === 0 && (
            <span className="erro">Não há horário disponível para reserva nesta data.</span>
          )}
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
          <button className="btn" type="submit" disabled={carregandoMapa || horariosFixos?.length === 0}>
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

  if (etapa === "cliente") {
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
            {enviando
              ? "Confirmando..."
              : turno?.exigeDeposito && turno.valorDepositoCentavos
                ? `Continuar para o depósito (${formatarCentavos(turno.valorDepositoCentavos)})`
                : "Confirmar reserva"}
          </button>
        </div>
      </form>
    </div>
    {bannerCookies}
    </>
  );
  }

  // etapa === "deposito" (doc 22)
  return (
    <>
      <div className="tela-login">
        {stripePromise ? (
          <Elements stripe={stripePromise}>
            <FormularioDeposito
              token={token!}
              dadosReserva={montarDadosReserva()}
              valorCentavos={turno!.valorDepositoCentavos!}
              onSucesso={confirmarReserva}
              onVoltar={() => setEtapa("cliente")}
            />
          </Elements>
        ) : (
          <div className="form-login">
            <Marca tamanho="grande" />
            <p className="erro">Pagamento não configurado. Fale com o restaurante para reservar neste horário.</p>
          </div>
        )}
      </div>
      {bannerCookies}
    </>
  );
}
