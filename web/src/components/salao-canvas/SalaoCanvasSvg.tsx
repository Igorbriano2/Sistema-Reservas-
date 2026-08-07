import { useRef, type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent } from "react";
import type { MesaFormato, TipoElementoSalao } from "../../types.js";
import "./salao-canvas.css";

// Unidades do canvas (nao pixels de tela) - o mesmo viewBox e reaproveitado pela
// pagina publica na Parte 2, entao posicoes salvas aqui continuam validas la.
export const CANVAS_LARGURA = 1000;
export const CANVAS_ALTURA = 640;

export interface MesaCanvas {
  id: string;
  nome: string;
  capacidadeMin: number;
  capacidadeMax: number;
  formato: MesaFormato;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
}

// Objetos decorativos/estruturais (parede, porta, janela, planta, balcao, banheiro,
// cozinha, cadeira avulsa) - nunca reservaveis, so compoem o desenho do salao.
export interface ElementoCanvas {
  id: string;
  tipo: TipoElementoSalao;
  nome: string;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
  rotacao: number;
  capacidade: number | null;
}

type PayloadPaleta = { kind: "mesa"; formato: MesaFormato } | { kind: "elemento"; tipo: TipoElementoSalao };

interface SalaoCanvasSvgProps {
  mesas: MesaCanvas[];
  elementos: ElementoCanvas[];
  // "edicao": dono arrasta/redimensiona/solta mesas novas da paleta (TablesPage).
  // "selecao": cliente so pode clicar numa mesa disponivel pra escolhe-la (Parte 2,
  // pagina publica) - elementos so aparecem como cenario, nunca sao interativos.
  modo: "edicao" | "selecao";
  mesaSelecionadaId?: string | null;
  elementoSelecionadoId?: string | null;
  mesasIndisponiveisIds?: Set<string>;
  onSelecionarMesa?: (id: string) => void;
  onSelecionarElemento?: (id: string) => void;
  onMoverMesa?: (id: string, posX: number, posY: number) => void;
  onMoverElemento?: (id: string, posX: number, posY: number) => void;
  onRedimensionarMesa?: (id: string, largura: number, altura: number) => void;
  onRedimensionarElemento?: (id: string, largura: number, altura: number) => void;
  onSoltarNovaMesa?: (formato: MesaFormato, posX: number, posY: number) => void;
  onSoltarNovoElemento?: (tipo: TipoElementoSalao, posX: number, posY: number) => void;
}

function pontoNoCanvas(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ponto = svg.createSVGPoint();
  ponto.x = clientX;
  ponto.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformado = ponto.matrixTransform(ctm.inverse());
  return { x: transformado.x, y: transformado.y };
}

// Cadeiras sao so decorativas (nunca clicaveis/selecionaveis) - distribuidas
// igualmente numa elipse ao redor da mesa, independente do formato dela.
function posicoesDasCadeiras(cx: number, cy: number, raioX: number, raioY: number, quantidade: number) {
  const posicoes: { x: number; y: number }[] = [];
  for (let i = 0; i < quantidade; i++) {
    const angulo = (i / quantidade) * Math.PI * 2 - Math.PI / 2;
    posicoes.push({ x: cx + Math.cos(angulo) * raioX, y: cy + Math.sin(angulo) * raioY });
  }
  return posicoes;
}

// Banquetas do balcao, em linha reta ao longo da borda inferior.
function posicoesDasBanquetas(largura: number, altura: number, quantidade: number) {
  const posicoes: { x: number; y: number }[] = [];
  for (let i = 0; i < quantidade; i++) {
    posicoes.push({ x: ((i + 0.5) / quantidade) * largura, y: altura + 11 });
  }
  return posicoes;
}

