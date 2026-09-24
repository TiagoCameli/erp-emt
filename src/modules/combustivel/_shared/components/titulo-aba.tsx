import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TituloAbaProps {
  titulo: ReactNode;
  /** Contagem ao lado do título, como o "Tanques de Combustível (8)" da origem. */
  contagem?: number;
  descricao?: ReactNode;
  acoes?: ReactNode;
  className?: string;
}

/**
 * O título de uma aba do Combustível. O título do módulo, os lançamentos e as abas já estão
 * no layout; a aba só diz o que lista e põe as ações dela à direita.
 */
export function TituloAba({ titulo, contagem, descricao, acoes, className }: TituloAbaProps) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">
          {titulo}
          {contagem !== undefined ? <span className="tabular-nums"> ({contagem})</span> : null}
        </h2>
        {descricao ? <p className="text-detalhe text-muted-foreground">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
