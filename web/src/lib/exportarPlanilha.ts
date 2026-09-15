import type { Reserva } from "../types.js";

// So gera planilhas (json_to_sheet + writeFile) a partir de dados que ja vieram da
// nossa propria API - NUNCA chama XLSX.read/readFile sobre arquivo nenhum (upload,
// etc). As duas CVEs conhecidas do pacote xlsx (prototype pollution e ReDoS) vivem no
// caminho de LEITURA/parse de planilha; como esse caminho nunca e exercitado aqui, elas
// nao se aplicam a este uso.

const STATUS_LABEL: Record<Reserva["status"], string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluida",
  no_show: "Nao compareceu",
};

interface LinhaReserva {
  Hora: string;
  Cliente: string;
  Telefone: string;
  Pessoas: number;
  Local: string;
  Mesa: string;
  Comandas: string;
  Status: string;
  Observacoes: string;
}

interface LinhaComanda {
  Comanda: string;
  Mesa: string;
  Cliente: string;
  Hora: string;
  Pessoas: number;
  Status: string;
}

// Relatorio do dia (doc 46) - pedido explicito: "relatorio de comandas, mesa e
// reserva" exportavel em planilha. Duas abas cobrem as duas granularidades uteis pro
// fechamento do restaurante: uma linha por RESERVA (visao geral do dia) e uma linha
// por COMANDA (visao de conferencia contra o caixa - uma mesa com 3 comandas vira 3
// linhas, cada uma ja com a mesa/reserva que ela pertence).
export async function exportarRelatorioDiarioXlsx(params: {
  data: string;
  reservas: Reserva[];
  nomeDoLocal: (reserva: Reserva) => string;
}): Promise<void> {
  const { data, reservas, nomeDoLocal } = params;
  // Import dinamico: o xlsx sozinho pesa ~300kb (gzip) - carregar ele so quando o
  // atendente de fato clica em "Exportar planilha" (uma pagina hoje restrita a
  // Cervegela) evita inflar o bundle inicial de TODO o painel com uma lib que a
  // maioria das empresas nunca usa.
  const XLSX = await import("xlsx");

  const linhasReservas: LinhaReserva[] = reservas.map((r) => ({
    Hora: r.horaInicio.slice(0, 5),
    Cliente: r.clienteNome,
    Telefone: r.clienteTelefone ?? "",
    Pessoas: r.numPessoas,
    Local: nomeDoLocal(r),
    Mesa: r.mesaFisica ?? "",
    Comandas: r.comandas.map((c) => c.numero).join(", "),
    Status: STATUS_LABEL[r.status],
    Observacoes: r.observacoes ?? "",
  }));

  const linhasComandas: LinhaComanda[] = reservas.flatMap((r) =>
    r.comandas.map((c) => ({
      Comanda: c.numero,
      Mesa: r.mesaFisica ?? "",
      Cliente: r.clienteNome,
      Hora: r.horaInicio.slice(0, 5),
      Pessoas: r.numPessoas,
      Status: STATUS_LABEL[r.status],
    })),
  );

  const planilha = XLSX.utils.book_new();
  const abaReservas = XLSX.utils.json_to_sheet(linhasReservas);
  const abaComandas = XLSX.utils.json_to_sheet(linhasComandas);
  // Largura de coluna aproximada (em "caracteres") pra nao abrir com tudo cortado -
  // XLSX.utils nao calcula isso sozinho.
  abaReservas["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 16 },
    { wch: 8 },
    { wch: 18 },
    { wch: 8 },
    { wch: 20 },
    { wch: 14 },
    { wch: 30 },
  ];
  abaComandas["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 6 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(planilha, abaReservas, "Reservas");
  XLSX.utils.book_append_sheet(planilha, abaComandas, "Comandas");

  XLSX.writeFile(planilha, `relatorio-${data}.xlsx`);
}
