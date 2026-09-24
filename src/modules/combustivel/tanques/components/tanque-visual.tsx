import { Droplet, Fuel } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { percentualDoNivel } from "@/modules/combustivel/tanques/calculo";
import { corDoCombustivel, formatarCapacidade } from "@/modules/combustivel/tanques/visual";

export interface TanqueVisualProps {
  /** Id do tanque: deixa únicos os ids do gradiente e do recorte do SVG. */
  id: string;
  nome: string;
  apelido?: string | null;
  capacidade: number;
  nivel: number;
  /** Combustível corrente. Null = vazio. */
  combustivelNome?: string | null;
  /** Nome, apelido e selo do combustível acima da cápsula. O detalhe já tem título. */
  comCabecalho?: boolean;
  className?: string;
}

// Geometria da origem: viewBox 320x140, espaço à esquerda para a escala.
const W = 320;
const H = 140;
const PADX = 36;
const PADY = 18;
const TANK_X = PADX;
const TANK_Y = PADY;
const TANK_W = W - PADX - 14;
const TANK_H = H - PADY * 2;

/**
 * Tanque deitado (a cápsula do Gestão Obras): o líquido fica ancorado no fundo e
 * sobe com o nível, na cor do combustível. Tanque de terceiro não passa por aqui
 * (não tem estoque).
 *
 * Diferenças da origem, todas por causa do dado do ERP:
 * - O número no centro é o nível REAL. A origem cortava o nível na capacidade, e
 *   aqui a capacidade pode ser 0 (sem trava) ou ter sido reduzida depois da
 *   entrada: cortar mostraria "0,00 L" num tanque com diesel.
 * - Tema claro: o texto branco da origem some sobre o casco vazio. O texto sai em
 *   duas camadas, escuro por baixo e branco recortado pelo líquido, então cada
 *   pedaço da letra contrasta com o que está atrás dela.
 */
export function TanqueVisual({
  id,
  nome,
  apelido,
  capacidade,
  nivel,
  combustivelNome,
  comCabecalho = true,
  className,
}: TanqueVisualProps) {
  const cap = Math.max(capacidade, 0);
  const temCapacidade = cap > 0;
  const percentual = percentualDoNivel(nivel, cap) ?? 0;
  const vazio = nivel <= 0;
  const cor = corDoCombustivel(vazio ? null : combustivelNome);

  // Sem capacidade não há régua: o casco aparece cheio se houver combustível.
  const fracao = temCapacidade ? percentual / 100 : vazio ? 0 : 1;
  const fillH = TANK_H * fracao;
  const fluidY = TANK_Y + TANK_H - fillH;
  const idBase = `tanque-${id.replace(/\W/g, "")}`;
  const idGradiente = `${idBase}-grad`;
  const idCasco = `${idBase}-casco`;
  const idLiquido = `${idBase}-liquido`;

  const textoNivel = formatarLitros(nivel);
  const textoPercentual = temCapacidade
    ? `${Math.round(percentual).toLocaleString("pt-BR")}% de ${formatarCapacidade(cap)} L`
    : "sem capacidade cadastrada";

  const textos = (claro: boolean) => (
    <g fontFamily="ui-sans-serif, system-ui" textAnchor="middle">
      <text
        x={W / 2}
        y={TANK_Y + TANK_H / 2 - 4}
        fontSize="22"
        fontWeight="700"
        fill={claro ? "#ffffff" : "var(--foreground)"}
        stroke={claro ? "rgba(0,0,0,0.25)" : "none"}
        strokeWidth="0.8"
        style={{ paintOrder: "stroke fill" }}
      >
        {textoNivel}
      </text>
      <text
        x={W / 2}
        y={TANK_Y + TANK_H / 2 + 16}
        fontSize="12"
        fontWeight="600"
        fill={claro ? "rgba(255,255,255,0.92)" : "var(--muted-foreground)"}
      >
        {textoPercentual}
      </text>
    </g>
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {comCabecalho ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{nome}</h3>
            {apelido ? <p className="truncate text-legenda text-muted-foreground">{apelido}</p> : null}
          </div>
          <SeloCombustivel nome={combustivelNome} vazio={vazio} />
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Tanque ${nome}: ${textoNivel}${temCapacidade ? ` de ${formatarCapacidade(cap)} L` : ""}`}
      >
        <defs>
          <linearGradient id={idGradiente} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={cor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={cor} stopOpacity="1" />
          </linearGradient>
          <clipPath id={idCasco}>
            <rect x={TANK_X} y={TANK_Y} width={TANK_W} height={TANK_H} rx={TANK_H / 2} />
          </clipPath>
          <clipPath id={idLiquido}>
            <rect x={TANK_X} y={fluidY} width={TANK_W} height={fillH} />
          </clipPath>
        </defs>

        {/* Casco */}
        <rect
          x={TANK_X}
          y={TANK_Y}
          width={TANK_W}
          height={TANK_H}
          rx={TANK_H / 2}
          fill="var(--muted)"
          stroke="var(--border)"
          strokeWidth="1.5"
        />

        {/* Líquido, recortado pelo casco e ancorado no fundo */}
        {fillH > 0 ? (
          <g clipPath={`url(#${idCasco})`}>
            <rect x={TANK_X} y={fluidY} width={TANK_W} height={fillH} fill={`url(#${idGradiente})`} />
            {/* Menisco: banda fina no topo do líquido */}
            <rect x={TANK_X} y={fluidY} width={TANK_W} height={Math.min(3, fillH)} fill={cor} opacity="0.35" />
          </g>
        ) : null}

        {/* Escala à esquerda: capacidade no topo, metade, 0 na base */}
        {temCapacidade ? (
          <>
            <g fontSize="9" fontFamily="ui-monospace, monospace" fill="var(--muted-foreground)" textAnchor="end">
              <text x={TANK_X - 6} y={TANK_Y + TANK_H + 3}>
                0
              </text>
              <text x={TANK_X - 6} y={TANK_Y + TANK_H / 2 + 3}>
                {formatarCapacidade(Math.round(cap / 2))}
              </text>
              <text x={TANK_X - 6} y={TANK_Y + 8}>
                {formatarCapacidade(cap)}
              </text>
            </g>
            <g stroke="var(--border)" strokeWidth="1">
              <line x1={TANK_X} y1={TANK_Y + TANK_H} x2={TANK_X - 3} y2={TANK_Y + TANK_H} />
              <line x1={TANK_X} y1={TANK_Y + TANK_H / 2} x2={TANK_X - 3} y2={TANK_Y + TANK_H / 2} />
              <line x1={TANK_X} y1={TANK_Y} x2={TANK_X - 3} y2={TANK_Y} />
            </g>
          </>
        ) : null}

        {/* Litros e percentual: escuro no casco, branco onde há líquido */}
        {textos(false)}
        {fillH > 0 ? (
          <g clipPath={`url(#${idLiquido})`} aria-hidden="true">
            {textos(true)}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/** Selo do combustível atual, na cor dele; "Vazio" quando não há nível. */
export function SeloCombustivel({ nome, vazio }: { nome: string | null | undefined; vazio: boolean }) {
  if (vazio || !nome) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        <Droplet className="size-3" aria-hidden="true" />
        {vazio ? "Vazio" : "Sem combustível"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex max-w-[60%] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase"
      style={{ backgroundColor: corDoCombustivel(nome) }}
    >
      <Fuel className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{nome}</span>
    </span>
  );
}
