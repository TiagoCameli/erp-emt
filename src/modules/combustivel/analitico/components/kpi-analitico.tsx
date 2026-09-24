import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { KPICard } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { temPontosDeTendencia } from "@/modules/combustivel/analitico/calculo";
import { leituraDaTendencia } from "@/modules/combustivel/analitico/formato";
import { Sparkline } from "@/modules/combustivel/analitico/components/ranking";

export interface KpiAnaliticoProps {
  titulo: string;
  valor: ReactNode;
  /** O "hint" da origem, abaixo do número. */
  detalhe?: string;
  /** Variação % contra o período anterior de mesma duração. */
  delta?: number;
  /** Texto no lugar do % (base anterior pequena: "+2"). Sempre neutro. */
  diferenca?: string;
  /** Custo: subir é ruim (chip em cor de estado). Volume e contagens: neutro. */
  altaRuim?: boolean;
  /** Série diária para a mini tendência (some com menos de 4 dias com valor). */
  serie?: number[];
  /** Como o número é calculado (o `tooltip` da origem, no hover). */
  explicacao?: string;
  /** Sem dado no período: mostra o aviso no lugar do número. */
  vazio?: boolean;
}

/**
 * O KpiCard da origem montado no KPICard canônico do ERP (faixa âmbar, tipografia do
 * tema). Leva o chip de tendência e a mini série da origem no rodapé do cartão.
 */
export function KpiAnalitico({
  titulo,
  valor,
  detalhe,
  delta,
  diferenca,
  altaRuim = false,
  serie,
  explicacao,
  vazio = false,
}: KpiAnaliticoProps) {
  return (
    <div title={explicacao} className="flex">
      <KPICard
        className="w-full"
        titulo={titulo}
        valor={vazio ? <span className="text-detalhe font-normal italic text-muted-foreground">Sem dado no período</span> : valor}
        detalhe={
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{vazio ? "" : detalhe}</span>
            <span className="flex shrink-0 items-center gap-2">
              {!vazio && serie && temPontosDeTendencia(serie) ? <Sparkline serie={serie} largura={60} altura={20} /> : null}
              {!vazio ? <ChipTendencia delta={delta} diferenca={diferenca} altaRuim={altaRuim} /> : null}
            </span>
          </span>
        }
      />
    </div>
  );
}

const NEUTRO = "bg-muted text-muted-foreground";

/** Chip "+12,5%" da origem: ícone e sinal carregam a direção; cor só quando subir é ruim. */
export function ChipTendencia({ delta, diferenca, altaRuim }: { delta?: number; diferenca?: string; altaRuim: boolean }) {
  if (diferenca) {
    return (
      <span
        className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-legenda font-semibold tabular-nums", NEUTRO)}
        aria-label={`${diferenca} vs período anterior`}
      >
        {diferenca}
      </span>
    );
  }
  if (typeof delta !== "number") return null;
  const { direcao, texto } = leituraDaTendencia(delta);
  const Icone = direcao === "alta" ? TrendingUp : direcao === "queda" ? TrendingDown : Minus;
  const cor =
    !altaRuim || direcao === "estavel"
      ? NEUTRO
      : direcao === "alta"
        ? "bg-status-rejeitado/10 text-status-rejeitado"
        : "bg-status-aprovado/10 text-status-aprovado";
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-legenda font-semibold tabular-nums", cor)}
      aria-label={`${texto} vs período anterior`}
    >
      <Icone className="size-3" strokeWidth={2.5} aria-hidden="true" />
      {texto}
    </span>
  );
}
