import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Componente de ícone do lucide-react, ex: icone={Inbox}. */
  icone?: LucideIcon;
  titulo: string;
  descricao?: string;
  /** Ação principal do estado vazio (ex: botão de criar). Sempre que fizer sentido, passe uma. */
  acao?: ReactNode;
  className?: string;
}

/**
 * Estado vazio canônico: visual limpo estilo Notion, centralizado,
 * sempre com ação quando houver algo que o usuário possa fazer.
 */
export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-12 text-center",
        className,
      )}
    >
      {Icone ? (
        <Icone className="size-8 text-muted-foreground" aria-hidden="true" />
      ) : null}
      <p className="text-corpo font-medium text-foreground">{titulo}</p>
      {descricao ? (
        <p className="max-w-sm text-detalhe text-muted-foreground">
          {descricao}
        </p>
      ) : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}
