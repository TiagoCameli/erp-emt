"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { ImportDialog, type ResumoValidacao } from "@/components/canonicos";
import { Button } from "@/components/ui/button";

export interface ImportarCadastroProps {
  /** Título do diálogo, ex: "Importar fornecedores". */
  titulo: string;
  /** Rota do route handler que devolve o modelo .xlsx, ex: "/cadastros/fornecedores/modelo". */
  modeloHref: string;
  /** Server action que lê e valida o arquivo enviado em formData (campo "arquivo"). */
  validarAction: (formData: FormData) => Promise<ResumoValidacao>;
  /** Server action que insere as linhas válidas do arquivo enviado em formData. */
  importarAction: (
    formData: FormData,
  ) => Promise<{ importadas: number } | { erro: string }>;
  /** Chamado após uma importação concluída. Padrão: router.refresh(). */
  aoConcluir?: () => void;
}

/**
 * Wrapper compartilhado dos cadastros: um botão "Importar planilha" que abre o
 * ImportDialog canônico. Guarda o arquivo escolhido e delega validação e
 * importação às server actions de cada cadastro.
 */
export function ImportarCadastro({
  titulo,
  modeloHref,
  validarAction,
  importarAction,
  aoConcluir,
}: ImportarCadastroProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const arquivoRef = React.useRef<File | null>(null);

  function baixarModelo() {
    const ancora = document.createElement("a");
    ancora.href = modeloHref;
    ancora.download = "";
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();
  }

  async function validarArquivo(arquivo: File): Promise<ResumoValidacao> {
    arquivoRef.current = arquivo;
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    return validarAction(formData);
  }

  async function confirmarImportacao(): Promise<{ importadas: number }> {
    const arquivo = arquivoRef.current;
    if (!arquivo) {
      throw new Error("Nenhum arquivo selecionado. Escolha o arquivo novamente.");
    }
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    const resultado = await importarAction(formData);
    if ("erro" in resultado) {
      throw new Error(resultado.erro);
    }
    if (aoConcluir) {
      aoConcluir();
    } else {
      router.refresh();
    }
    return { importadas: resultado.importadas };
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Upload />
        Importar planilha
      </Button>
      <ImportDialog
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={titulo}
        onBaixarModelo={baixarModelo}
        onValidarArquivo={validarArquivo}
        onConfirmarImportacao={confirmarImportacao}
      />
    </>
  );
}
