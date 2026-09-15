import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { listarMesas, listarReservas, listarSaloes } from "../api/resources.js";
import { EmptyState, Skeleton, StatusBadge } from "../components/ui/index.js";
import { exportarRelatorioDiarioXlsx } from "../lib/exportarPlanilha.js";
import { useContagemAnimada } from "../lib/useContagemAnimada.js";
import type { Mesa, Reserva, ReservaStatus, Salao } from "../types.js";

function hojeLocal(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Mesma ordem/paleta usada no dashboard gerencial (DashboardPage) - pendente primeiro
// por ser o status que mais precisa de atencao.
const STATUS_ORDEM: ReservaStatus[] = ["pendente", "confirmada", "concluida", "no_show", "cancelada"];

// Doc 46 - relatorio do dia (reservas + mesa fisica + comandas), pensado pro fechamento
// do restaurante: um dashboard com o resumo do dia e uma exportacao em planilha (.xlsx,
// com uma aba por reserva e outra por comanda), pra conferir contra o caixa. So aparece
// pra empresas com comandaHabilitada (Cervegela por enquanto, ver ClientesPage no
// painel da plataforma) - reaproveita o MESMO endpoint de listagem de reservas que a
// pagina operacional (GET .../reservations?data=), sem rota nova no backend: e so uma
// visao/exportacao diferente do mesmo dado que o atendente ja pode ver na aba Reservas.
export function RelatorioDiarioPage() {
  const { unidade, usuario } = useAuth();
  const [data, setData] = useState(hojeLocal());
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const mesasPorId = useMemo(() => new Map(mesas.map((m) => [m.id, m])), [mesas]);
  const saloesPorId = useMemo(() => new Map(saloes.map((s) => [s.id, s])), [saloes]);

  function nomeDoLocal(reserva: Reserva): string {
    if (reserva.mesaId) return mesasPorId.get(reserva.mesaId)?.nome ?? "-";
    if (reserva.salaoId) return saloesPorId.get(reserva.salaoId)?.nome ?? "-";
    return "-";
  }

  useEffect(() => {
    if (!unidade || !usuario?.comandaHabilitada) return;
    setCarregando(true);
    setErro(null);
    Promise.all([listarReservas(unidade.id, data), listarMesas(unidade.id), listarSaloes(unidade.id)])
      .then(([listaReservas, listaMesas, listaSaloes]) => {
        setReservas(listaReservas);
        setMesas(listaMesas);
        setSaloes(listaSaloes);
      })
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar o relatorio."))
      .finally(() => setCarregando(false));
  }, [unidade?.id, data, usuario?.comandaHabilitada]);

  const reservasOrdenadas = useMemo(() => [...reservas].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)), [reservas]);
  const naoCanceladas = useMemo(() => reservas.filter((r) => r.status !== "cancelada"), [reservas]);
  const totalPessoas = useMemo(() => naoCanceladas.reduce((soma, r) => soma + r.numPessoas, 0), [naoCanceladas]);
  const totalComandas = useMemo(() => reservas.reduce((soma, r) => soma + r.comandas.length, 0), [reservas]);
  const mesasEmUso = useMemo(() => new Set(reservas.map((r) => r.mesaFisica).filter((m): m is string => !!m)).size, [reservas]);

  const porStatus = useMemo(() => {
    const contagem: Record<ReservaStatus, number> = { pendente: 0, confirmada: 0, cancelada: 0, concluida: 0, no_show: 0 };
    for (const r of reservas) contagem[r.status] += 1;
    return contagem;
  }, [reservas]);

  // Comandas por mesa fisica (doc 46, "relatorio de comandas, mesa e reserva") - da pro
  // atendente ver de relance quais mesas concentram mais comandas abertas no dia. So
  // considera reservas com mesa fisica atribuida (ou seja, ja sentadas).
  const comandasPorMesa = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of reservas) {
      if (!r.mesaFisica) continue;
      mapa.set(r.mesaFisica, (mapa.get(r.mesaFisica) ?? 0) + r.comandas.length);
    }
    return [...mapa.entries()]
      .map(([mesa, quantidade]) => ({ mesa, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [reservas]);
  const maxComandasPorMesa = comandasPorMesa[0]?.quantidade ?? 0;

  const pronto = !carregando;
  const totalReservasAnimado = useContagemAnimada(reservas.length, pronto);
  const totalPessoasAnimado = useContagemAnimada(totalPessoas, pronto);
  const mesasEmUsoAnimado = useContagemAnimada(mesasEmUso, pronto);
  const totalComandasAnimado = useContagemAnimada(totalComandas, pronto);

  const [larguraPronta, setLarguraPronta] = useState(false);
  useEffect(() => {
    setLarguraPronta(false);
    const quadro = requestAnimationFrame(() => setLarguraPronta(true));
    return () => cancelAnimationFrame(quadro);
  }, [reservas]);

  const [exportando, setExportando] = useState(false);

  async function exportarPlanilha() {
    setExportando(true);
    setErro(null);
    try {
      await exportarRelatorioDiarioXlsx({ data, reservas: reservasOrdenadas, nomeDoLocal });
    } catch {
      setErro("Nao foi possivel gerar a planilha.");
    } finally {
      setExportando(false);
    }
  }

  if (!unidade) {
    return <p>Carregando unidade...</p>;
  }

  // Defesa extra alem do item de menu escondido (Layout.tsx) - navegar direto pra
  // /admin/relatorio-diario por URL nao deveria mostrar nada pra quem nao tem a
  // funcionalidade marcada. Os dados em si nao sao mais sensiveis que a aba Reservas
  // normal (mesmo endpoint, mesma permissao) - isso e so consistencia de produto.
  if (!usuario?.comandaHabilitada) {
    return (
      <div className="cartao">
        <p className="texto-secundario">Esta funcionalidade ainda não está liberada para esta empresa.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="cartao">
        <div className="linha-form" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <label>
            Dia
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} max={hojeLocal()} />
          </label>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-secundario"
            disabled={reservasOrdenadas.length === 0 || exportando}
            onClick={exportarPlanilha}
          >
            {exportando ? "Gerando..." : "Exportar planilha (.xlsx)"}
          </button>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="grade-metricas">
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Reservas no dia</span>
          <strong>{carregando ? "-" : totalReservasAnimado}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Pessoas (exceto canceladas)</span>
          <strong>{carregando ? "-" : totalPessoasAnimado}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Mesas em uso</span>
          <strong>{carregando ? "-" : mesasEmUsoAnimado}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Comandas abertas</span>
          <strong>{carregando ? "-" : totalComandasAnimado}</strong>
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
          <EmptyState titulo="Nenhuma reserva nesta data" descricao="Escolha outro dia para ver o relatório." />
        ) : (
          <div className="barra-status">
            {STATUS_ORDEM.map((status) => {
              const quantidade = porStatus[status];
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

      {!carregando && comandasPorMesa.length > 0 && (
        <div className="cartao cartao-grafico">
          <h3 style={{ marginTop: 0 }}>Comandas por mesa</h3>
          <div className="barra-status">
            {comandasPorMesa.map(({ mesa, quantidade }) => {
              const percentual = maxComandasPorMesa > 0 ? (quantidade / maxComandasPorMesa) * 100 : 0;
              return (
                <div key={mesa} className="linha-status">
                  <span>Mesa {mesa}</span>
                  <div className="trilha-status">
                    <div
                      className="preenchimento-status preenchimento-confirmada"
                      style={{ width: larguraPronta ? `${percentual}%` : "0%" }}
                    />
                  </div>
                  <span className="texto-secundario">{quantidade}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="cartao">
        {carregando ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Skeleton altura="3rem" />
            <Skeleton altura="3rem" />
            <Skeleton altura="3rem" />
          </div>
        ) : reservasOrdenadas.length === 0 ? (
          <EmptyState titulo="Nenhuma reserva nesta data" descricao="Escolha outro dia para ver o relatório." />
        ) : (
          <div className="tabela-scroll">
            <table className="tabela-reservas">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Pessoas</th>
                  <th>Local</th>
                  <th>Mesa</th>
                  <th>Comandas</th>
                  <th>Status</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {reservasOrdenadas.map((reserva) => (
                  <tr key={reserva.id}>
                    <td>{reserva.horaInicio.slice(0, 5)}</td>
                    <td>
                      {reserva.clienteNome}
                      {reserva.clienteTelefone && (
                        <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                          {reserva.clienteTelefone}
                        </div>
                      )}
                    </td>
                    <td>{reserva.numPessoas}</td>
                    <td>{nomeDoLocal(reserva)}</td>
                    <td>{reserva.mesaFisica ?? "-"}</td>
                    <td>{reserva.comandas.length > 0 ? reserva.comandas.map((c) => c.numero).join(", ") : "-"}</td>
                    <td>
                      <StatusBadge estado={reserva.status} />
                    </td>
                    <td>{reserva.observacoes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
