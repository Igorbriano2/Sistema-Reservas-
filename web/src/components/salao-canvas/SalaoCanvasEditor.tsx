import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api/client.js";
import { atualizarMesa, criarMesa, excluirMesa } from "../../api/resources.js";
import type { Mesa, MesaFormato } from "../../types.js";
import { CANVAS_LARGURA, SalaoCanvasSvg, type MesaCanvas } from "./SalaoCanvasSvg.js";

const TAMANHO_PADRAO: Record<MesaFormato, { largura: number; altura: number }> = {
  redonda: { largura: 90, altura: 90 },
  quadrada: { largura: 90, altura: 90 },
  retangular: { largura: 140, altura: 80 },
};

const LABEL_FORMATO: Record<MesaFormato, string> = {
  redonda: "Redonda",
  quadrada: "Quadrada",
  retangular: "Retangular",
};

// Posicao em cascata pra mesas que ainda nao foram colocadas no canvas (nulas no
// banco) - so pra elas aparecerem em algum lugar visivel e arrastavel; nao tenta ser
// um layout "bonito" (o dono vai reorganizar arrastando de qualquer forma).
function posicaoPadrao(indice: number, largura: number, altura: number) {
  const colunas = Math.max(1, Math.floor((CANVAS_LARGURA - 40) / (largura + 20)));
  const coluna = indice % colunas;
  const linha = Math.floor(indice / colunas);
  return {
    posX: 20 + coluna * (largura + 20),
    posY: 20 + linha * (altura + 20),
  };
}

function paraMesaCanvas(mesa: Mesa, indice: number): MesaCanvas {
  const tamanho = TAMANHO_PADRAO[mesa.formato];
  const jaPosicionada = mesa.posX != null && mesa.posY != null && mesa.largura != null && mesa.altura != null;
  const posicao = jaPosicionada
    ? { posX: mesa.posX!, posY: mesa.posY! }
    : posicaoPadrao(indice, tamanho.largura, tamanho.altura);
  return {
    id: mesa.id,
    nome: mesa.nome,
    capacidadeMin: mesa.capacidadeMin,
    capacidadeMax: mesa.capacidadeMax,
    formato: mesa.formato,
    posX: posicao.posX,
    posY: posicao.posY,
    largura: mesa.largura ?? tamanho.largura,
    altura: mesa.altura ?? tamanho.altura,
  };
}

interface SalaoCanvasEditorProps {
  unidadeId: string;
  salaoId: string;
  mesasDoSalao: Mesa[];
  onAlterado: () => void;
}

