import { formatarPercentual } from "@/lib/formatadores";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { percentualDoNivel } from "@/modules/combustivel/tanques/calculo";

export interface NivelTanqueProps {
  nivel: number;
  capacidade: number;
  ehExterno: boolean;
}

/**
 * Nível do tanque: litros (2 casas, sempre) e uma barra fina com o percentual
 * da capacidade. O número é o dado; a barra só ajuda a ler de relance, e some
 * quando não há capacidade cadastrada. Tanque de terceiro não tem estoque.
 */
export function NivelTanque({ nivel, capacidade, ehExterno }: NivelTanqueProps) {
  if (ehExterno) {
    return <span className="text-muted-foreground">Tanque de terceiro, sem estoque</span>;
  }

  const percentual = percentualDoNivel(nivel, capacidade);

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      {percentual !== null ? (
        <div
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Nível do tanque"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percentual)}
          aria-valuetext={`${formatarPercentual(percentual, 0)} da capacidade`}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
        </div>
      ) : null}
      <span className="tabular-nums">{formatarLitros(nivel)}</span>
    </div>
  );
}
