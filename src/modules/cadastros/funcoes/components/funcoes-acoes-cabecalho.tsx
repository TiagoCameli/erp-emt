"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/funcoes/actions";
import { FuncaoFormDrawer } from "./funcao-form-drawer";

export interface FuncoesAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho da tela de funções: importar planilha (quando pode
 * criar) e o botão "Nova função" que abre o drawer de criação.
 */
export function FuncoesAcoesCabecalho({
  podeCriar,
}: FuncoesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar funções"
        modeloHref="/cadastros/funcoes/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova função
      </Button>
      <FuncaoFormDrawer aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}
