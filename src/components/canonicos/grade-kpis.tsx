import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface GradeKpisProps {
  children: ReactNode;
  /** Espaçamento externo da grade, ex. "mb-4". Não mexa nas colunas por aqui. */
  className?: string;
}

/**
 * Grade canônica de KPICards que se adapta à quantidade de cartões.
 *
 * Por que flex e não `grid-cols-3`: num grid fixo um cartão solitário fica
 * pendurado com dois terços da linha vazios (era o caso em Pagamentos, Contas
 * a receber e Contas bancárias). Aqui cada cartão tem base de 16rem e cresce
 * para dividir a linha: 1 ocupa a linha toda, 2 dividem pela metade, 3 ou 4
 * viram grade, e o que não cabe quebra e volta a preencher. Nunca sobra buraco.
 *
 * Por que estilizar `[&>*]` em vez de embrulhar cada filho: fragmento não gera
 * nó no DOM, então `Children.count` mente quando o chamador passa `<>...</>` ou
 * um `.map()` condicional. O seletor de filho direto acerta os cartões nos três
 * casos sem o componente precisar contar nada.
 */
export function GradeKpis({ children, className }: GradeKpisProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-3 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-64",
        className,
      )}
    >
      {children}
    </div>
  );
}
