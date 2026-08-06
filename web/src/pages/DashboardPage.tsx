import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { listarReservasPorPeriodo } from "../api/resources.js";
import type { Reserva, ReservaStatus } from "../types.js";

const STATUS_LABEL: Record<ReservaStatus, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluida",
  no_show: "Nao compareceu",
};

const STATUS_ORDEM: ReservaStatus[] = ["confirmada", "pendente", "concluida", "no_show", "cancelada"];

function dataLocal(offsetDias = 0): string {
  const agora = new Date();
  agora.setDate(agora.getDate() + offsetDias);
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
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

      <div className="grade-metricas">
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Total de reservas</span>
          <strong>{carregando ? "-" : metricas.totalReservasAtivas}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Total de pessoas</span>
          <strong>{carregando ? "-" : metricas.totalPessoas}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Taxa de nao comparecimento</span>
          <strong>
            {carregando || metricas.taxaNaoComparecimento === null
              ? "-"
              : `${metricas.taxaNaoComparecimento.toFixed(0)}%`}
          </strong>
        </div>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Reservas por status</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : reservas.length === 0 ? (
          <p className="texto-secundario">Nenhuma reserva no periodo selecionado.</p>
        ) : (
          <div className="barra-status">
            {STATUS_ORDEM.map((status) => {
              const quantidade = metricas.porStatus[status];
              const percentual = reservas.length > 0 ? (quantidade / reservas.length) * 100 : 0;
              return (
                <div key={status} className="linha-status">
                  <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
                  <div className="trilha-status">
                    <div className={`preenchimento-status preenchimento-${status}`} style={{ width: `${percentual}%` }} />
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
