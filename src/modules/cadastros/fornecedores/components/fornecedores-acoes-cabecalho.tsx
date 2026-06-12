"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/fornecedores/actions";
import { FornecedoresFormDrawer } from "./fornecedores-form-drawer";

export interface FornecedoresAcoesCabecalhoProps {
  podeCriar: boolean;
}

/**
 * Ações do cabeçalho da página de fornecedores: importar planilha e novo
 * fornecedor. O botão "Novo" abre o drawer de cadastro em branco.
 */
export function FornecedoresAcoesCabecalho({
  podeCriar,
}: FornecedoresAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);

  if (!podeCriar) return null;

  return (
    <>
      <ImportarCadastro
        titulo="Importar fornecedores"
        modeloHref="/cadastros/fornecedores/modelo"
        validarAction={validarImport}
        importarAction={importar}
      />
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus />
        Novo fornecedor
      </Button>

      <FornecedoresFormDrawer
        key={aberto ? "novo-aberto" : "novo-fechado"}
        aberto={aberto}
        onAbertoChange={setAberto}
        fornecedor={null}
      />
    </>
  );
}