export function SalaoCanvasEditor({ unidadeId, salaoId, mesasDoSalao, onAlterado }: SalaoCanvasEditorProps) {
  const [mesasLocais, setMesasLocais] = useState<MesaCanvas[]>([]);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [mesaEditandoId, setMesaEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const convertidas = mesasDoSalao.map(paraMesaCanvas);
    setMesasLocais(convertidas);
    // Mesas sem posicao salva ja entram como pendentes - assim um "Salvar" sem
    // nenhum arraste ainda persiste a posicao padrao calculada acima (evita que ela
    // "pule" de lugar a cada recarregamento, ja que o calculo depende do indice).
    const semPosicaoSalva = mesasDoSalao.filter((m) => m.posX == null || m.posY == null).map((m) => m.id);
    if (semPosicaoSalva.length > 0) {
      setPendentes((atual) => new Set([...atual, ...semPosicaoSalva]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesasDoSalao]);

  const mesaEditando = useMemo(() => mesasLocais.find((m) => m.id === mesaEditandoId) ?? null, [mesasLocais, mesaEditandoId]);

  function atualizarMesaLocal(id: string, patch: Partial<MesaCanvas>) {
    setMesasLocais((lista) => lista.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setPendentes((atual) => new Set(atual).add(id));
  }

  async function soltarNovaMesa(formato: MesaFormato, x: number, y: number) {
    setErro(null);
    const tamanho = TAMANHO_PADRAO[formato];
    try {
      const mesa = await criarMesa(unidadeId, {
        salaoId,
        nome: `Mesa ${mesasLocais.length + 1}`,
        capacidadeMin: 1,
        capacidadeMax: 4,
        formato,
        posX: x - tamanho.largura / 2,
        posY: y - tamanho.altura / 2,
        largura: tamanho.largura,
        altura: tamanho.altura,
      });
      setMesasLocais((lista) => [...lista, paraMesaCanvas(mesa, lista.length)]);
      onAlterado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel adicionar a mesa.");
    }
  }

  async function excluir(id: string) {
    const mesa = mesasLocais.find((m) => m.id === id);
    if (!mesa) return;
    if (!confirm(`Remover a mesa "${mesa.nome}"? Essa acao nao pode ser desfeita.`)) return;
    setErro(null);
    try {
      await excluirMesa(unidadeId, id);
      setMesasLocais((lista) => lista.filter((m) => m.id !== id));
      setPendentes((atual) => {
        const novo = new Set(atual);
        novo.delete(id);
        return novo;
      });
      if (mesaEditandoId === id) setMesaEditandoId(null);
      onAlterado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel remover a mesa.");
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await Promise.all(
        [...pendentes].map((id) => {
          const mesa = mesasLocais.find((m) => m.id === id);
          if (!mesa) return Promise.resolve();
          return atualizarMesa(unidadeId, id, {
            nome: mesa.nome,
            capacidadeMin: mesa.capacidadeMin,
            capacidadeMax: mesa.capacidadeMax,
            posX: mesa.posX,
            posY: mesa.posY,
            largura: mesa.largura,
            altura: mesa.altura,
          });
        }),
      );
      setPendentes(new Set());
      onAlterado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar as alteracoes. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="canvas-paleta">
        {(Object.keys(TAMANHO_PADRAO) as MesaFormato[]).map((formato) => (
          <div
            key={formato}
            className="canvas-paleta-item"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("formato", formato)}
          >
            <span className={`canvas-paleta-forma ${formato}`} aria-hidden="true" />
            {LABEL_FORMATO[formato]}
          </div>
        ))}
        <p className="texto-secundario" style={{ fontSize: "0.8rem", alignSelf: "center", margin: 0 }}>
          Arraste uma mesa pro canvas pra adicionar
        </p>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="canvas-editor">
        <SalaoCanvasSvg
          mesas={mesasLocais}
          modo="edicao"
          mesaSelecionadaId={mesaEditandoId}
          onSelecionarMesa={setMesaEditandoId}
          onMoverMesa={(id, posX, posY) => atualizarMesaLocal(id, { posX, posY })}
          onRedimensionarMesa={(id, largura, altura) => atualizarMesaLocal(id, { largura, altura })}
          onSoltarNovaMesa={soltarNovaMesa}
        />

        {mesaEditando ? (
          <div className="canvas-painel-lateral">
            <h4 style={{ margin: 0 }}>Editar mesa</h4>
            <label>
              Nome
              <input
                value={mesaEditando.nome}
                onChange={(e) => atualizarMesaLocal(mesaEditando.id, { nome: e.target.value })}
              />
            </label>
            <label>
              Capacidade minima
              <input
                type="number"
                min={1}
                value={mesaEditando.capacidadeMin}
                onChange={(e) => atualizarMesaLocal(mesaEditando.id, { capacidadeMin: Number(e.target.value) })}
              />
            </label>
            <label>
              Capacidade maxima
              <input
                type="number"
                min={1}
                value={mesaEditando.capacidadeMax}
                onChange={(e) => atualizarMesaLocal(mesaEditando.id, { capacidadeMax: Number(e.target.value) })}
              />
            </label>
            <div className="acoes">
              <button className="btn btn-perigo" type="button" onClick={() => excluir(mesaEditando.id)}>
                Excluir mesa
              </button>
              <button className="btn btn-secundario" type="button" onClick={() => setMesaEditandoId(null)}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div className="canvas-painel-lateral">
            <p className="texto-secundario" style={{ margin: 0, fontSize: "0.85rem" }}>
              Clique numa mesa pra editar o nome e a capacidade, ou arraste pra reposicionar. Use a alça no canto pra
              redimensionar.
            </p>
          </div>
        )}
      </div>

      <div className="canvas-status-salvar">
        <button className="btn" type="button" onClick={salvar} disabled={salvando || pendentes.size === 0}>
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
        <span className="texto-secundario" style={{ fontSize: "0.85rem" }}>
          {pendentes.size === 0 ? "Tudo salvo" : `${pendentes.size} alteração(ões) não salva(s)`}
        </span>
      </div>
    </div>
  );
}
