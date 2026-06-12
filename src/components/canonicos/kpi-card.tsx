import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface KPICardProps {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  href?: string;
  className?: string;
}

/**
 * Card canônico de KPI com a Faixa (barra âmbar de 3px na borda esquerda).
 * Com href vira link clicável com hover; sem href é só exibição.
 */
export function KPICard({
  titulo,
  valor,
  detalhe,
  href,
  className,
}: KPICardProps) {
  const conteudo = (
    <div
      className={cn(
        "faixa-esquerda rounded-lg border border-border bg-card p-4",
        href && "transition-colors hover:bg-surface",
        className,
      )}
    >
      <p className="text-legenda uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-1 text-titulo font-semibold tabular-nums text-foreground">
        {valor}
      </p>
      {detalhe !== undefined && detalhe !== null ? (
        <p className="mt-1 text-detalhe text-muted-foreground">{detalhe}</p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {conteudo}
      </Link>
    );
  }

  return conteudo;
}
