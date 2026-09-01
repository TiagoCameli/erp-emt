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
import { gerarPlanilhaPagamentos } from "@/modules/financeiro/pagamentos/actions";
import type { ValoresFiltrosAPagar } from "@/modules/financeiro/pagamentos/fila-a-pagar";
import type { FormatoPlanilhaPagamentos } from "@/modules/financeiro/pagamentos/planilha";
import type { FiltrosParcelasPagas } from "@/modules/financeiro/pagamentos/queries";

export interface BotaoExportarPagamentosProps {
  /** Filtros da aba "A pagar", como a página os leu da URL. */
  valoresAPagar: ValoresFiltrosAPagar;
  /** Filtros da aba "Pagas", já validados na página. */
  filtrosPagas: FiltrosParcelasPagas;
}

/**
 * Botão "Exportar Excel" da tela de Pagamentos, nas ações do cabeçalho.
 *
 * Mora no cabeçalho da página, e não na barra da tabela: ação da PÁGINA fica no
 * cabeçalho neste app, e foi lá que o Tiago procurou quando o botão de
 * Lançamentos nasceu na barra da tabela e ele não achou.
 *
 * UM BOTÃO PARA AS DUAS ABAS. O arquivo sai com uma aba "A pagar" e uma "Pagas",
 * cada uma com os filtros da sua aba na tela: a pergunta que motiva exportar
 * ("quanto já saiu e quanto ainda sai desta obra") precisa dos dois lados
 * juntos, e um botão por aba faria trocar de aba para pegar o outro.
 *
 * TRÊS FORMATOS, num menu em vez de três botões: os três exportam o MESMO
 * recorte repartido de outro jeito, não três ações diferentes. Botões lado a
 * lado dariam a entender que exportam coisas diferentes, e quem procura
 * "Exportar Excel" tem que achar um alvo só.
 *
 * Exporta o conjunto FILTRADO inteiro, não a página aberta. Os filtros vêm da
 * página, que é a única a interpretar a URL — a mesma fonte que montou as duas
 * listas, então a planilha e a tela não podem discordar. A busca digitada entra
 * junto com a espera dela (o campo escreve na URL com debounce), igual ao botão
 * de Lançamentos: no instante entre digitar e a URL atualizar, tela e arquivo
 * ainda estão na tecla anterior — os dois, e não um de cada lado.
 */
export function BotaoExportarPagamentos({
  valoresAPagar,
  filtrosPagas,
}: BotaoExportarPagamentosProps) {
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar(formato: FormatoPlanilhaPagamentos) {
    if (exportando) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaPagamentos(
        valoresAPagar,
        filtrosPagas,
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
        {/* O texto abaixo de cada opção diz o que muda no ARQUIVO, não como a
            opção se chama: sem ele, "por centro de custo" e "por rateio"
            parecem dois nomes da mesma coisa, e quem escolhe errado só
            descobre depois de abrir a planilha. */}
        <DropdownMenuItem
          className="flex-col items-start gap-0.5"
          onSelect={() => {
            void aoExportar("pagamento");
          }}
        >
          <span className="font-medium">Uma linha por pagamento</span>
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
            Cada pagamento aberto por obra, juntando as etapas dela.
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
            Desce até a etapa: pagamento rateado vira uma linha para cada parte.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
