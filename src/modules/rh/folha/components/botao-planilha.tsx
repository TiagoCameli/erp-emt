"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { gerarPlanilhaFolha } from "@/modules/rh/folha/actions";

export interface BotaoPlanilhaProps {
  folhaId: string;
}

/**
 * Botão "Exportar Excel": chama a Server Action que gera a planilha gerencial
 * da folha em .xlsx e baixa o arquivo a partir do base64 retornado. Disponível
 * em qualquer status.
 */
export function BotaoPlanilha({ folhaId }: BotaoPlanilhaProps) {
  const [gerando, setGerando] = React.useState(false);

  async function aoExportar() {
    if (gerando) return;
    setGerando(true);
    try {
      const resultado = await gerarPlanilhaFolha(folhaId);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }

      baixarBase64(resultado.base64, resultado.nomeArquivo);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={gerando}
      onClick={aoExportar}
    >
      {gerando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileSpreadsheet />
      )}
      Exportar Excel
    </Button>
  );
}