// Folhas da planta, derivadas deterministicamente do id (mesma planta sempre desenha
// igual, sem precisar guardar coluna extra no banco pra isso).
function folhasDaPlanta(id: string, largura: number, altura: number) {
  let semente = 0;
  for (let i = 0; i < id.length; i++) semente = (semente * 31 + id.charCodeAt(i)) >>> 0;
  const proximo = () => {
    semente = (semente * 1103515245 + 12345) >>> 0;
    return (semente % 10000) / 10000;
  };
  const quantidade = 3 + Math.floor(proximo() * 2);
  const folhas: { cx: number; cy: number; r: number; clara: boolean }[] = [];
  for (let i = 0; i < quantidade; i++) {
    folhas.push({
      cx: largura * 0.3 + proximo() * largura * 0.4,
      cy: altura * 0.3 + proximo() * altura * 0.4,
      r: 9 + proximo() * 6,
      clara: i % 2 === 0,
    });
  }
  return folhas;
}

interface ItemArrastavel {
  id: string;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
}

interface ArrasteAtual {
  tipo: "mover" | "redimensionar";
  alvo: "mesa" | "elemento";
  itemId: string;
  inicioPonteiro: { x: number; y: number };
  inicioItem: { posX: number; posY: number; largura: number; altura: number };
}

const TAMANHO_MIN_MESA = 40;
const LARGURA_MIN_ELEMENTO = 30;

const TIPOS_REDIMENSIONAVEIS: TipoElementoSalao[] = ["parede", "balcao", "janela"];

