import type { ReactNode } from "react";

export interface PageHeaderProps {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}

export function PageHeader({ titulo, descricao, acoes }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-titulo font-semibold">{titulo}</h1>
        {descricao ? (
          <p className="text-detalhe text-muted-foreground">{descricao}</p>
        ) : null}
      </div>
      {acoes ? (
        <div className="flex shrink-0 items-center gap-2">{acoes}</div>
      ) : null}
    </div>
  );
}
