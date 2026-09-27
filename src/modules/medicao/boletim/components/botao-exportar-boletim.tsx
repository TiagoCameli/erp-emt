"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaBoletim } from "@/modules/medicao/boletim/actions";

/**
 * "Exportar Excel" do boletim, nas ações do cabeçalho da página (como no Financeiro). Exporta o
 * mesmo recorte da tela: o contrato e o "até a Nª" da URL (`ate` nulo = última medição). A busca e
 * o filtro por grupo da tabela não entram: o boletim exportado é o do contrato inteiro.
 * Sem contrato escolhido, fica desabilitado.
 */
export function BotaoExportarBoletim({ contratoId, ate }: { contratoId: string; ate: number | null }) {
  const [exportando, setExportando] = React.useState(false);

  async function aoExportar() {
    if (exportando || !contratoId) return;
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
      disabled={exportando || !contratoId}
      title={contratoId ? undefined : "Escolha o contrato para exportar"}
      onClick={() => {
        void aoExportar();
      }}
    >
      {exportando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet />}
      Exportar Excel
    </Button>
  );
}
