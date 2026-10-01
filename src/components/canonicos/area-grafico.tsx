import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AreaGraficoProps {
  /**
   * Altura do gráfico quando ninguém mexeu, em CSS (ex. "18rem"). É o mínimo:
   * dentro de um card esticado o gráfico cresce até o fundo do card.
   */
  altura: string;
  className?: string;
  children: ReactNode;
}

/**
 * Onde o ResponsiveContainer do Recharts mora. Cresce com o card na grade
 * personalizável e, sem ninguém mexer, tem a mesma altura fixa de antes.
 *
 * Por que o `absolute inset-0` por dentro: o ResponsiveContainer mede a
 * altura do pai em porcentagem, e porcentagem de pai com altura automática
 * (que é o que um item de flex esticado tem) resolve para zero, e o gráfico
 * some. A caixa absoluta mede contra a área já calculada, sempre definida.
 *
 * A grade baixa o mínimo pela variável `--altura-grafico-min` quando a pessoa
 * escolhe uma altura para o card: sem isso o card não conseguiria encolher
 * abaixo da altura padrão do gráfico.
 */
export function AreaGrafico({ altura, className, children }: AreaGraficoProps) {
  return (
    <div
      className={cn("relative w-full flex-1", className)}
      style={{ minHeight: `var(--altura-grafico-min, ${altura})` }}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}
