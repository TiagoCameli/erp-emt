import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";

import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { LIMIAR_AVISO_SENTINELA_PCT } from "@/modules/combustivel/painel/calculo";

/**
 * O SentinelBanner da origem: mais de 10% do volume do recorte está em "Outros" (sem
 * equipamento identificado). Calculado sobre as mesmas saídas dos KPIs e gráficos, então
 * filtrar por um equipamento real some com o aviso. Só no modo próprios (quem chama decide).
 */
export function AvisoSentinela({
  volumeTotal,
  volumeSentinela,
  hrefAtribuir,
}: {
  volumeTotal: number;
  volumeSentinela: number;
  /** "Atribuir agora"; sem permissão de atribuir, `null` esconde o link. */
  hrefAtribuir: string | null;
}) {
  if (volumeTotal <= 0) return null;
  const pct = (volumeSentinela / volumeTotal) * 100;
  if (pct < LIMIAR_AVISO_SENTINELA_PCT) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-lg border border-emt-amarelo/40 bg-emt-amarelo/10 px-4 py-2.5"
    >
      <AlertCircle className="size-4 shrink-0 text-status-pendente" />
      <p className="flex-1 text-sm text-foreground">
        <span className="font-semibold tabular-nums">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span> do
        volume no escopo atual (<span className="tabular-nums">{formatarLitros(volumeSentinela)}</span>) está sem
        equipamento identificado. Atribuir retroativamente melhora o cálculo de consumo e R$/L por equipamento.
      </p>
      {hrefAtribuir ? (
        <Link
          href={hrefAtribuir}
          className="inline-flex items-center gap-1 whitespace-nowrap text-legenda font-semibold text-status-pendente hover:underline"
        >
          Atribuir agora <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
