import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api/client.js";
import {
  atualizarElementoSalao,
  atualizarMesa,
  criarElementoSalao,
  criarMesa,
  excluirElementoSalao,
  excluirMesa,
} from "../../api/resources.js";
import type { Mesa, MesaFormato, SalaoElemento, TipoElementoSalao } from "../../types.js";
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

// Tamanho/capacidade padrao pro primeiro drop de cada tipo de elemento decorativo.
const DIMS_ELEMENTO: Record<TipoElementoSalao, { largura: number; altura: number; capacidade?: number }> = {
  parede: { largura: 160, altura: 14 },
  porta: { largura: 50, altura: 44 },
  janela: { largura: 60, altura: 14 },
  planta: { largura: 60, altura: 60 },
  balcao: { largura: 220, altura: 50, capacidade: 6 },
  banheiro: { largura: 140, altura: 110 },
  cozinha: { largura: 160, altura: 140 },
  cadeira: { largura: 26, altura: 26 },
};

// Nome padrao ao criar - sem numeracao (diferente de mesa), o dono renomeia se quiser.
const LABEL_ELEMENTO: Record<TipoElementoSalao, string> = {
  parede: "Parede",
  porta: "Porta",
  janela: "Janela",
  planta: "Planta",
  balcao: "Bar",
  banheiro: "Banheiro",
  cozinha: "Cozinha",
  cadeira: "Cadeira",
};

// So parede/balcao/janela fazem sentido girar 90 graus (objetos "compridos").
const TIPOS_GIRAVEIS: TipoElementoSalao[] = ["parede", "balcao", "janela"];

const PALETA_ELEMENTOS: TipoElementoSalao[] = ["cadeira", "balcao", "parede", "porta", "janela", "planta", "banheiro", "cozinha"];

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

type Selecionado = { tipo: "mesa"; id: string } | { tipo: "elemento"; id: string } | null;

interface SalaoCanvasEditorProps {
  unidadeId: string;
  salaoId: string;
  mesasDoSalao: Mesa[];
  elementosDoSalao: SalaoElemento[];
  onAlterado: () => void;
}

