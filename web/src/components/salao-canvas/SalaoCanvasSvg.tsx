import { useRef, type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent } from "react";
import type { MesaFormato } from "../../types.js";
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

interface SalaoCanvasSvgProps {
  mesas: MesaCanvas[];
  // "edicao": dono arrasta/redimensiona/solta mesas novas da paleta (TablesPage).
  // "selecao": cliente so pode clicar numa mesa disponivel pra escolhe-la (Parte 2,
  // pagina publica) - nada e arrastavel.
  modo: "edicao" | "selecao";
  mesaSelecionadaId?: string | null;
  mesasIndisponiveisIds?: Set<string>;
  onSelecionarMesa?: (id: string) => void;
  onMoverMesa?: (id: string, posX: number, posY: number) => void;
  onRedimensionarMesa?: (id: string, largura: number, altura: number) => void;
  onSoltarNovaMesa?: (formato: MesaFormato, posX: number, posY: number) => void;
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

interface ArrasteAtual {
  tipo: "mover" | "redimensionar";
  mesaId: string;
  inicioPonteiro: { x: number; y: number };
  inicioMesa: { posX: number; posY: number; largura: number; altura: number };
}

const TAMANHO_MIN_MESA = 40;

export function SalaoCanvasSvg({
  mesas,
  modo,
  mesaSelecionadaId,
  mesasIndisponiveisIds,
  onSelecionarMesa,
  onMoverMesa,
  onRedimensionarMesa,
  onSoltarNovaMesa,
}: SalaoCanvasSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const arraste = useRef<ArrasteAtual | null>(null);

  function iniciarArraste(e: ReactPointerEvent, mesa: MesaCanvas, tipo: "mover" | "redimensionar") {
    if (modo !== "edicao") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const svg = svgRef.current;
    if (!svg) return;
    arraste.current = {
      tipo,
      mesaId: mesa.id,
      inicioPonteiro: pontoNoCanvas(svg, e.clientX, e.clientY),
      inicioMesa: { posX: mesa.posX, posY: mesa.posY, largura: mesa.largura, altura: mesa.altura },
    };
  }

  function moverPonteiro(e: ReactPointerEvent<SVGSVGElement>) {
    const atual = arraste.current;
    if (!atual || !svgRef.current) return;
    const ponto = pontoNoCanvas(svgRef.current, e.clientX, e.clientY);
    const dx = ponto.x - atual.inicioPonteiro.x;
    const dy = ponto.y - atual.inicioPonteiro.y;

    if (atual.tipo === "mover") {
      onMoverMesa?.(atual.mesaId, atual.inicioMesa.posX + dx, atual.inicioMesa.posY + dy);
    } else {
      onRedimensionarMesa?.(
        atual.mesaId,
        Math.max(TAMANHO_MIN_MESA, atual.inicioMesa.largura + dx),
        Math.max(TAMANHO_MIN_MESA, atual.inicioMesa.altura + dy),
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
    if (modo !== "edicao" || !onSoltarNovaMesa) return;
    const formato = e.dataTransfer.getData("formato") as MesaFormato;
    if (!formato || !svgRef.current) return;
    e.preventDefault();
    const ponto = pontoNoCanvas(svgRef.current, e.clientX, e.clientY);
    onSoltarNovaMesa(formato, ponto.x, ponto.y);
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
            onPointerDown={(e) => iniciarArraste(e, mesa, "mover")}
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
                onPointerDown={(e) => iniciarArraste(e, mesa, "redimensionar")}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
