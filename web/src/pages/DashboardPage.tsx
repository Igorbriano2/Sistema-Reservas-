import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { listarReservasPorPeriodo } from "../api/resources.js";
import { EmptyState, Skeleton, StatusBadge } from "../components/ui/index.js";
import type { Reserva, ReservaStatus } from "../types.js";

// Pendente primeiro (doc redesign, "destaque proximas reservas e pendencias") - e
// o status que mais precisa de atencao/acao, entao aparece no topo da distribuicao
// em vez de no meio.
const STATUS_ORDEM: ReservaStatus[] = ["pendente", "confirmada", "concluida", "no_show", "cancelada"];

function dataLocal(offsetDias = 0): string {
  const agora = new Date();
  agora.setDate(agora.getDate() + offsetDias);
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Anima um numero de 0 ate o valor final (efeito "contagem") quando `ativo` liga -
// so roda depois que os dados carregaram, pra nao animar em cima do placeholder "-".
function useContagemAnimada(valor: number, ativo: boolean, duracaoMs = 700): number {
  const [exibido, setExibido] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let inicio: number | null = null;
    let quadro: number;
    function passo(tempo: number) {
      if (inicio === null) inicio = tempo;
      const progresso = Math.min((tempo - inicio) / duracaoMs, 1);
      setExibido(Math.round(valor * progresso));
      if (progresso < 1) quadro = requestAnimationFrame(passo);
    }
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, ativo, duracaoMs]);

  return exibido;
}

export function DashboardPage() {
  const { unidade } = useAuth();
  const [dataInicio, setDataInicio] = useState(dataLocal(-29));
  const [dataFim, setDataFim] = useState(dataLocal());
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    listarReservasPorPeriodo(unidade.id, dataInicio, dataFim)
      .then(setReservas)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar o resumo."))
      .finally(() => setCarregando(false));
  }, [unidade?.id, dataInicio, dataFim]);

  const metricas = useMemo(() => {
    const porStatus: Record<ReservaStatus, number> = {
      pendente: 0,
      confirmada: 0,
      cancelada: 0,
      concluida: 0,
      no_show: 0,
    };
    let totalReservasAtivas = 0;
    let totalPessoas = 0;
    for (const reserva of reservas) {
      porStatus[reserva.status] += 1;
      if (reserva.status !== "cancelada") {
        totalReservasAtivas += 1;
        totalPessoas += reserva.numPessoas;
      }
    }
    const finalizadas = porStatus.concluida + porStatus.no_show;
    const taxaNaoComparecimento = finalizadas > 0 ? (porStatus.no_show / finalizadas) * 100 : null;
    return { porStatus, totalReservasAtivas, totalPessoas, taxaNaoComparecimento };
  }, [reservas]);

  // "Proximas reservas" (doc redesign, UX pedido: "destaque proximas reservas e
  // pendencias") - reaproveita os dados JA carregados pelo periodo selecionado
  // (mesmo endpoint, sem chamada nova) - so faz sentido mostrar quando "hoje" cai
  // dentro do periodo escolhido, senao a lista ficaria vazia ou (pior) mostrando
  // reservas de um dia que nao e mais "hoje" como se fossem proximas.
  const hoje = dataLocal();
  const hojeNoPeriodo = dataInicio <= hoje && hoje <= dataFim;
  const proximasReservas = useMemo(() => {
    if (!hojeNoPeriodo) return [];
    return reservas
      .filter((r) => r.data === hoje && (r.status === "pendente" || r.status === "confirmada"))
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservas, hoje, hojeNoPeriodo]);

  const pronto = !carregando;
  const totalReservasAnimado = useContagemAnimada(metricas.totalReservasAtivas, pronto);
  const totalPessoasAnimado = useContagemAnimada(metricas.totalPessoas, pronto);
  const taxaNaoComparecimentoAnimada = useContagemAnimada(Math.round(metricas.taxaNaoComparecimento ?? 0), pronto);

  // As barras de status nascem em 0% e crescem ate o percentual real um instante
  // depois de montar - dispara a transicao CSS de width em vez de aparecer ja no
  // tamanho final (sem isso nao ha "de" pra transicionar "para").
  const [larguraPronta, setLarguraPronta] = useState(false);
  useEffect(() => {
    setLarguraPronta(false);
    const quadro = requestAnimationFrame(() => setLarguraPronta(true));
    return () => cancelAnimationFrame(quadro);
  }, [metricas]);

  if (!unidade) {
    return <p>Carregando unidade...</p>;
  }

  return (
    <div>
      <div className="cartao">
        <div className="linha-form" style={{ marginBottom: 0 }}>
          <label>
            De
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} max={dataFim} />
          </label>
          <label>
            Ate
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} min={dataInicio} />
          </label>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {hojeNoPeriodo && (
        <div className="cartao">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Próximas reservas de hoje</h3>
            <Link className="link-trocar-painel" to="/admin/reservas">
              Ver todas →
            </Link>
          </div>
          {carregando ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <Skeleton altura="2.5rem" />
              <Skeleton altura="2.5rem" />
              <Skeleton altura="2.5rem" />
            </div>
          ) : proximasReservas.length === 0 ? (
            <EmptyState titulo="Nenhuma reserva pendente para hoje" descricao="Tudo tranquilo por enquanto." />
          ) : (
            <div className="tabela-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Pessoas</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {proximasReservas.map((r) => (
                    <tr key={r.id}>
                      <td>{r.horaInicio.slice(0, 5)}</td>
                      <td>{r.clienteNome}</td>
                      <td>{r.numPessoas}</td>
                      <td>
                        <StatusBadge estado={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grade-metricas">
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Total de reservas</span>
          <strong>{carregando ? "-" : totalReservasAnimado}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Total de pessoas</span>
          <strong>{carregando ? "-" : totalPessoasAnimado}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Taxa de nao comparecimento</span>
          <strong>
            {carregando || metricas.taxaNaoComparecimento === null ? "-" : `${taxaNaoComparecimentoAnimada}%`}
          </strong>
        </div>
      </div>

      <div className="cartao cartao-grafico">
        <h3 style={{ marginTop: 0 }}>Reservas por status</h3>
        {carregando ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <Skeleton altura="1.5rem" />
            <Skeleton altura="1.5rem" />
            <Skeleton altura="1.5rem" />
          </div>
        ) : reservas.length === 0 ? (
          <EmptyState titulo="Nenhuma reserva no período selecionado" descricao="Ajuste o período acima pra ver outros dias." />
        ) : (
          <div className="barra-status">
            {STATUS_ORDEM.map((status) => {
              const quantidade = metricas.porStatus[status];
              const percentual = reservas.length > 0 ? (quantidade / reservas.length) * 100 : 0;
              return (
                <div key={status} className="linha-status">
                  <StatusBadge estado={status} />
                  <div className="trilha-status">
                    <div
                      className={`preenchimento-status preenchimento-${status}`}
                      style={{ width: larguraPronta ? `${percentual}%` : "0%" }}
                    />
                  </div>
                  <span className="texto-secundario">{quantidade}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
