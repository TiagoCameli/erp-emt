"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

import { useFiltrosUrl } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaDoRelatorio } from "@/modules/financeiro/relatorios/actions";
import type { RelatorioId } from "@/modules/financeiro/relatorios/relatorios";

/**
 * "Exportar Excel" da aba Relatórios, nas ações do cabeçalho da seção.
 *
 * UM botão para os nove relatórios, e não um por tela: o que muda entre eles é
 * a planilha, não o gesto. Quem exporta o DRE e depois o aging procura o botão
 * no mesmo lugar, e a única coisa que ele precisa saber é que sai o que está
 * na tela.
 *
 * MANDA A QUERY STRING DA URL, que é a mesma que a página leu para montar o
 * relatório. É isso que impede a planilha de discordar da tela: um segundo lugar
 * montando o filtro divergiria no primeiro filtro novo, e ninguém perceberia até
 * alguém somar a planilha e achar outro número. Pelo mesmo motivo o recorte vai
 * ESCRITO no cabeçalho do arquivo — planilha circula por e-mail e é lida semanas
 * depois, quando ninguém lembra que filtro estava aplicado.
 */
export function BotaoExportarRelatorio({
  relatorio,
}: {
  relatorio: RelatorioId;
}) {
  const { query } = useFiltrosUrl();
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar() {
    if (exportando) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaDoRelatorio(relatorio, query);
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
