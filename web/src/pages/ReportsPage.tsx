import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { gerarRelatorio } from "../api/resources.js";
import type { Relatorio } from "../types.js";

function dataLocal(offsetDias = 0): string {
  const agora = new Date();
  agora.setDate(agora.getDate() + offsetDias);
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarPercentual(taxa: number | null): string {
  return taxa === null ? "-" : `${(taxa * 100).toFixed(1)}%`;
}

export function ReportsPage() {
  const { unidade } = useAuth();
  const [dataInicio, setDataInicio] = useState(dataLocal(-29));
  const [dataFim, setDataFim] = useState(dataLocal());
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    gerarRelatorio(unidade.id, dataInicio, dataFim)
      .then(setRelatorio)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel gerar o relatorio."))
      .finally(() => setCarregando(false));
  }, [unidade?.id, dataInicio, dataFim]);

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
            Até
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} min={dataInicio} />
          </label>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="grade-metricas">
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Taxa de ocupação</span>
          <strong>{carregando ? "-" : formatarPercentual(relatorio?.ocupacao.taxa ?? null)}</strong>
          {!carregando && relatorio && (
            <span className="texto-secundario" style={{ fontSize: "0.78rem" }}>
              {relatorio.ocupacao.reservasOcupando} reservas confirmadas/sentadas de {relatorio.ocupacao.capacidadeSlots}{" "}
              vagas possíveis no período
            </span>
          )}
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Taxa de não comparecimento</span>
          <strong>{carregando ? "-" : formatarPercentual(relatorio?.naoComparecimento.taxa ?? null)}</strong>
          {!carregando && relatorio && (
            <span className="texto-secundario" style={{ fontSize: "0.78rem" }}>
              {relatorio.naoComparecimento.totalNaoCompareceu} de {relatorio.naoComparecimento.totalReservas} reservas
              do período
            </span>
          )}
        </div>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Mesas mais pedidas</h3>
        <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Contagem de reservas por mesa no período selecionado, independente do status.
        </p>
        {carregando ? (
          <p>Carregando...</p>
        ) : !relatorio || relatorio.mesasMaisPedidas.length === 0 ? (
          <p className="texto-secundario">Nenhuma reserva no período selecionado.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Reservas</th>
              </tr>
            </thead>
            <tbody>
              {relatorio.mesasMaisPedidas.map((linha) => (
                <tr key={linha.mesaId}>
                  <td>{linha.mesaNome}</td>
                  <td>{linha.totalReservas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="texto-secundario" style={{ fontSize: "0.8rem" }}>
        A taxa de ocupação compara reservas confirmadas ou sentadas com o número de vagas teoricamente possíveis no
        período (mesas × horário de funcionamento ÷ duração padrão de cada reserva) - uma aproximação, já que não
        desconta bloqueios de mesa/salão.
      </p>
    </div>
  );
}
