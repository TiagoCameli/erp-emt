"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaBoletim } from "@/modules/medicao/boletim/actions";

/**
 * "Exportar Excel" do boletim, nas ações do cabeçalho da página (como no Financeiro). Exporta o
 * mesmo recorte da tela: o contrato e a Nª que a tela MOSTRA (`boletim.ate`), não o `?ate=` da URL:
 * em "Última" a URL não tem número, e uma medição aberta entre carregar a tela e clicar faria o
 * xlsx sair até a N+1 com a tela na Nª. `ate` nulo só sobra para contrato sem medição nenhuma.
 * A busca e o filtro por grupo da tabela não entram: o boletim exportado é o do contrato inteiro.
 * Sem contrato escolhido, ou com `motivoDesabilitado` (boletim que não montou: exportar só
 * repetiria o erro da RPC), fica desabilitado.
 */
export function BotaoExportarBoletim({
  contratoId,
  ate,
  motivoDesabilitado,
}: {
  contratoId: string;
  ate: number | null;
  motivoDesabilitado?: string;
}) {
  const desabilitado = !contratoId || motivoDesabilitado !== undefined;
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar() {
    if (exportando || desabilitado) return;
    setExportando(true);
    try {
      const resultado = await gerarPlanilhaBoletim(contratoId, ate);
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
      disabled={exportando || desabilitado}
      title={!contratoId ? "Escolha o contrato para exportar" : motivoDesabilitado}
      onClick={() => {
        void aoExportar();
      }}
    >
      {exportando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet />}
      Exportar Excel
    </Button>
  );
}
