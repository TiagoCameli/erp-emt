import Link from "next/link";
import type { ReactNode } from "react";

import type { PropsItemDaGrade } from "@/components/canonicos/grade-kpis";
import { cn } from "@/lib/utils";

interface KPICardProps extends PropsItemDaGrade {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  href?: string;
  className?: string;
}

/**
 * Card canônico de KPI com a Faixa (barra âmbar de 3px na borda esquerda).
 * Com href vira link clicável com hover; sem href é só exibição.
 * Use dentro de GradeKpis: é ela que resolve a largura conforme a quantidade.
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
      // A grade acha o KPI por aqui para pôr dois por linha no celular, sem
      // levar os gráficos junto.
      data-kpi=""
      className={cn(
        // Sem `h-full` aqui: como item direto do flex da GradeKpis o cartão já é
        // esticado pelo `align-items: stretch`, e fixar altura de 100% DESLIGA
        // esse esticamento. A porcentagem passa a medir contra a altura da grade,
        // que é indefinida (ela cresce pelo conteúdo), então cada cartão voltava a
        // ter a altura do próprio texto: era por isso que o cartão de detalhe em
        // duas linhas terminava mais abaixo que os vizinhos da mesma fileira.
        //
        // Dentro do Link o `h-full` volta a ser necessário e a funcionar: lá o
        // item de flex é o Link, que fica com altura definida depois do stretch.
        // No celular o card é metade da largura (ver GradeKpis), então aperta o
        // respiro e o tamanho do número para "R$ 1.234.567,89" caber.
        "faixa-esquerda rounded-lg border border-border bg-card p-4 max-md:p-3",
        href && "h-full transition-colors hover:bg-surface",
        className,
      )}
    >
      <p className="text-legenda uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-1 text-titulo font-semibold tabular-nums text-foreground max-md:text-corpo max-md:wrap-anywhere">
        {valor}
      </p>
      {detalhe !== undefined && detalhe !== null ? (
        <p className="mt-1 text-detalhe text-muted-foreground max-md:text-legenda">
          {detalhe}
        </p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg foco-anel"
      >
        {conteudo}
      </Link>
    );
  }

  return conteudo;
}
