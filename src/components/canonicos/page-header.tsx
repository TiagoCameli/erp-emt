import type { ReactNode } from "react";

export interface PageHeaderProps {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  /** Nome do módulo, ex. "Financeiro". Vira a sobrancelha acima do título. */
  modulo?: string;
}

/**
 * Cabeçalho canônico de aba. A sobrancelha existe porque a sidebar é só de
 * ícones e não há breadcrumb: com 9 módulos e 51 abas, "Lançamentos" sozinho
 * não diz de onde a pessoa está lendo. É opcional para não quebrar as telas
 * que já usam o componente sem ela.
 */
export function PageHeader({
  titulo,
  descricao,
  acoes,
  modulo,
}: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {modulo ? (
          <p className="text-legenda font-medium uppercase tracking-wide text-muted-foreground">
            {modulo}
          </p>
        ) : null}
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