export function SalaoCanvasSvg({
  mesas,
  elementos,
  modo,
  mesaSelecionadaId,
  elementoSelecionadoId,
  mesasIndisponiveisIds,
  onSelecionarMesa,
  onSelecionarElemento,
  onMoverMesa,
  onMoverElemento,
  onRedimensionarMesa,
  onRedimensionarElemento,
  onSoltarNovaMesa,
  onSoltarNovoElemento,
}: SalaoCanvasSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const arraste = useRef<ArrasteAtual | null>(null);

  function iniciarArraste(
    e: ReactPointerEvent,
    item: ItemArrastavel,
    tipoArraste: "mover" | "redimensionar",
    alvo: "mesa" | "elemento",
  ) {
    if (modo !== "edicao") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const svg = svgRef.current;
    if (!svg) return;
    arraste.current = {
      tipo: tipoArraste,
      alvo,
      itemId: item.id,
      inicioPonteiro: pontoNoCanvas(svg, e.clientX, e.clientY),
      inicioItem: { posX: item.posX, posY: item.posY, largura: item.largura, altura: item.altura },
    };
  }

  function moverPonteiro(e: ReactPointerEvent<SVGSVGElement>) {
    const atual = arraste.current;
    if (!atual || !svgRef.current) return;
    const ponto = pontoNoCanvas(svgRef.current, e.clientX, e.clientY);
    const dx = ponto.x - atual.inicioPonteiro.x;
    const dy = ponto.y - atual.inicioPonteiro.y;

    if (atual.tipo === "mover") {
      const novaPosX = atual.inicioItem.posX + dx;
      const novaPosY = atual.inicioItem.posY + dy;
      if (atual.alvo === "mesa") onMoverMesa?.(atual.itemId, novaPosX, novaPosY);
      else onMoverElemento?.(atual.itemId, novaPosX, novaPosY);
    } else if (atual.alvo === "mesa") {
      onRedimensionarMesa?.(
        atual.itemId,
        Math.max(TAMANHO_MIN_MESA, atual.inicioItem.largura + dx),
        Math.max(TAMANHO_MIN_MESA, atual.inicioItem.altura + dy),
      );
    } else {
      // Elementos redimensionaveis (parede/balcao/janela) so ajustam a largura -
      // a altura fica fixa no valor inicial.
      onRedimensionarElemento?.(
        atual.itemId,
        Math.max(LARGURA_MIN_ELEMENTO, atual.inicioItem.largura + dx),
        atual.inicioItem.altura,
      );
    }
  }

  function soltarPonteiro() {
    arraste.current = null;
  }

  function aoArrastarSobre(e: ReactDragEvent<SVGSVGElement>) {
    if (modo !== "edicao") return;
    e.preventDefault();
  }

  function aoSoltarNaPaleta(e: ReactDragEvent<SVGSVGElement>) {
    if (modo !== "edicao") return;
    const bruto = e.dataTransfer.getData("text/plain");
    if (!bruto || !svgRef.current) return;
    let payload: PayloadPaleta;
    try {
      payload = JSON.parse(bruto);
    } catch {
      return;
    }
    e.preventDefault();
    const ponto = pontoNoCanvas(svgRef.current, e.clientX, e.clientY);
    if (payload.kind === "mesa") onSoltarNovaMesa?.(payload.formato, ponto.x, ponto.y);
    else onSoltarNovoElemento?.(payload.tipo, ponto.x, ponto.y);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CANVAS_LARGURA} ${CANVAS_ALTURA}`}
      className="salao-canvas-svg"
      onPointerMove={moverPonteiro}
      onPointerUp={soltarPonteiro}
      onPointerLeave={soltarPonteiro}
      onDrop={aoSoltarNaPaleta}
      onDragOver={aoArrastarSobre}
    >
      <defs>
        <pattern id="grade-canvas" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" className="salao-canvas-grade-ponto" />
        </pattern>
      </defs>
      <rect width={CANVAS_LARGURA} height={CANVAS_ALTURA} fill="url(#grade-canvas)" />

      {elementos.map((el) => {
        const selecionado = elementoSelecionadoId === el.id;
        const cx = el.posX + el.largura / 2;
        const cy = el.posY + el.altura / 2;
        const podeRedimensionar = modo === "edicao" && TIPOS_REDIMENSIONAVEIS.includes(el.tipo);

        return (
          <g
            key={el.id}
            className={["elemento-canvas-grupo", `tipo-${el.tipo}`, selecionado ? "selecionada" : ""].filter(Boolean).join(" ")}
            transform={`rotate(${el.rotacao}, ${cx}, ${cy})`}
            onPointerDown={(e) => iniciarArraste(e, el, "mover", "elemento")}
            onClick={() => {
              if (modo === "edicao") onSelecionarElemento?.(el.id);
            }}
          >
            {el.tipo === "parede" && (
              <rect x={el.posX} y={el.posY} width={el.largura} height={el.altura} className="elemento-forma-parede" />
            )}

            {el.tipo === "porta" && (
              <>
                <path
                  d={`M ${el.posX} ${el.posY + el.altura} A ${el.altura} ${el.altura} 0 0 1 ${el.posX + el.altura} ${el.posY}`}
                  className="elemento-forma-porta-arco"
                />
                <line x1={el.posX} y1={el.posY + el.altura} x2={el.posX} y2={el.posY} className="elemento-forma-porta-folha" />
              </>
            )}

            {el.tipo === "janela" && (
              <>
                <rect x={el.posX} y={el.posY} width={el.largura} height={el.altura} className="elemento-forma-janela" />
                <line x1={cx} y1={el.posY} x2={cx} y2={el.posY + el.altura} className="elemento-forma-janela-linha" />
              </>
            )}

            {el.tipo === "planta" &&
              folhasDaPlanta(el.id, el.largura, el.altura).map((f, i) => (
                <circle
                  key={i}
                  cx={el.posX + f.cx}
                  cy={el.posY + f.cy}
                  r={f.r}
                  className={f.clara ? "elemento-forma-planta-folha-clara" : "elemento-forma-planta-folha-escura"}
                />
              ))}

            {el.tipo === "balcao" && (
              <>
                {posicoesDasBanquetas(el.largura, el.altura, el.capacidade ?? 6).map((p, i) => (
                  <circle key={i} cx={el.posX + p.x} cy={el.posY + p.y} r={7} className="elemento-forma-balcao-banqueta" />
                ))}
                <rect x={el.posX} y={el.posY} width={el.largura} height={el.altura} rx={4} className="elemento-forma-balcao" />
                <text x={cx} y={el.posY + 18} textAnchor="middle" className="elemento-texto-claro">
                  {el.nome}
                </text>
              </>
            )}

            {(el.tipo === "banheiro" || el.tipo === "cozinha") && (
              <>
                <rect x={el.posX} y={el.posY} width={el.largura} height={el.altura} rx={4} className="elemento-forma-zona" />
                {el.tipo === "banheiro" ? (
                  <>
                    <rect x={cx - 12} y={el.posY + 16} width={24} height={12} rx={2} className="elemento-forma-zona-icone" />
                    <rect x={cx - 15} y={el.posY + 30} width={30} height={22} rx={13} className="elemento-forma-zona-icone-claro" />
                  </>
                ) : (
                  <>
                    <rect x={cx - 28} y={cy - 28} width={56} height={56} rx={4} className="elemento-forma-zona-icone" />
                    <circle cx={cx - 14} cy={cy - 14} r={6} className="elemento-forma-zona-icone-claro" />
                    <circle cx={cx + 14} cy={cy - 14} r={6} className="elemento-forma-zona-icone-claro" />
                    <circle cx={cx - 14} cy={cy + 14} r={6} className="elemento-forma-zona-icone-claro" />
                    <circle cx={cx + 14} cy={cy + 14} r={6} className="elemento-forma-zona-icone-claro" />
                  </>
                )}
                <text x={cx} y={el.posY + el.altura - 10} textAnchor="middle" className="elemento-texto-escuro">
                  {el.nome}
                </text>
              </>
            )}

            {el.tipo === "cadeira" && (
              <rect x={el.posX} y={el.posY} width={el.largura} height={el.altura} rx={6} className="elemento-forma-cadeira" />
            )}

            {podeRedimensionar && (
              <rect
                x={el.posX + el.largura - 6}
                y={cy - 6}
                width={12}
                height={12}
                rx={3}
                className="elemento-canvas-alca-redimensionar"
                onPointerDown={(e) => iniciarArraste(e, el, "redimensionar", "elemento")}
              />
            )}

            {selecionado && (
              <rect
                x={el.posX - 4}
                y={el.posY - 4}
                width={el.largura + 8}
                height={el.altura + 8}
                rx={4}
                className="elemento-canvas-selecao"
              />
            )}
          </g>
        );
      })}

      {mesas.map((mesa) => {
        const indisponivel = mesasIndisponiveisIds?.has(mesa.id) ?? false;
        const selecionada = mesaSelecionadaId === mesa.id;
        const cx = mesa.posX + mesa.largura / 2;
        const cy = mesa.posY + mesa.altura / 2;
        const cadeiras = posicoesDasCadeiras(cx, cy, mesa.largura / 2 + 14, mesa.altura / 2 + 14, mesa.capacidadeMax);
        const clicavel = modo === "edicao" || !indisponivel;

        return (
          <g
            key={mesa.id}
            className={[
              "mesa-canvas-grupo",
              selecionada ? "selecionada" : "",
              indisponivel ? "indisponivel" : "",
              modo === "selecao" && !indisponivel ? "selecionavel" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(e) => iniciarArraste(e, mesa, "mover", "mesa")}
            onClick={() => {
              if (!clicavel) return;
              onSelecionarMesa?.(mesa.id);
            }}
          >
            {cadeiras.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={6} className="mesa-canvas-cadeira" />
            ))}
            {mesa.formato === "redonda" ? (
              <circle cx={cx} cy={cy} r={mesa.largura / 2} className="mesa-canvas-forma" />
            ) : (
              <rect x={mesa.posX} y={mesa.posY} width={mesa.largura} height={mesa.altura} rx={10} className="mesa-canvas-forma" />
            )}
            <text x={cx} y={cy - 3} textAnchor="middle" className="mesa-canvas-nome">
              {mesa.nome}
            </text>
            <text x={cx} y={cy + 13} textAnchor="middle" className="mesa-canvas-capacidade">
              {mesa.capacidadeMin}-{mesa.capacidadeMax}
            </text>
            {modo === "edicao" && (
              <rect
                x={mesa.posX + mesa.largura - 11}
                y={mesa.posY + mesa.altura - 11}
                width={16}
                height={16}
                rx={3}
                className="mesa-canvas-alca-redimensionar"
                onPointerDown={(e) => iniciarArraste(e, mesa, "redimensionar", "mesa")}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
