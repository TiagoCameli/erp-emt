"use client";

import * as React from "react";
import { ChevronDown, FileSpreadsheet, LoaderCircle } from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaLancamentos } from "@/modules/financeiro/lancamentos/actions";
import type { FormatoPlanilhaLancamentos } from "@/modules/financeiro/lancamentos/actions";

/**
 * Botão "Exportar Excel" da listagem de lançamentos, nas ações do cabeçalho.
 *
 * Mora ao lado de "Novo lançamento", e não na barra da tabela, porque é lá que se
 * procura. O `DataTable` canônico tem uma prop `exportar` que desenha o botão
 * junto dos menus Filtros/Altura/Colunas, e na primeira versão foi ela que eu
 * usei: o botão existia e funcionava, mas ficou na ponta direita da barra
 * parecendo mais um menu de tabela, e o Tiago não achou. Ação da PÁGINA fica no
 * cabeçalho neste app, e é o que a folha do RH já faz com o botão dela
 * (`BotaoPlanilha`, na linha de "Regerar" e "Enviar para aprovação").
 *
 * Exporta o conjunto FILTRADO inteiro, não a página aberta. Manda a query string
 * da URL, que é a MESMA que a página leu para montar a lista, então a planilha e
 * a tela não podem discordar. Inclui a espera da busca digitada, e isso está
 * certo: a lista também só muda quando a busca chega na URL, então as duas andam
 * juntas.
 *
 * DOIS FORMATOS, num menu em vez de dois botões: o segundo é o mesmo recorte
 * repartido de outro jeito, não uma segunda ação da página. Dois botões lado a
 * lado dariam a entender que exportam coisas diferentes, e quem procura
 * "Exportar Excel" tem que achar um alvo só.
 */
export function BotaoExportarLancamentos() {
  const { query } = useFiltrosUrl();
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar(formato: FormatoPlanilhaLancamentos) {
    if (exportando) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaLancamentos(query, formato);
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
        {/* O texto abaixo de cada opção diz o que muda no ARQUIVO, não o que a
            opção se chama: sem ele, "por lançamento" e "por centro de custo"
            parecem dois nomes da mesma coisa, e quem escolhe errado só descobre
            depois de abrir a planilha. */}
        <DropdownMenuItem
          className="flex-col items-start gap-0.5"
          onSelect={() => {
            void aoExportar("lancamento");
          }}
        >
          <span className="font-medium">Uma linha por lançamento</span>
          <span className="text-legenda text-muted-foreground whitespace-normal">
            O rateio vai resumido em duas colunas.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex-col items-start gap-0.5"
          onSelect={() => {
            void aoExportar("rateio");
          }}
        >
          <span className="font-medium">Uma linha por centro de custo</span>
          <span className="text-legenda text-muted-foreground whitespace-normal">
            O lançamento rateado se abre em uma linha por obra ou etapa, com a
            fatia de cada uma na coluna que soma.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
