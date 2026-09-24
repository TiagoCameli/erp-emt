"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { ImportDialog, type ResumoValidacao } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";

export type ResultadoImportacaoFrete =
  | { importadas: number; itens?: number; falhas: { linha: number; erro: string }[] }
  | { erro: string };

/** O aviso das linhas que o banco recusou, com o número da linha e o motivo. */
export function mensagemDeFalhas(falhas: readonly { linha: number; erro: string }[], importadas: number): string {
  const lista = falhas.map((f) => `linha ${f.linha}: ${f.erro}`).join("; ");
  return `${importadas} ${importadas === 1 ? "registro gravado" : "registros gravados"}, ${falhas.length} ${
    falhas.length === 1 ? "linha recusada" : "linhas recusadas"
  } pelo banco (${lista})`;
}

export interface ImportarPlanilhaFreteProps {
  titulo: string;
  /** Rota do route handler que devolve o modelo .xlsx. */
  modeloHref: string;
  validarAction: (formData: FormData) => Promise<ResumoValidacao>;
  importarAction: (formData: FormData) => Promise<ResultadoImportacaoFrete>;
  /** Toast de sucesso da origem (ex.: "3 pedidos importados com sucesso (7 itens)"). */
  mensagemSucesso?: (importadas: number, itens: number) => string;
}

/**
 * Botão "Importar planilha" do Frete, com o ImportDialog canônico. Diferente do
 * `ImportarCadastro`, a gravação é linha a linha pela RPC: uma linha recusada pelo banco
 * não derruba as outras, e a tela avisa quais foram.
 */
export function ImportarPlanilhaFrete({
  titulo,
  modeloHref,
  validarAction,
  importarAction,
  mensagemSucesso,
}: ImportarPlanilhaFreteProps) {
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
    if (!arquivo) throw new Error("Nenhum arquivo selecionado. Escolha o arquivo novamente.");
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    const resultado = await importarAction(formData);
    if ("erro" in resultado) throw new Error(resultado.erro);
    if (resultado.falhas.length > 0) {
      if (resultado.importadas === 0) throw new Error(mensagemDeFalhas(resultado.falhas, 0));
      toast.error(mensagemDeFalhas(resultado.falhas, resultado.importadas), { duration: 15000 });
    } else if (mensagemSucesso) {
      toast.success(mensagemSucesso(resultado.importadas, resultado.itens ?? resultado.importadas));
    }
    semDerrubarSucesso("frete.importar.refresh", () => router.refresh());
    return { importadas: resultado.importadas };
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
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
