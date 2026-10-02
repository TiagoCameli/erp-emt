import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";

/** Valor com sinal e cor: crédito verde (entrada), débito vermelho (saída). */
export function ValorMovimento({ valor }: { valor: number }) {
  const credito = valor >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        credito ? "text-status-aprovado" : "text-status-rejeitado",
      )}
    >
      {credito ? (
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <MoneyText valor={Math.abs(valor)} />
    </span>
  );
}