export function SalaoCanvasEditor({ unidadeId, salaoId, mesasDoSalao, elementosDoSalao, onAlterado }: SalaoCanvasEditorProps) {
  const [mesasLocais, setMesasLocais] = useState<MesaCanvas[]>([]);
  const [elementosLocais, setElementosLocais] = useState<SalaoElemento[]>([]);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [selecionado, setSelecionado] = useState<Selecionado>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // onAlterado dispara um recarregamento a cada criar/duplicar/excluir - inclusive de
    // OUTRO item que nao o que o dono esta editando agora. Uma mesa com edicao local
    // ainda pendente (arrastada/renomeada mas nao salva) NAO pode ser sobrescrita por
    // esse recarregamento, ou a proxima "Salvar alterações" perderia essa edicao sem o
    // dono perceber. Preserva o valor local pra qualquer id que ainda esteja pendente.
    setMesasLocais((atual) => {
      const porId = new Map(atual.map((m) => [m.id, m]));
      return mesasDoSalao.map((mesa, indice) => {
        const local = porId.get(mesa.id);
        if (local && pendentes.has(`mesa:${mesa.id}`)) return local;
        return paraMesaCanvas(mesa, indice);
      });
    });
    // Mesas sem posicao salva ja entram como pendentes - assim um "Salvar" sem
    // nenhum arraste ainda persiste a posicao padrao calculada acima (evita que ela
    // "pule" de lugar a cada recarregamento, ja que o calculo depende do indice).
    const semPosicaoSalva = mesasDoSalao.filter((m) => m.posX == null || m.posY == null).map((m) => `mesa:${m.id}`);
    if (semPosicaoSalva.length > 0) {
      setPendentes((atual) => new Set([...atual, ...semPosicaoSalva]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesasDoSalao]);

  useEffect(() => {
    // Mesmo raciocinio do efeito de mesas acima: preserva elementos com edicao local
    // pendente em vez de sobrescrever com o valor (desatualizado) do servidor.
    setElementosLocais((atual) => {
      const porId = new Map(atual.map((e) => [e.id, e]));
      return elementosDoSalao.map((elemento) => {
        const local = porId.get(elemento.id);
        if (local && pendentes.has(`elem:${elemento.id}`)) return local;
        return elemento;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementosDoSalao]);

  const mesaEditando = useMemo(
    () => (selecionado?.tipo === "mesa" ? (mesasLocais.find((m) => m.id === selecionado.id) ?? null) : null),
    [mesasLocais, selecionado],
  );
  const elementoEditando = useMemo(
    () => (selecionado?.tipo === "elemento" ? (elementosLocais.find((e) => e.id === selecionado.id) ?? null) : null),
    [elementosLocais, selecionado],
  );

  function atualizarMesaLocal(id: string, patch: Partial<MesaCanvas>) {
    setMesasLocais((lista) => lista.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setPendentes((atual) => new Set(atual).add(`mesa:${id}`));
  }

  function atualizarElementoLocal(id: string, patch: Partial<SalaoElemento>) {
    setElementosLocais((lista) => lista.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setPendentes((atual) => new Set(atual).add(`elem:${id}`));
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
      setSelecionado({ tipo: "mesa", id: mesa.id });
      onAlterado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel adicionar a mesa.");
    }
  }

  async function soltarNovoElemento(tipo: TipoElementoSalao, x: number, y: number) {
    setErro(null);
    const dims = DIMS_ELEMENTO[tipo];
    try {
      const elemento = await criarElementoSalao(unidadeId, {
        salaoId,
        tipo,
        nome: LABEL_ELEMENTO[tipo],
        posX: x - dims.largura / 2,
        posY: y - dims.altura / 2,
        largura: dims.largura,
        altura: dims.altura,
        capacidade: dims.capacidade,
      });
      setElementosLocais((lista) => [...lista, elemento]);
      setSelecionado({ tipo: "elemento", id: elemento.id });
      onAlterado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel adicionar o elemento.");
    }
  }

  async function excluirSelecionado() {
    if (!selecionado) return;
    setErro(null);
    if (selecionado.tipo === "mesa") {
      const mesa = mesasLocais.find((m) => m.id === selecionado.id);
      if (!mesa) return;
      if (!confirm(`Remover a mesa "${mesa.nome}"? Essa acao nao pode ser desfeita.`)) return;
      try {
        await excluirMesa(unidadeId, mesa.id);
        setMesasLocais((lista) => lista.filter((m) => m.id !== mesa.id));
        setPendentes((atual) => {
          const novo = new Set(atual);
          novo.delete(`mesa:${mesa.id}`);
          return novo;
        });
        setSelecionado(null);
        onAlterado();
      } catch (err) {
        setErro(err instanceof ApiError ? err.message : "Nao foi possivel remover a mesa.");
      }
    } else {
      const elemento = elementosLocais.find((e) => e.id === selecionado.id);
      if (!elemento) return;
      if (!confirm(`Remover "${elemento.nome}"? Essa acao nao pode ser desfeita.`)) return;
      try {
        await excluirElementoSalao(unidadeId, elemento.id);
        setElementosLocais((lista) => lista.filter((e) => e.id !== elemento.id));
        setPendentes((atual) => {
          const novo = new Set(atual);
          novo.delete(`elem:${elemento.id}`);
          return novo;
        });
        setSelecionado(null);
        onAlterado();
      } catch (err) {
        setErro(err instanceof ApiError ? err.message : "Nao foi possivel remover o elemento.");
      }
    }
  }

  async function duplicarSelecionado() {
    if (!selecionado) return;
    setErro(null);
    try {
      if (selecionado.tipo === "mesa") {
        const mesa = mesasLocais.find((m) => m.id === selecionado.id);
        if (!mesa) return;
        const nova = await criarMesa(unidadeId, {
          salaoId,
          nome: `${mesa.nome} (cópia)`,
          capacidadeMin: mesa.capacidadeMin,
          capacidadeMax: mesa.capacidadeMax,
          formato: mesa.formato,
          posX: mesa.posX + 20,
          posY: mesa.posY + 20,
          largura: mesa.largura,
          altura: mesa.altura,
        });
        setMesasLocais((lista) => [...lista, paraMesaCanvas(nova, lista.length)]);
        setSelecionado({ tipo: "mesa", id: nova.id });
      } else {
        const elemento = elementosLocais.find((e) => e.id === selecionado.id);
        if (!elemento) return;
        const novo = await criarElementoSalao(unidadeId, {
          salaoId,
          tipo: elemento.tipo,
          nome: elemento.nome,
          posX: elemento.posX + 20,
          posY: elemento.posY + 20,
          largura: elemento.largura,
          altura: elemento.altura,
          rotacao: elemento.rotacao,
          capacidade: elemento.capacidade ?? undefined,
        });
        setElementosLocais((lista) => [...lista, novo]);
        setSelecionado({ tipo: "elemento", id: novo.id });
      }
      onAlterado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel duplicar.");
    }
  }

  function girarSelecionado() {
    if (selecionado?.tipo !== "elemento") return;
    const id = selecionado.id;
    setElementosLocais((lista) => lista.map((e) => (e.id === id ? { ...e, rotacao: e.rotacao === 0 ? 90 : 0 } : e)));
    setPendentes((atual) => new Set(atual).add(`elem:${id}`));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await Promise.all(
        [...pendentes].map((chave) => {
          const [prefixo, id] = chave.split(":");
          if (prefixo === "mesa") {
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
          }
          const elemento = elementosLocais.find((e) => e.id === id);
          if (!elemento) return Promise.resolve();
          return atualizarElementoSalao(unidadeId, id, {
            nome: elemento.nome,
            posX: elemento.posX,
            posY: elemento.posY,
            largura: elemento.largura,
            altura: elemento.altura,
            rotacao: elemento.rotacao,
            capacidade: elemento.capacidade ?? undefined,
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
            onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "mesa", formato }))}
          >
            <span className="canvas-paleta-icone">
              <span className={`canvas-paleta-forma ${formato}`} aria-hidden="true" />
            </span>
            Mesa {LABEL_FORMATO[formato].toLowerCase()}
          </div>
        ))}
        {PALETA_ELEMENTOS.map((tipo) => (
          <div
            key={tipo}
            className="canvas-paleta-item"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "elemento", tipo }))}
          >
            <span className="canvas-paleta-icone">
              <span className={`canvas-paleta-${tipo === "banheiro" || tipo === "cozinha" ? "servico" : tipo}`} aria-hidden="true" />
            </span>
            {LABEL_ELEMENTO[tipo]}
          </div>
        ))}
      </div>
      <p className="texto-secundario" style={{ fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
        Arraste um objeto pro canvas pra adicionar
      </p>

      {erro && <p className="erro">{erro}</p>}

      <div className="canvas-editor">
        <SalaoCanvasSvg
          mesas={mesasLocais}
          elementos={elementosLocais}
          modo="edicao"
          mesaSelecionadaId={selecionado?.tipo === "mesa" ? selecionado.id : null}
          elementoSelecionadoId={selecionado?.tipo === "elemento" ? selecionado.id : null}
          onSelecionarMesa={(id) => setSelecionado({ tipo: "mesa", id })}
          onSelecionarElemento={(id) => setSelecionado({ tipo: "elemento", id })}
          onMoverMesa={(id, posX, posY) => atualizarMesaLocal(id, { posX, posY })}
          onMoverElemento={(id, posX, posY) => atualizarElementoLocal(id, { posX, posY })}
          onRedimensionarMesa={(id, largura, altura) => atualizarMesaLocal(id, { largura, altura })}
          onRedimensionarElemento={(id, largura, altura) => atualizarElementoLocal(id, { largura, altura })}
          onSoltarNovaMesa={soltarNovaMesa}
          onSoltarNovoElemento={soltarNovoElemento}
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
            <button className="btn btn-secundario" type="button" onClick={duplicarSelecionado}>
              Duplicar
            </button>
            <div className="acoes">
              <button className="btn btn-perigo" type="button" onClick={excluirSelecionado}>
                Excluir mesa
              </button>
              <button className="btn btn-secundario" type="button" onClick={() => setSelecionado(null)}>
                Fechar
              </button>
            </div>
          </div>
        ) : elementoEditando ? (
          <div className="canvas-painel-lateral">
            <h4 style={{ margin: 0 }}>Editar {LABEL_ELEMENTO[elementoEditando.tipo].toLowerCase()}</h4>
            <label>
              Nome
              <input
                value={elementoEditando.nome}
                onChange={(e) => atualizarElementoLocal(elementoEditando.id, { nome: e.target.value })}
              />
            </label>
            {elementoEditando.tipo === "balcao" && (
              <label>
                Banquetas
                <input
                  type="number"
                  min={1}
                  value={elementoEditando.capacidade ?? 6}
                  onChange={(e) => atualizarElementoLocal(elementoEditando.id, { capacidade: Number(e.target.value) })}
                />
              </label>
            )}
            {TIPOS_GIRAVEIS.includes(elementoEditando.tipo) && (
              <button className="btn btn-secundario" type="button" onClick={girarSelecionado}>
                Girar 90°
              </button>
            )}
            <button className="btn btn-secundario" type="button" onClick={duplicarSelecionado}>
              Duplicar
            </button>
            <div className="acoes">
              <button className="btn btn-perigo" type="button" onClick={excluirSelecionado}>
                Excluir
              </button>
              <button className="btn btn-secundario" type="button" onClick={() => setSelecionado(null)}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div className="canvas-painel-lateral">
            <p className="texto-secundario" style={{ margin: 0, fontSize: "0.85rem" }}>
              Clique num objeto pra editar o nome (e capacidade/rotacao quando fizer sentido), ou arraste pra reposicionar.
              Use a alça no canto/borda pra redimensionar.
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
