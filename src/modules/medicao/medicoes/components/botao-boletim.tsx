"use client";

import * as React from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { gerarBoletim } from "@/modules/medicao/medicoes/actions";

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Converte o base64 da Server Action num Blob para download no navegador. */
function base64ParaBlob(base64: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new Blob([bytes], { type: MIME_XLSX });
}

export interface BotaoBoletimProps {
  medicaoId: string;
}

/**
 * Botão "Exportar boletim": chama a Server Action que gera o .xlsx e baixa o
 * arquivo a partir do base64 retornado. Disponível em qualquer status.
 */
export function BotaoBoletim({ medicaoId }: BotaoBoletimProps) {
  const [gerando, setGerando] = React.useState(false);

  async function aoExportar() {
    if (gerando) return;
    setGerando(true);
    try {
      const resultado = await gerarBoletim(medicaoId);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }

      const blob = base64ParaBlob(resultado.base64);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resultado.nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
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
      Exportar boletim
    </Button>
  );
}
