import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EmptyState, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { ResultadoObra } from "@/modules/gestao/_shared/agregacao";

interface MargemObraListaProps {
  obras: ResultadoObra[];
}

/** Cor da margem: verde quando dá lucro, vermelho quando dá prejuízo. */
function corMargem(valor: number): string {
  return valor >= 0 ? "text-status-aprovado" : "text-status-rejeitado";
}

/**
 * Lista de obras por margem, das piores para as melhores: quem está
 * sangrando aparece no topo. Somente leitura, renderiza no servidor.
 */
export function MargemObraLista({ obras }: MargemObraListaProps) {
  if (obras.length === 0) {
    return (
      <EmptyState
        titulo="Sem obras ativas"
        descricao="Quando houver obras com medições e custos, a margem de cada uma aparece aqui."
        className="border-none bg-transparent"
      />
    );
  }

  const ordenadas = [...obras].sort((a, b) => a.margem - b.margem);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border">
        {ordenadas.map((obra) => (
          <li
            key={obra.obraId}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              {obra.obraLote ? (
                <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
                  {obra.obraLote}
                </span>
              ) : null}
              <span className="text-detalhe font-medium text-foreground">
                {obra.obraNome}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <MoneyText
                valor={obra.margem}
                className={cn("text-detalhe font-medium", corMargem(obra.margem))}
              />
              <span
                className={cn(
                  "text-legenda tabular-nums",
                  corMargem(obra.margem),
                )}
              >
                {formatarPercentual(obra.margemPct)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Link
        href="/gestao/painel-obra"
        className="inline-flex items-center gap-1 text-detalhe text-muted-foreground hover:text-foreground hover:underline"
      >
        Ver painel por obra
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
