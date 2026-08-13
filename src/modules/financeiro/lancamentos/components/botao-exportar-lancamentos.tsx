"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaLancamentos } from "@/modules/financeiro/lancamentos/actions";

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
 */
export function BotaoExportarLancamentos() {
  const { query } = useFiltrosUrl();
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar() {
    if (exportando) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaLancamentos(query);
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={exportando}
      onClick={aoExportar}
    >
      {exportando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileSpreadsheet />
      )}
      Exportar Excel
    </Button>
  );
}
