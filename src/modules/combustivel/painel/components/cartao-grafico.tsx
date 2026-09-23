import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * O ChartCard da origem: moldura, título, subtítulo e ações à direita, e a área do gráfico
 * com altura fixa (o gráfico do Recharts mede o pai). Serve servidor e cliente.
 */
export function CartaoGrafico({
  titulo,
  subtitulo,
  acoes,
  altura = 300,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  /** Altura da área do gráfico, em px. */
  altura?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{titulo}</h3>
          {subtitulo ? <p className="mt-0.5 truncate text-detalhe text-muted-foreground">{subtitulo}</p> : null}
        </div>
        {acoes ? <div className="flex shrink-0 items-center gap-1.5">{acoes}</div> : null}
      </div>
      <div className="px-2 pb-3" style={{ height: altura }}>
        {children}
      </div>
    </section>
  );
}

/** O EmptyState dos gráficos da origem, sem moldura (o cartão já tem). */
export function GraficoVazio({ texto = "Nenhuma saída no período" }: { texto?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{texto}</p>
      <p className="text-detalhe text-muted-foreground">Escolha outro período ou mude os filtros</p>
    </div>
  );
}

/** O alternador segmentado da origem (Dia/Semana/Mês, Litros/R$). */
export function Alternador<T extends string>({
  opcoes,
  valor,
  onValorChange,
  rotulo,
}: {
  opcoes: readonly { id: T; rotulo: string }[];
  valor: T;
  onValorChange: (valor: T) => void;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex overflow-hidden rounded-md border border-border text-legenda">
      {opcoes.map((opcao) => (
        <button
          key={opcao.id}
          type="button"
          aria-pressed={valor === opcao.id}
          onClick={() => onValorChange(opcao.id)}
          className={cn(
            "px-2.5 py-1 transition-colors",
            valor === opcao.id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  );
}
