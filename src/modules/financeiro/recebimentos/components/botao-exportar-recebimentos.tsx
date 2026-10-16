"use client";

import * as React from "react";
import { ChevronDown, FileSpreadsheet, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaRecebimentos } from "@/modules/financeiro/recebimentos/actions";
import type { ValoresFiltrosAReceber } from "@/modules/financeiro/recebimentos/fila-a-receber";
import type { FormatoPlanilhaRecebimentos } from "@/modules/financeiro/recebimentos/planilha";
import type { FiltrosRecebidas } from "@/modules/financeiro/recebimentos/queries";

export interface BotaoExportarRecebimentosProps {
  /** Filtros da aba "A receber", como a página os leu da URL. */
  valoresAReceber: ValoresFiltrosAReceber;
  /** Filtros da aba "Recebidos", já validados na página. */
  filtrosRecebidas: FiltrosRecebidas;
}

/**
 * Botão "Exportar Excel" da tela de Recebimentos, nas ações do cabeçalho.
 *
 * O espelho de `BotaoExportarPagamentos` (lá estão os porquês): um botão para
 * as duas abas, os três formatos num menu, e o conjunto FILTRADO inteiro, com os
 * filtros que a página leu da URL.
 */
export function BotaoExportarRecebimentos({
  valoresAReceber,
  filtrosRecebidas,
}: BotaoExportarRecebimentosProps) {
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar(formato: FormatoPlanilhaRecebimentos) {
    if (exportando) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaRecebimentos(
        valoresAReceber,
        filtrosRecebidas,
        formato,
      );
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      baixarBase64(resultado.base64, resultado.nomeArquivo);
    } finally {
      setExportando(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={exportando}>
          {exportando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet />
          )}
          Exportar Excel
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-80">
        <DropdownMenuItem
          className="flex-col items-start gap-0.5"
          onSelect={() => {
            void aoExportar("pagamento");
          }}
        >
          <span className="font-medium">Uma linha por recebimento</span>
          <span className="text-legenda text-muted-foreground whitespace-normal">
            O rateio vai resumido em duas colunas.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex-col items-start gap-0.5"
          onSelect={() => {
            void aoExportar("centro");
          }}
        >
          <span className="font-medium">Uma linha por centro de custo</span>
          <span className="text-legenda text-muted-foreground whitespace-normal">
            Cada recebimento aberto por obra, juntando as etapas dela.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex-col items-start gap-0.5"
          onSelect={() => {
            void aoExportar("rateio");
          }}
        >
          <span className="font-medium">Uma linha por rateio</span>
          <span className="text-legenda text-muted-foreground whitespace-normal">
            Desce até a etapa: recebimento rateado vira uma linha para cada parte.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
