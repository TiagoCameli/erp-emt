import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { sparkVisivel } from "@/modules/combustivel/painel/calculo";

/**
 * O KpiCard da origem (v2/visao-geral/KpiCard) com as cores do ERP: ícone num círculo,
 * rótulo, número grande, sparkline do período e o chip de variação contra o período
 * anterior. A Faixa âmbar do KPICard canônico continua na borda esquerda.
 *
 * Regras do chip, as da origem:
 * - variação em pontos percentuais; entre -5 e +5 é ruído e fica cinza com "−";
 * - `inverter`: subir é ruim (custo, R$/L); `neutro`: subir não é bom nem ruim (volume);
 * - |Δ| acima de 200% aparece como "+200%+" (engana mais do que informa);
 * - `absoluto` substitui o % quando a base anterior é pequena (sempre cinza).
 */

export type VariacaoKpi =
  | { tipo: "percentual"; valor: number; inverter?: boolean; neutro?: boolean }
  | { tipo: "absoluto"; texto: string };

export type DestaqueKpi = "padrao" | "perigo" | "atencao" | "sucesso";

const CIRCULO: Record<DestaqueKpi, string> = {
  padrao: "bg-primary/10 text-primary",
  perigo: "bg-status-rejeitado/10 text-status-rejeitado",
  atencao: "bg-status-pendente/10 text-status-pendente",
  sucesso: "bg-status-aprovado/10 text-status-aprovado",
};

const CHIP_NEUTRO = "bg-muted text-muted-foreground";
const CHIP_BOM = "bg-status-aprovado/10 text-status-aprovado";
const CHIP_RUIM = "bg-status-rejeitado/10 text-status-rejeitado";

function porcentagemComSinal(valor: number): string {
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** O chip de tendência (texto, cor e ícone), puro para teste. */
export function chipDaVariacao(variacao: VariacaoKpi): { texto: string; classe: string; direcao: "sobe" | "desce" | "estavel" | null } {
  if (variacao.tipo === "absoluto") return { texto: variacao.texto, classe: CHIP_NEUTRO, direcao: null };
  const { valor, inverter = false, neutro = false } = variacao;
  const sobe = valor > 5;
  const desce = valor < -5;
  let classe = CHIP_NEUTRO;
  if (!neutro && sobe) classe = inverter ? CHIP_RUIM : CHIP_BOM;
  if (!neutro && desce) classe = inverter ? CHIP_BOM : CHIP_RUIM;
  const texto = valor > 200 ? "+200%+" : valor < -200 ? "−200%+" : porcentagemComSinal(valor);
  return { texto, classe, direcao: sobe ? "sobe" : desce ? "desce" : "estavel" };
}

/** A Sparkline da origem: SVG puro, 60×24, linha e área na cor da marca. */
export function Sparkline({ dados, largura = 60, altura = 24 }: { dados: readonly number[]; largura?: number; altura?: number }) {
  if (dados.length === 0) return null;
  const minimo = Math.min(...dados);
  const maximo = Math.max(...dados);
  const faixa = maximo - minimo || 1;
  const passo = dados.length > 1 ? largura / (dados.length - 1) : largura;
  const pontos = dados.map((v, i) => [i * passo, altura - ((v - minimo) / faixa) * altura] as const);
  const linha = pontos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const ultimoX = pontos[pontos.length - 1]![0];
  const area = `${linha} L${ultimoX.toFixed(1)},${altura} L0,${altura} Z`;
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} className="shrink-0" aria-hidden data-slot="sparkline">
      <path d={area} fill="var(--color-emt-verde-lavado)" stroke="none" />
      <path d={linha} fill="none" stroke="var(--color-emt-verde)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface CartaoKpiProps {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  variacao?: VariacaoKpi;
  spark?: readonly number[];
  icone?: ComponentType<{ className?: string }>;
  /** Como o número é calculado, no `title` (o tooltip da origem). */
  dica?: string;
  /** Sem dado no período: mostra o aviso no lugar do número e esconde chip e sparkline. */
  vazio?: boolean;
  href?: string;
  destaque?: DestaqueKpi;
}

export function CartaoKpi({
  titulo,
  valor,
  detalhe,
  variacao,
  spark,
  icone: Icone,
  dica,
  vazio = false,
  href,
  destaque = "padrao",
}: CartaoKpiProps) {
  const chip = variacao && !vazio ? chipDaVariacao(variacao) : null;
  const IconeChip = chip?.direcao === "sobe" ? TrendingUp : chip?.direcao === "desce" ? TrendingDown : chip?.direcao === "estavel" ? Minus : null;

  const conteudo = (
    <div
      title={dica}
      className={cn(
        // Sem `h-full` no item da grade: o stretch já iguala a altura (ver KPICard).
        "faixa-esquerda flex flex-col rounded-lg border border-border bg-card p-4",
        href && "h-full transition-colors hover:bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icone ? (
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", CIRCULO[destaque])}>
              <Icone className="size-4" />
            </div>
          ) : null}
          <p className="truncate text-legenda font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        </div>
        {spark && sparkVisivel(spark) && !vazio ? <Sparkline dados={spark} /> : null}
      </div>
      <div className="mt-3 flex min-h-9 items-baseline gap-2">
        {vazio ? (
          <span className="text-sm italic text-muted-foreground">Sem dado no período</span>
        ) : (
          <span className="truncate text-titulo font-semibold tabular-nums text-foreground">{valor}</span>
        )}
      </div>
      <div className="mt-1 flex min-h-[18px] items-center justify-between gap-2">
        {detalhe !== undefined && detalhe !== null && detalhe !== "" ? (
          <span className="truncate text-detalhe text-muted-foreground">{detalhe}</span>
        ) : (
          <span />
        )}
        {chip ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              chip.classe,
            )}
          >
            {IconeChip ? <IconeChip className="size-3" strokeWidth={2.5} /> : null}
            {chip.texto}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2">
        {conteudo}
      </Link>
    );
  }
  return conteudo;
}
