"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { ImportDialog, type ResumoValidacao } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  importarItens,
  validarImportItens,
} from "@/modules/medicao/planilha-contratual/actions";

export interface ImportarItensProps {
  /** Planilha que recebe os itens importados. */
  planilhaId: string;
}

/**
 * Botão "Importar itens" que abre o ImportDialog canônico. Guarda o arquivo
 * escolhido e delega a validação e a importação às server actions da planilha,
 * fixando o planilhaId.
 */
export function ImportarItens({ planilhaId }: ImportarItensProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const arquivoRef = React.useRef<File | null>(null);

  function baixarModelo() {
    const ancora = document.createElement("a");
    ancora.href = "/medicao/planilha-contratual/modelo";
    ancora.download = "";
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();
  }

  async function validarArquivo(arquivo: File): Promise<ResumoValidacao> {
    arquivoRef.current = arquivo;
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    return validarImportItens(formData);
  }

  async function confirmarImportacao(): Promise<{ importadas: number }> {
    const arquivo = arquivoRef.current;
    if (!arquivo) {
      throw new Error(
        "Nenhum arquivo selecionado. Escolha o arquivo novamente.",
      );
    }
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    const resultado = await importarItens(planilhaId, formData);
    if ("erro" in resultado) {
      throw new Error(resultado.erro);
    }
    router.refresh();
    return { importadas: resultado.importadas };
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Upload />
        Importar itens
      </Button>
      <ImportDialog
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Importar itens contratuais"
        onBaixarModelo={baixarModelo}
        onValidarArquivo={validarArquivo}
        onConfirmarImportacao={confirmarImportacao}
      />
    </>
  );
}
