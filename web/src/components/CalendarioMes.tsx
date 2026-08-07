import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client.js";
import { listarReservasPorPeriodo } from "../api/resources.js";

interface CalendarioMesProps {
  unidadeId: string;
  dataSelecionada: string;
  onSelecionarData: (data: string) => void;
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function paraChave(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Grade de 6 semanas (42 celulas) comecando no domingo anterior (ou igual) ao dia 1 -
// simples e sempre cobre o mes inteiro sem precisar de altura variavel.
function gerarGrade(ano: number, mes: number): (number | null)[] {
  const diaDaSemanaDoPrimeiro = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [];
  for (let i = 0; i < diaDaSemanaDoPrimeiro; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);
  while (celulas.length < 42) celulas.push(null);
  return celulas;
}

export function CalendarioMes({ unidadeId, dataSelecionada, onSelecionarData }: CalendarioMesProps) {
  const [ano, mesIndice] = dataSelecionada.split("-").map(Number);
  const [mesVisivel, setMesVisivel] = useState({ ano, mes: mesIndice - 1 });
  const [contagemPorDia, setContagemPorDia] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);

  const grade = useMemo(() => gerarGrade(mesVisivel.ano, mesVisivel.mes), [mesVisivel]);
  const hojeChave = useMemo(() => {
    const hoje = new Date();
    return paraChave(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  }, []);

  useEffect(() => {
    const primeiroDia = paraChave(mesVisivel.ano, mesVisivel.mes, 1);
    const ultimoDiaNum = new Date(mesVisivel.ano, mesVisivel.mes + 1, 0).getDate();
    const ultimoDia = paraChave(mesVisivel.ano, mesVisivel.mes, ultimoDiaNum);
    setCarregando(true);
    listarReservasPorPeriodo(unidadeId, primeiroDia, ultimoDia)
      .then((reservas) => {
        const contagem: Record<string, number> = {};
        for (const r of reservas) {
          if (r.status === "cancelada") continue;
          contagem[r.data] = (contagem[r.data] ?? 0) + 1;
        }
        setContagemPorDia(contagem);
      })
      .catch((err) => {
        // Nao trava o calendario por um erro de rede - so fica sem os numeros de
        // contagem, a navegacao/selecao de dia continua funcionando.
        if (!(err instanceof ApiError)) console.error(err);
      })
      .finally(() => setCarregando(false));
  }, [unidadeId, mesVisivel]);

  function irParaMesAnterior() {
    setMesVisivel((atual) => (atual.mes === 0 ? { ano: atual.ano - 1, mes: 11 } : { ano: atual.ano, mes: atual.mes - 1 }));
  }

  function irParaProximoMes() {
    setMesVisivel((atual) => (atual.mes === 11 ? { ano: atual.ano + 1, mes: 0 } : { ano: atual.ano, mes: atual.mes + 1 }));
  }

  return (
    <div className="calendario-mes">
      <div className="calendario-mes-cabecalho">
        <button type="button" className="btn btn-secundario btn-icone" onClick={irParaMesAnterior} aria-label="Mes anterior">
          ‹
        </button>
        <strong>
          {NOMES_MES[mesVisivel.mes]} {mesVisivel.ano}
        </strong>
        <button type="button" className="btn btn-secundario btn-icone" onClick={irParaProximoMes} aria-label="Proximo mes">
          ›
        </button>
      </div>
      <div className="calendario-mes-semana">
        {DIAS_SEMANA.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className={`calendario-mes-grade ${carregando ? "carregando" : ""}`}>
        {grade.map((dia, indice) => {
          if (dia === null) return <span key={indice} className="calendario-mes-dia vazio" />;
          const chave = paraChave(mesVisivel.ano, mesVisivel.mes, dia);
          const contagem = contagemPorDia[chave] ?? 0;
          const classes = [
            "calendario-mes-dia",
            chave === hojeChave ? "hoje" : "",
            chave === dataSelecionada ? "selecionado" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={indice} type="button" className={classes} onClick={() => onSelecionarData(chave)}>
              <span>{dia}</span>
              {contagem > 0 && <span className="calendario-mes-contagem">{contagem}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
