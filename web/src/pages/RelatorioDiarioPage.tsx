import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { listarMesas, listarReservas, listarSaloes } from "../api/resources.js";
import { EmptyState, Skeleton, StatusBadge } from "../components/ui/index.js";
import type { Mesa, Reserva, Salao } from "../types.js";

function hojeLocal(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const STATUS_LABEL: Record<Reserva["status"], string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluida",
  no_show: "Nao compareceu",
};

// Escapa aspas/virgula/quebra de linha pra um campo CSV valido (RFC 4180 basico) -
// sem lib externa, campo de restaurante nunca precisa de mais que isso.
function paraCampoCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

// Doc 46 - relatorio do dia (reservas + comandas), pensado pro fechamento do
// restaurante: uma lista de tudo que aconteceu no dia, com a comanda de cada mesa, pra
// conferir contra o caixa. So aparece pra empresas com comandaHabilitada (Cervegela
// por enquanto, ver ClientesPage no painel da plataforma) - reaproveita o MESMO
// endpoint de listagem de reservas que a pagina operacional (GET .../reservations?
// data=), sem rota nova no backend: e so uma visao/exportacao diferente do mesmo dado
// que o atendente ja pode ver na aba Reservas.
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
  const totalComComanda = useMemo(() => reservas.filter((r) => r.comanda).length, [reservas]);

  function exportarCsv() {
    const cabecalho = ["Hora", "Cliente", "Telefone", "Pessoas", "Local", "Comanda", "Status", "Observacoes"];
    const linhas = reservasOrdenadas.map((r) =>
      [
        r.horaInicio.slice(0, 5),
        r.clienteNome,
        r.clienteTelefone ?? "",
        String(r.numPessoas),
        nomeDoLocal(r),
        r.comanda ?? "",
        STATUS_LABEL[r.status],
        r.observacoes ?? "",
      ]
        .map(paraCampoCsv)
        .join(","),
    );
    // BOM (﻿) na frente - sem isso o Excel abre acentos quebrados num CSV UTF-8.
    const conteudo = "﻿" + [cabecalho.join(","), ...linhas].join("\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-${data}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
          <button type="button" className="btn btn-secundario" disabled={reservasOrdenadas.length === 0} onClick={exportarCsv}>
            Exportar CSV
          </button>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="grade-metricas">
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Reservas no dia</span>
          <strong>{carregando ? "-" : reservas.length}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Pessoas (exceto canceladas)</span>
          <strong>{carregando ? "-" : totalPessoas}</strong>
        </div>
        <div className="cartao cartao-metrica">
          <span className="texto-secundario">Com comanda preenchida</span>
          <strong>{carregando ? "-" : `${totalComComanda} de ${reservas.length}`}</strong>
        </div>
      </div>

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
                  <th>Comanda</th>
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
                    <td>{reserva.comanda ?? "-"}</td>
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
